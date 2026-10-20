declare const WEBDROID_STATIC: true | undefined;

/** True in the GitHub Pages build (scripts/pages.ts), where sw.ts and Radio stand in for src/server.ts. */
export const STATIC = typeof WEBDROID_STATIC !== "undefined";

/** Resolves once sw.js controls the page, so the very first /api request already reaches it. */
export async function startStaticServer(): Promise<void> {
  if (!STATIC) return;
  const registration = await navigator.serviceWorker.register("./sw.js");
  await navigator.serviceWorker.ready;
  if (navigator.serviceWorker.controller) return;
  const controlled = new Promise(resolve => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
  registration.active?.postMessage("claim");
  await controlled;
}

type Wire = { kind: "push"; to: string; ref: string; body: string } | { kind: "ack"; ref: string };

/** A phone in another tab answers within a few milliseconds; after this it counts as switched off. */
const ACK_WAIT_MS = 1000;

/** Speaks the /ws protocol of src/server.ts, but carries messages between tabs of this browser. */
export class Radio {
  readyState: number = WebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  private channel = new BroadcastChannel("webdroid-radio");
  private delivered = new Map<string, () => void>();
  private number: string;

  constructor(number: string) {
    this.number = number;
    this.channel.onmessage = ({ data }: MessageEvent<Wire>) => {
      if (data.kind === "ack") return this.delivered.get(data.ref)?.();
      if (data.to !== number) return;
      this.channel.postMessage({ kind: "ack", ref: data.ref } satisfies Wire);
      this.onmessage?.({ data: data.body });
    };
    // Like the server on connect: hand over what was queued while this phone was off.
    void fetch(`/api/outbox/${number}`)
      .then(response => response.json() as Promise<string[]>)
      .catch(() => [])
      .then(bodies => {
        this.readyState = WebSocket.OPEN;
        this.onopen?.();
        for (const body of bodies) this.onmessage?.({ data: body });
      });
  }

  send(raw: string): void {
    const message = JSON.parse(raw) as { to: string; ref: string; queue?: boolean; intent: unknown };
    const body = JSON.stringify({ from: this.number, intent: message.intent });
    this.channel.postMessage({ kind: "push", to: message.to, ref: message.ref, body } satisfies Wire);
    void new Promise<boolean>(resolve => {
      this.delivered.set(message.ref, () => resolve(true));
      setTimeout(() => resolve(false), ACK_WAIT_MS);
    }).then(async online => {
      this.delivered.delete(message.ref);
      // Nobody answered: like src/server.ts, queue it for a known number (POST) or only ask whether the number exists (HEAD).
      const fallback = online ? null : await fetch(`/api/outbox/${message.to}`, { method: message.queue ? "POST" : "HEAD", body: message.queue ? body : undefined }).catch(() => null);
      const known = online || fallback?.status !== 404;
      const ok = online || (!!message.queue && !!fallback?.ok);
      const error = known ? "offline" : "unknown";
      this.onmessage?.({ data: JSON.stringify({ ack: message.ref, ok, error: ok ? undefined : error }) });
    });
  }

  close(): void {
    this.channel.close();
    this.readyState = WebSocket.CLOSED;
    this.onclose?.();
  }
}
