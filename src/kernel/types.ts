import type { ComponentType } from "react";
import type { StoreApi } from "zustand";

export type Lang = "tr" | "en";
/** A user-visible string in every supported language, ordered like `Lang`. */
export type Text = readonly [tr: string, en: string];
export type Strings = Record<string, Text>;

export type Permission = "camera" | "microphone" | "location" | "storage" | "notifications";
/** `blocked` = denied twice; Android stops showing the dialog after that. */
export type Grant = "granted" | "once" | "denied" | "blocked";

export type Extras = Record<string, string | number | boolean | undefined>;

export interface Intent {
  action: string;
  app?: string;
  type?: string;
  data?: string;
  extras?: Extras;
  showWhenLocked?: boolean;
}

export interface IntentFilter {
  action: string;
  type?: string;
  scheme?: string;
}

export interface Activity {
  id: number;
  app: string;
  intent: Intent;
  routes: string[];
}

export interface Task {
  id: number;
  activities: Activity[];
  lastActive: number;
}

export type Importance = "high" | "default" | "low" | "min";

export interface Channel {
  name: Text;
  importance: Importance;
}

export interface NotificationAction {
  label: string;
  icon?: string;
  intent: Intent;
  /** Shows an inline text field; the typed text arrives as `extras.reply`. */
  reply?: boolean;
}

export interface NotificationInput {
  id?: string;
  channel?: string;
  title: string;
  text?: string;
  icon?: string;
  image?: string;
  intent?: Intent;
  actions?: NotificationAction[];
  ongoing?: boolean;
  /** Alarm / incoming call style: wakes the screen and takes it over until handled. */
  fullScreen?: "alarm" | "call";
  progress?: number;
  media?: { playing: boolean };
}

export interface Notification extends NotificationInput {
  id: string;
  app: string;
  channel: string;
  importance: Importance;
  time: number;
}

export interface FileEntry {
  path: string;
  mime: string;
  size: number;
  mtime: number;
}

export interface Fs {
  write(path: string, data: Blob | string, mime?: string): Promise<FileEntry>;
  read(path: string): Promise<Blob>;
  mkdir(path: string): Promise<void>;
  remove(path: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
  copy(from: string, to: string): Promise<void>;
}

export type Theme = "light" | "dark" | "auto";
export type LockKind = "none" | "swipe" | "pin" | "pattern";

export interface SystemSettings {
  setupDone: boolean;
  userName: string;
  lang: Lang;
  theme: Theme;
  wallpaper: string;
  seed: string;
  brightness: number;
  fontScale: number;
  screenTimeout: number;
  navMode: "gesture" | "buttons";
  wifi: boolean;
  bluetooth: boolean;
  airplane: boolean;
  location: boolean;
  dnd: boolean;
  batterySaver: boolean;
  flashlight: boolean;
  autoRotate: boolean;
  ringer: "sound" | "vibrate" | "silent";
  volumes: { media: number; ring: number; alarm: number };
  touchSounds: boolean;
  haptics: boolean;
  lock: { kind: LockKind; hash?: string };
  lockNotifications: boolean;
  tiles: string[];
  mutedApps: string[];
  /** "appId/channelId" entries the user switched off. */
  mutedChannels: string[];
  developer: boolean;
  animScale: number;
  showTaps: boolean;
  /** Pixel's "Themed icons": app icons take the wallpaper palette instead of their own colours. */
  themedIcons: boolean;
}

export type SoundKind = "click" | "tick" | "notify" | "shutter" | "error" | "success" | "start" | "stop" | "lock" | "unlock";

export interface ShareContent {
  type: string;
  data?: string;
  text?: string;
}

export interface Os {
  readonly app: string;
  startActivity(intent: Intent): Promise<Extras | undefined>;
  finish(result?: Extras): void;
  push(route: string): void;
  replace(route: string): void;
  back(): void;
  notify(notification: NotificationInput): string;
  cancel(id: string): void;
  toast(text: string): void;
  share(content: ShareContent): void;
  media(constraints: MediaStreamConstraints): Promise<MediaStream>;
  locate(): Promise<{ lat: number; lng: number }>;
  fetch(url: string, init?: RequestInit): Promise<Response>;
  /** Delivers an intent to the same app on the device with phone number `to`. */
  send(to: string, intent: Intent, queue?: boolean): Promise<boolean>;
  setAlarm(id: string, at: number, intent: Intent): void;
  cancelAlarm(id: string): void;
  vibrate(pattern: number | number[]): void;
  sound(kind: SoundKind): void;
  keepAwake(on: boolean): void;
  fs: Fs;
  settings: { get(): SystemSettings; set(patch: Partial<SystemSettings>): void };
}

export interface AppProps {
  intent: Intent;
  route: string;
  os: Os;
}

export interface Contact {
  id: string;
  name: string;
  number: string;
  email?: string;
  photo?: string;
  starred?: boolean;
}

/** Content providers: data one app owns and others may read through the kernel. */
export interface Providers {
  contacts: { contacts: Contact[] };
}

export interface AppDef {
  id: string;
  name: Text;
  icon: string;
  /** Icon colour as an OKLCH hue in degrees; `chroma` (0–1, default 1) mutes it for neutral apps like Settings. */
  tint: { hue: number; chroma?: number };
  /** Live icons the launcher draws itself, like Pixel's ticking clock and today's-date calendar. */
  liveIcon?: "clock" | "calendar";
  description: Text;
  permissions?: Permission[];
  handles?: IntentFilter[];
  channels?: Record<string, Channel>;
  /** System apps cannot be uninstalled. */
  system?: boolean;
  /** Defaults to true; otherwise the app starts in the store only. */
  preinstalled?: boolean;
  Component: ComponentType<AppProps>;
  Widget?: ComponentType<{ os: Os }>;
  receivers?: Record<string, (intent: Intent, os: Os) => void>;
  providers?: { [K in keyof Providers]?: StoreApi<Providers[K]> };
}
