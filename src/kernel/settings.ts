import { persisted } from "./storage";
import type { SystemSettings } from "./types";

const DEFAULT_SETTINGS: SystemSettings = {
  setupDone: false,
  userName: "",
  lang: "tr",
  theme: "auto",
  wallpaper: "dusk",
  seed: "#5b6cc9",
  brightness: 1,
  fontScale: 1,
  screenTimeout: 60,
  navMode: "gesture",
  wifi: true,
  bluetooth: false,
  airplane: false,
  location: true,
  dnd: false,
  batterySaver: false,
  flashlight: false,
  autoRotate: false,
  ringer: "sound",
  volumes: { media: 0.6, ring: 0.7, alarm: 0.8 },
  touchSounds: true,
  haptics: true,
  lock: { kind: "swipe" },
  lockNotifications: true,
  tiles: ["wifi", "bluetooth", "dnd", "flashlight", "airplane", "dark", "location", "ringer"],
  mutedApps: [],
  mutedChannels: [],
  developer: false,
  animScale: 1,
  showTaps: false,
  themedIcons: false,
};

export const useSettings = persisted("system/settings", DEFAULT_SETTINGS);
export const getSettings = useSettings.getState;

export function setSettings(patch: Partial<SystemSettings>): void {
  useSettings.setState(patch);
}

/** The radio is usable only with Wi-Fi on, airplane mode off and the browser itself online. */
export function isOnline(settings: SystemSettings = getSettings()): boolean {
  return settings.wifi && !settings.airplane && (globalThis.navigator?.onLine ?? true);
}

/** One-way hash for the screen-lock secret; plain FNV-1a only where WebCrypto is unavailable (plain-http LAN). */
export async function hashSecret(secret: string): Promise<string> {
  const salted = `webdroid:${secret}`;
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salted));
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  }
  let hash = 0x811c9dc5;
  for (const char of salted) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0;
  return hash.toString(16);
}
