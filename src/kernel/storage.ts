import { create, type StoreApi, type UseBoundStore } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

const DEVICE_ID = /^[a-z0-9-]{1,40}$/;

// The URL wins so a second tab can be a different phone (?device=b); otherwise this browser's device is reused.
function resolveDeviceId(): string {
  const fromUrl = new URLSearchParams(globalThis.location?.search ?? "").get("device");
  if (fromUrl && DEVICE_ID.test(fromUrl)) return fromUrl;
  try {
    const saved = localStorage.getItem("webdroid.device");
    if (saved && DEVICE_ID.test(saved)) return saved;
    const created = crypto.randomUUID().slice(0, 8);
    localStorage.setItem("webdroid.device", created);
    return created;
  } catch {
    return "default";
  }
}

export const deviceId = resolveDeviceId();

const cache = new Map<string, string>();
const pending = new Map<string, string | null>();
let timer: ReturnType<typeof setTimeout> | undefined;
/** Set during a factory reset so nothing written while the page unloads survives it. */
let frozen = false;

function flush(keepalive = false): void {
  clearTimeout(timer);
  for (const [key, value] of pending) {
    const init = value === null ? { method: "DELETE", keepalive } : { method: "PUT", body: value, keepalive };
    // A failed write is retried later, unless a newer value for the key is already queued.
    void fetch(`/api/kv/${deviceId}/${encodeURIComponent(key)}`, init).catch(() => {
      if (!pending.has(key)) queue(key, value, 3000);
    });
  }
  pending.clear();
}

// Writes are debounced because stores persist on every keystroke (e.g. note autosave).
function queue(key: string, value: string | null, delay = 400): void {
  if (frozen) return;
  pending.set(key, value);
  clearTimeout(timer);
  timer = setTimeout(flush, delay);
}

const kvStorage: StateStorage = {
  getItem: key => cache.get(key) ?? null,
  setItem: (key, value) => {
    cache.set(key, value);
    queue(key, value);
  },
  removeItem: key => {
    cache.delete(key);
    queue(key, null);
  },
};

globalThis.addEventListener?.("pagehide", () => flush(true));

type Persisted<T> = UseBoundStore<StoreApi<T>> & { persist: { rehydrate(): Promise<void> | void } };
const stores: Array<{ key: string; store: Persisted<object>; initial: object }> = [];
let hydrated = false;

/** A zustand store saved per device on the server. State only; actions are plain functions next to it. */
export function persisted<T extends object>(key: string, initial: T): Persisted<T> {
  const store = create<T>()(persist(() => initial, { name: key, storage: createJSONStorage(() => kvStorage), skipHydration: true }));
  stores.push({ key, store: store as unknown as Persisted<object>, initial });
  if (hydrated) void store.persist.rehydrate();
  return store;
}

export async function hydrate(): Promise<void> {
  const values: Record<string, string> = await fetch(`/api/kv/${deviceId}`).then(response => (response.ok ? response.json() : {})).catch(() => ({}));
  for (const [key, value] of Object.entries(values)) cache.set(key, value);
  hydrated = true;
  await Promise.all(stores.map(entry => entry.store.persist.rehydrate()));
}

/** Resets every store whose key starts with `prefix` and deletes its saved data. */
export async function wipe(prefix: string, freeze = false): Promise<void> {
  frozen ||= freeze;
  for (const entry of stores.filter(item => item.key.startsWith(prefix))) entry.store.setState(entry.initial, true);
  for (const key of [...cache.keys()]) if (key.startsWith(prefix)) cache.delete(key);
  for (const key of [...pending.keys()]) if (key.startsWith(prefix)) pending.delete(key);
  await fetch(`/api/kv/${deviceId}?prefix=${encodeURIComponent(prefix)}`, { method: "DELETE" });
}
