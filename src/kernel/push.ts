import { create } from "zustand";
import { Radio, STATIC } from "../static/client";
import { isOnline, useSettings } from "./settings";
import { deviceId } from "./storage";
import type { Intent } from "./types";

/** This device's phone number (assigned by the server) and whether the "radio" is connected. */
export const usePhone = create(() => ({ number: "", connected: false }));

let socket: WebSocket | Radio | undefined;
let receive: (from: string, intent: Intent) => void = () => undefined;
const acks = new Map<string, (ok: boolean) => void>();

export const onPush = (handler: (from: string, intent: Intent) => void) => (receive = handler);

function open(): void {
  if (socket || !isOnline() || typeof WebSocket === "undefined") return;
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const ws = STATIC ? new Radio(usePhone.getState().number) : new WebSocket(`${scheme}://${location.host}/ws?device=${deviceId}`);
  socket = ws;
  ws.onopen = () => usePhone.setState({ connected: true });
  ws.onclose = () => {
    socket = undefined;
    usePhone.setState({ connected: false });
    setTimeout(open, 3000);
  };
  ws.onmessage = (event: { data: unknown }) => {
    const message = JSON.parse(String(event.data)) as { ack?: string; ok?: boolean; from?: string; intent?: Intent };
    if (message.ack !== undefined) {
      acks.get(message.ack)?.(!!message.ok);
      acks.delete(message.ack);
    } else if (message.from && message.intent) receive(message.from, message.intent);
  };
}

export async function connect(): Promise<void> {
  const response = await fetch(`/api/device/${deviceId}`).catch(() => null);
  if (response?.ok) usePhone.setState({ number: ((await response.json()) as { number: string }).number });
  open();
  // Airplane mode / Wi-Fi off really drops the connection, so other devices see this one as unreachable.
  useSettings.subscribe(settings => (isOnline(settings) ? open() : socket?.close()));
  addEventListener("online", open);
}

/** Resolves true once the server delivered (or, with `queue`, stored) the message. */
export function send(to: string, intent: Intent, queue = false): Promise<boolean> {
  const ws = socket;
  if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.resolve(false);
  const ref = crypto.randomUUID();
  return new Promise(resolve => {
    acks.set(ref, resolve);
    ws.send(JSON.stringify({ to: to.replace(/\D/g, ""), ref, queue, intent }));
    setTimeout(() => acks.delete(ref) && resolve(false), 5000);
  });
}

export const formatNumber = (number: string) => number.replace(/\D/g, "").replace(/^(\d{3})(\d{2})(\d{2})$/, "$1 $2 $3");
