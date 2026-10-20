import { create } from "zustand";
import { getApp } from "./apps";
import { vibrate } from "./device";
import { requestPermission } from "./permissions";
import { getSettings } from "./settings";
import { loop, play } from "./sound";
import type { Notification, NotificationInput } from "./types";

/** Notifications posted by the OS itself (screenshots, battery) use this app id. */
export const SYSTEM = "android";

export const useNotifications = create(() => ({ list: [] as Notification[], headsUp: null as string | null }));

const ringing = new Map<string, () => void>();
let headsUpTimer: ReturnType<typeof setTimeout> | undefined;

export function notify(app: string, input: NotificationInput): string {
  const id = input.id ?? `${app}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  void deliver(app, id, input);
  return id;
}

async function deliver(app: string, id: string, input: NotificationInput): Promise<void> {
  // Like Android 13: the system itself, media sessions, ongoing work and call/alarm takeovers skip the permission.
  const exempt = app === SYSTEM || !!input.fullScreen || !!input.media || !!input.ongoing;
  if (!exempt && !(await requestPermission(app, "notifications"))) return;
  const settings = getSettings();
  const channel = input.channel ?? "default";
  if (settings.mutedApps.includes(app) || settings.mutedChannels.includes(`${app}/${channel}`)) return;
  const importance = input.fullScreen ? "high" : (getApp(app)?.channels?.[channel]?.importance ?? "default");
  const { list } = useNotifications.getState();
  const existing = list.find(item => item.id === id);
  const notification: Notification = { ...input, id, app, channel, importance, time: existing?.time ?? Date.now() };
  useNotifications.setState({ list: existing ? list.map(item => (item.id === id ? notification : item)) : [notification, ...list] });
  if (!existing) alert(notification);
}

function alert(notification: Notification): void {
  const { dnd } = getSettings();
  if (notification.fullScreen) {
    if (dnd && notification.fullScreen === "call") return;
    const stopSound = loop(notification.fullScreen === "call" ? "ring" : "alarm");
    vibrate(600);
    const buzz = setInterval(() => vibrate(600), 1500);
    ringing.set(notification.id, () => {
      stopSound();
      clearInterval(buzz);
    });
    return;
  }
  if (dnd || notification.importance === "low" || notification.importance === "min" || notification.media) return;
  play("notify");
  vibrate([0, 90, 70, 90]);
  if (notification.importance !== "high") return;
  clearTimeout(headsUpTimer);
  useNotifications.setState({ headsUp: notification.id });
  headsUpTimer = setTimeout(() => useNotifications.setState({ headsUp: null }), 5000);
}

export function cancel(id: string): void {
  ringing.get(id)?.();
  ringing.delete(id);
  useNotifications.setState(state => ({
    list: state.list.filter(item => item.id !== id),
    headsUp: state.headsUp === id ? null : state.headsUp,
  }));
}

export function cancelWhere(match: (notification: Notification) => boolean): void {
  for (const notification of useNotifications.getState().list.filter(match)) cancel(notification.id);
}

/** "Clear all" keeps ongoing ones, like Android. */
export const clearAll = () => cancelWhere(item => !item.ongoing && !item.fullScreen && !item.media);

export interface NotificationGroup {
  key: string;
  app: string;
  items: Notification[];
}

function rank(item: Notification): number {
  if (item.fullScreen) return 0;
  if (item.media) return 1;
  if (item.ongoing) return 2;
  return item.importance === "min" ? 4 : 3;
}

/** Groups by app (media sessions stand alone), ordered by priority then recency. */
export function groupNotifications(list: Notification[]): NotificationGroup[] {
  const sorted = list.toSorted((a, b) => rank(a) - rank(b) || b.time - a.time);
  const groups = Map.groupBy(sorted, item => (item.media ? `${item.app}:media` : item.app));
  return [...groups].map(([key, items]) => ({ key, app: items[0].app, items }));
}
