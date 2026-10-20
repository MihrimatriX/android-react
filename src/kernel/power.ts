import { create } from "zustand";
import { reconcileInstalled } from "./apps";
import { every, useWake } from "./device";
import { loadIndex } from "./fs";
import { useNotifications } from "./notifications";
import { sendBroadcast } from "./os";
import { connect } from "./push";
import { getSettings, setSettings } from "./settings";
import { play } from "./sound";
import { deviceId, hydrate, wipe } from "./storage";
import type { Notification } from "./types";

/** Boot phase, lock state and the screen's power, including the inactivity timeout. */
export const usePower = create(() => ({
  phase: "boot" as "boot" | "setup" | "ready",
  locked: true,
  screenOn: true,
  dimmed: false,
}));

const BOOT_ANIMATION_MS = 2400;
let lastInput = Date.now();

/** New notifications light up a sleeping screen (Pixel's "wake screen for notifications"). */
function wakeForNotifications(state: { list: Notification[] }, previous: { list: Notification[] }): void {
  const fresh = state.list.filter(item => !previous.list.some(old => old.id === item.id));
  if (fresh.some(item => item.fullScreen || item.importance === "high" || item.importance === "default")) wake();
}

export async function boot(): Promise<void> {
  const started = Date.now();
  // Subscribed here rather than at module load: kernel modules import each other in a cycle.
  useNotifications.subscribe(wakeForNotifications);
  await hydrate();
  reconcileInstalled();
  await loadIndex();
  void connect();
  await new Promise(resolve => setTimeout(resolve, Math.max(0, BOOT_ANIMATION_MS - (Date.now() - started))));
  const { setupDone, lock } = getSettings();
  usePower.setState({ phase: setupDone ? "ready" : "setup", locked: setupDone && lock.kind !== "none", screenOn: true });
  if (setupDone) sendBroadcast({ action: "BOOT_COMPLETED" });
}

export function finishSetup(): void {
  setSettings({ setupDone: true });
  usePower.setState({ phase: "ready", locked: false });
  sendBroadcast({ action: "BOOT_COMPLETED" });
}

export function userActivity(): void {
  lastInput = Date.now();
  if (usePower.getState().dimmed) usePower.setState({ dimmed: false });
}

export function screenOff(): void {
  if (!usePower.getState().screenOn) return;
  play("lock");
  usePower.setState(state => ({ screenOn: false, dimmed: false, locked: state.locked || getSettings().lock.kind !== "none" }));
}

export function wake(): void {
  lastInput = Date.now();
  if (!usePower.getState().screenOn) usePower.setState({ screenOn: true });
}

export const power = () => (usePower.getState().screenOn ? screenOff() : wake());

export function unlock(): void {
  play("unlock");
  usePower.setState({ locked: false });
}

/** Erases every setting, app store and file of this device, then reboots into the setup wizard. */
export async function factoryReset(): Promise<void> {
  await Promise.all([wipe("", true), fetch(`/api/files/${deviceId}`, { method: "DELETE" })]);
  location.reload();
}

/** Locks immediately, e.g. after changing the screen lock in Settings. */
export const lockNow = () => usePower.setState({ locked: getSettings().lock.kind !== "none" });

// Pixel dims the screen a few seconds before it times out; wake locks hold it on.
every(1000, () => {
  const { screenOn, phase, dimmed } = usePower.getState();
  if (!screenOn || phase !== "ready") return;
  if (useWake.getState().owners.length) lastInput = Date.now();
  const idle = Date.now() - lastInput;
  const limit = getSettings().screenTimeout * 1000;
  if (idle >= limit) screenOff();
  else if (idle >= limit - 5000 !== dimmed) usePower.setState({ dimmed: !dimmed });
});
