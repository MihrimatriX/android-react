// GitHub Pages has no server, so this worker answers the /api routes of src/server.ts from IndexedDB.
// It intercepts <img>/<audio>/<video> sources too, which is why the app code needs no static-mode branches.
import { bad, DEVICE, done, FIRST_NUMBER, proxy, ranged, validPath } from "../http";

// tsconfig loads the DOM lib rather than WebWorker, so only the worker APIs used here are typed.
type FetchEvent = Event & { request: Request; respondWith(response: Promise<Response>): void };
type ExtendableEvent = Event & { waitUntil(promise: Promise<unknown>): void };
const worker = self as unknown as { skipWaiting(): Promise<void>; clients: { claim(): Promise<void> } };

type FileRow = { device: string; path: string; mime: string; size: number; mtime: number; data: Blob };

const opened = new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open("webdroid", 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    db.createObjectStore("devices", { keyPath: "id" }).createIndex("number", "number", { unique: true });
    db.createObjectStore("kv", { keyPath: ["device", "key"] });
    db.createObjectStore("files", { keyPath: ["device", "path"] });
    db.createObjectStore("outbox", { autoIncrement: true }).createIndex("number", "number");
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const result = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
const committed = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
// A transaction closes once the event loop is idle, so request bodies are read before one is opened.
const transaction = async (stores: string[], mode: IDBTransactionMode = "readwrite") => (await opened).transaction(stores, mode);
// [device] sorts before every [device, key] and [device, []] after them, because arrays sort after strings.
const ofDevice = (device: string) => IDBKeyRange.bound([device], [device, []]);
const isUnder = (path: string, dir: string) => path === dir || path.startsWith(`${dir}/`);

async function numberOf(device: string): Promise<string> {
  const devices = (await transaction(["devices"])).objectStore("devices");
  const found = await result<{ number: string } | undefined>(devices.get(device));
  if (found) return found.number;
  const number = String(FIRST_NUMBER + (await result(devices.count())));
  devices.put({ id: device, number });
  await committed(devices.transaction);
  return number;
}

async function kv(req: Request, device: string, key: string, prefix: string): Promise<Response> {
  const value = req.method === "PUT" ? await req.text() : "";
  const store = (await transaction(["kv"])).objectStore("kv");
  if (req.method === "GET" && !key) {
    const rows = await result<Array<{ key: string; value: string }>>(store.getAll(ofDevice(device)));
    return Response.json(Object.fromEntries(rows.map(row => [row.key, row.value])));
  }
  if (req.method === "PUT" && key) store.put({ device, key, value });
  else if (req.method === "DELETE" && key) store.delete([device, key]);
  else if (req.method === "DELETE") {
    const keys = (await result(store.getAllKeys(ofDevice(device)))) as Array<[string, string]>;
    for (const entry of keys) if (entry[1].startsWith(prefix)) store.delete(entry);
  } else return bad();
  await committed(store.transaction);
  return done();
}

async function files(req: Request, device: string, action: string, path: string | null): Promise<Response> {
  const body = req.method === "PUT" || req.method === "POST" ? await req.blob() : null;
  const op = action === "op" ? ((await body?.text().then(JSON.parse).catch(() => null)) as { op?: string; from?: string; to?: string } | null) : null;
  const store = (await transaction(["files"], req.method === "GET" ? "readonly" : "readwrite")).objectStore("files");
  const rows = () => result<FileRow[]>(store.getAll(ofDevice(device)));

  if (!action && req.method === "GET") return Response.json((await rows()).map(({ path, mime, size, mtime }) => ({ path, mime, size, mtime })));
  if (!action && req.method === "DELETE") store.delete(ofDevice(device));
  else if (action === "raw" && validPath(path)) {
    if (req.method === "GET") {
      const row = await result<FileRow | undefined>(store.get([device, path]));
      return row ? ranged(req, new Uint8Array(await row.data.arrayBuffer()), row.mime) : new Response("not found", { status: 404 });
    }
    if (req.method === "PUT" && body) {
      const entry = { path, mime: req.headers.get("content-type") ?? "application/octet-stream", size: body.size, mtime: Date.now() };
      store.put({ device, ...entry, data: body });
      await committed(store.transaction);
      return Response.json(entry);
    }
    if (req.method !== "DELETE") return bad();
    for (const row of await rows()) if (isUnder(row.path, path)) store.delete([device, row.path]);
  } else if (action === "op" && req.method === "POST") {
    const { from, to } = op ?? {};
    if (!validPath(from) || !validPath(to) || to === from || to.startsWith(from + "/")) return bad();
    const all = await rows();
    // Same order as the server: clear the destination first, then move or copy what is left under `from`.
    for (const row of all) if (isUnder(row.path, to)) store.delete([device, row.path]);
    for (const row of all.filter(row => isUnder(row.path, from) && !isUnder(row.path, to))) {
      if (op?.op === "move") store.delete([device, row.path]);
      store.put({ ...row, path: to + row.path.slice(from.length), mtime: Date.now() });
    }
  } else return bad();
  await committed(store.transaction);
  return done();
}

// Stands in for the server's outbox table: GET drains this number's queue, HEAD checks it exists, POST queues a message.
async function outbox(req: Request, number: string): Promise<Response> {
  const body = req.method === "POST" ? await req.text() : "";
  const tx = await transaction(["devices", "outbox"]);
  const queue = tx.objectStore("outbox").index("number");
  if (req.method === "GET") {
    const [keys, rows] = await Promise.all([result(queue.getAllKeys(number)), result<Array<{ body: string }>>(queue.getAll(number))]);
    for (const key of keys) tx.objectStore("outbox").delete(key);
    await committed(tx);
    return Response.json(rows.map(row => row.body));
  }
  if (!(await result(tx.objectStore("devices").index("number").count(number)))) return new Response("unknown", { status: 404 });
  if (req.method === "POST") tx.objectStore("outbox").add({ number, body });
  await committed(tx);
  return done();
}

async function route(req: Request, url: URL): Promise<Response> {
  const [kind = "", device = "", rest = ""] = url.pathname.slice("/api/".length).split("/");
  if (kind === "proxy") return proxy(url.searchParams.get("url"), {});
  if (!DEVICE.test(device)) return bad();
  if (kind === "device") return Response.json({ number: await numberOf(device) });
  if (kind === "kv") return kv(req, device, decodeURIComponent(rest), url.searchParams.get("prefix") ?? "");
  if (kind === "files") return files(req, device, rest, url.searchParams.get("path"));
  if (kind === "outbox") return outbox(req, device);
  return new Response("not found", { status: 404 });
}

addEventListener("install", () => void worker.skipWaiting());
addEventListener("activate", event => (event as ExtendableEvent).waitUntil(worker.clients.claim()));
// A hard reload leaves the page uncontrolled; src/static/client.ts then asks to be claimed.
addEventListener("message", () => void worker.clients.claim());
addEventListener("fetch", event => {
  const { request } = event as FetchEvent;
  const url = new URL(request.url);
  if (url.origin === location.origin && url.pathname.startsWith("/api/")) (event as FetchEvent).respondWith(route(request, url));
});
