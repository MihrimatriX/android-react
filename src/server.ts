import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import type { Server, ServerWebSocket } from "bun";
import { bad, DEVICE, done, FIRST_NUMBER, proxy, ranged, validPath } from "./http";
import index from "./index.html";

type Socket = ServerWebSocket<{ number: string }>;
type Req = Request & { params: Record<string, string> };
type Handler = (req: Req, path: string) => Response | Promise<Response>;

// Rejects unknown device ids and, for file routes, unsafe paths before any SQL runs.
function checked(handler: Handler, needsPath = false) {
  return (req: Req) => {
    const path = new URL(req.url).searchParams.get("path");
    if (!DEVICE.test(req.params.device ?? "") || (needsPath && !validPath(path))) return bad();
    return handler(req, path ?? "");
  };
}

export function createServer(options: { port?: number; dbPath?: string } = {}): Server<{ number: string }> {
  if (!options.dbPath) mkdirSync("data", { recursive: true });
  const db = new Database(options.dbPath ?? "data/webdroid.sqlite", { create: true, strict: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run("CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, number TEXT UNIQUE)");
  db.run("CREATE TABLE IF NOT EXISTS kv (device TEXT, key TEXT, value TEXT, PRIMARY KEY (device, key))");
  db.run("CREATE TABLE IF NOT EXISTS files (device TEXT, path TEXT, mime TEXT, size INTEGER, mtime INTEGER, data BLOB, PRIMARY KEY (device, path))");
  db.run("CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY, number TEXT, body TEXT)");

  const numberOf = (device: string): string => {
    const found = db.query<{ number: string }, [string]>("SELECT number FROM devices WHERE id = ?").get(device);
    if (found) return found.number;
    const count = db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM devices").get()?.n ?? 0;
    const number = String(FIRST_NUMBER + count);
    db.query("INSERT INTO devices (id, number) VALUES (?, ?)").run(device, number);
    return number;
  };
  const knownNumber = (number: string) => !!db.query("SELECT 1 FROM devices WHERE number = ?").get(number);
  const under = "device = ? AND (path = ? OR path LIKE ? || '/%')";

  const server = Bun.serve({
    port: options.port ?? Number(process.env.PORT ?? 4321),
    development: process.env.NODE_ENV !== "production" && { hmr: true, console: true },
    routes: {
      "/": index,
      // Social preview named by og:image in index.html; HTML imports only bundle <script> and <link> assets.
      "/og.jpg": new Response(Bun.file(`${import.meta.dir}/og.jpg`)),
      "/api/device/:device": checked(req => Response.json({ number: numberOf(req.params.device) })),
      "/api/kv/:device": {
        GET: checked(req => {
          const rows = db.query<{ key: string; value: string }, [string]>("SELECT key, value FROM kv WHERE device = ?").all(req.params.device);
          return Response.json(Object.fromEntries(rows.map(row => [row.key, row.value])));
        }),
        DELETE: checked(req => {
          const prefix = new URL(req.url).searchParams.get("prefix") ?? "";
          db.query("DELETE FROM kv WHERE device = ? AND substr(key, 1, length(?)) = ?").run(req.params.device, prefix, prefix);
          return done();
        }),
      },
      "/api/kv/:device/:key": {
        PUT: checked(async req => {
          db.query("INSERT OR REPLACE INTO kv VALUES (?, ?, ?)").run(req.params.device, req.params.key, await req.text());
          return done();
        }),
        DELETE: checked(req => {
          db.query("DELETE FROM kv WHERE device = ? AND key = ?").run(req.params.device, req.params.key);
          return done();
        }),
      },
      "/api/files/:device": {
        GET: checked(req => Response.json(db.query("SELECT path, mime, size, mtime FROM files WHERE device = ? ORDER BY path").all(req.params.device))),
        DELETE: checked(req => {
          db.query("DELETE FROM files WHERE device = ?").run(req.params.device);
          return done();
        }),
      },
      "/api/files/:device/raw": {
        GET: checked((req, path) => {
          const row = db
            .query<{ mime: string; data: Uint8Array<ArrayBuffer> | null }, [string, string]>("SELECT mime, data FROM files WHERE device = ? AND path = ?")
            .get(req.params.device, path);
          return row ? ranged(req, row.data ?? new Uint8Array(), row.mime) : new Response("not found", { status: 404 });
        }, true),
        PUT: checked(async (req, path) => {
          const data = new Uint8Array(await req.arrayBuffer());
          const entry = { path, mime: req.headers.get("content-type") ?? "application/octet-stream", size: data.length, mtime: Date.now() };
          db.query("INSERT OR REPLACE INTO files VALUES (?, ?, ?, ?, ?, ?)").run(req.params.device, path, entry.mime, entry.size, entry.mtime, data);
          return Response.json(entry);
        }, true),
        DELETE: checked((req, path) => {
          db.query(`DELETE FROM files WHERE ${under}`).run(req.params.device, path, path);
          return done();
        }, true),
      },
      "/api/files/:device/op": {
        POST: checked(async req => {
          const body = (await req.json().catch(() => null)) as { op?: string; from?: string; to?: string } | null;
          const { from, to } = body ?? {};
          if (!validPath(from) || !validPath(to) || to === from || to.startsWith(from + "/")) return bad();
          const { device } = req.params;
          const renamed = "? || substr(path, length(?) + 1)";
          db.transaction(() => {
            db.query(`DELETE FROM files WHERE ${under}`).run(device, to, to);
            if (body?.op === "move") db.query(`UPDATE files SET path = ${renamed}, mtime = ? WHERE ${under}`).run(to, from, Date.now(), device, from, from);
            else db.query(`INSERT INTO files SELECT device, ${renamed}, mime, size, ?, data FROM files WHERE ${under}`).run(to, from, Date.now(), device, from, from);
          })();
          return done();
        }),
      },
      "/api/proxy": (req: Request) => proxy(new URL(req.url).searchParams.get("url")),
    },
    fetch(req, server) {
      const url = new URL(req.url);
      const device = url.searchParams.get("device") ?? "";
      if (url.pathname === "/ws" && DEVICE.test(device) && server.upgrade(req, { data: { number: numberOf(device) } })) return;
      return new Response("not found", { status: 404 });
    },
    websocket: {
      data: {} as { number: string },
      open(ws: Socket) {
        ws.subscribe(`dev:${ws.data.number}`);
        const pending = db.query<{ body: string }, [string]>("SELECT body FROM outbox WHERE number = ? ORDER BY id").all(ws.data.number);
        for (const row of pending) ws.send(row.body);
        db.query("DELETE FROM outbox WHERE number = ?").run(ws.data.number);
      },
      message(ws: Socket, raw) {
        const msg = JSON.parse(String(raw)) as { to: string; ref?: string; queue?: boolean; intent: unknown };
        const body = JSON.stringify({ from: ws.data.number, intent: msg.intent });
        const known = knownNumber(msg.to);
        const online = server.subscriberCount(`dev:${msg.to}`) > 0;
        if (online) server.publish(`dev:${msg.to}`, body);
        else if (msg.queue && known) db.query("INSERT INTO outbox (number, body) VALUES (?, ?)").run(msg.to, body);
        const ok = online || (!!msg.queue && known);
        const error = known ? "offline" : "unknown";
        ws.send(JSON.stringify({ ack: msg.ref, ok, error: ok ? undefined : error }));
      },
    },
  });
  return server;
}

if (import.meta.main) console.log(`WebDroid → ${createServer().url}`);
