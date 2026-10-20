import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { getSettings, useSettings } from "./settings";
import { play, type Tone } from "./sound";
import { persisted } from "./storage";
import type { Intent } from "./types";

export const every = (ms: number, tick: () => void) => (setInterval(tick, ms) as { unref?: () => void }).unref?.();

/* Clock */
const useClock = create(() => ({ now: Date.now() }));
every(1000, () => useClock.setState({ now: Date.now() }));

/** Current time rounded down to `step`, so minute-level clocks re-render once a minute. */
export function useNow(step: "second" | "minute" = "minute"): number {
  const size = step === "second" ? 1000 : 60000;
  return useClock(state => Math.floor(state.now / size) * size);
}

/* Battery: the real Battery API when the browser has one, otherwise a slow simulated drain. */
export const useBattery = create(() => ({ level: 0.82, charging: false }));
type BatteryLike = EventTarget & { level: number; charging: boolean };
const getBattery = (globalThis.navigator as { getBattery?: () => Promise<BatteryLike> } | undefined)?.getBattery;
if (getBattery) {
  void getBattery.call(navigator).then(battery => {
    const sync = () => useBattery.setState({ level: battery.level, charging: battery.charging });
    sync();
    battery.addEventListener("levelchange", sync);
    battery.addEventListener("chargingchange", sync);
  });
} else {
  every(60000, () =>
    useBattery.setState(({ level, charging }) => {
      const drain = getSettings().batterySaver ? 0.004 : 0.008;
      const next = charging ? level + 0.03 : level - drain;
      return { level: Math.min(1, Math.max(0.01, next)), charging: charging ? next < 1 : next <= 0.05 };
    }),
  );
}

/* Network */
const subscribeNetwork = (notify: () => void) => {
  addEventListener("online", notify);
  addEventListener("offline", notify);
  return () => {
    removeEventListener("online", notify);
    removeEventListener("offline", notify);
  };
};

export function useOnline(): boolean {
  const browserOnline = useSyncExternalStore(subscribeNetwork, () => navigator.onLine);
  return useSettings(settings => settings.wifi && !settings.airplane) && browserOnline;
}

/* Vibration and haptics. Desktops have no motor, so long patterns also shake the phone frame. */
export const useBuzz = create(() => ({ until: 0 }));

// Browsers refuse (and log) vibration before the first user gesture.
const canVibrate = () => !!navigator.vibrate && (navigator.userActivation?.hasBeenActive ?? true);

export function vibrate(pattern: number | number[]): void {
  if (getSettings().ringer === "silent") return;
  if (canVibrate()) navigator.vibrate(pattern);
  const total = [pattern].flat().reduce((sum, ms) => sum + ms, 0);
  if (total >= 80) useBuzz.setState({ until: Date.now() + total });
}

export function haptic(strength: "light" | "medium" | "heavy" = "light"): void {
  if (getSettings().haptics && canVibrate()) navigator.vibrate({ light: 8, medium: 18, heavy: 35 }[strength]);
}

/** Sound + haptic pair used by every mechanic for consistent feedback. */
export function feedback(tone: Tone, strength: "light" | "medium" | "heavy" = "light"): void {
  play(tone);
  haptic(strength);
}

/* Wake locks keep the screen from timing out (camera, calls, recording). */
export const useWake = create(() => ({ owners: [] as string[] }));
let screenLock: { release(): Promise<void> } | undefined;

export function keepAwake(owner: string, on: boolean): void {
  useWake.setState(({ owners }) => ({ owners: on ? [...new Set([...owners, owner])] : owners.filter(item => item !== owner) }));
  const held = useWake.getState().owners.length > 0;
  const wakeLock = (navigator as { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock;
  if (held && !screenLock) void wakeLock?.request("screen").then(lock => (screenLock = lock)).catch(() => undefined);
  if (!held && screenLock) void screenLock.release().finally(() => (screenLock = undefined));
}

/* AlarmManager: persisted, so alarms survive reloads and fire even when the owning app is not running. */
export interface Alarm {
  id: string;
  app: string;
  at: number;
  intent: Intent;
  clock?: boolean;
}

export const useAlarms = persisted("system/alarms", { alarms: [] as Alarm[] });
let fire: (alarm: Alarm) => void = () => undefined;

export const onAlarm = (handler: (alarm: Alarm) => void) => (fire = handler);

export function setAlarm(alarm: Alarm): void {
  useAlarms.setState(({ alarms }) => ({ alarms: [...alarms.filter(item => item.app !== alarm.app || item.id !== alarm.id), alarm] }));
}

export function cancelAlarm(app: string, id: string): void {
  useAlarms.setState(({ alarms }) => ({ alarms: alarms.filter(item => item.app !== app || item.id !== id) }));
}

export function dueAlarms(now: number): Alarm[] {
  const { alarms } = useAlarms.getState();
  const due = alarms.filter(alarm => alarm.at <= now);
  if (due.length) useAlarms.setState({ alarms: alarms.filter(alarm => alarm.at > now) });
  return due;
}

every(1000, () => dueAlarms(Date.now()).forEach(alarm => fire(alarm)));
