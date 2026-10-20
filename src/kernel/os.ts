import { createContext, useContext, useEffect, useRef } from "react";
import { create } from "zustand";
import { clearAppData, getApp, markInstalled, resolveIntent, useInstalled } from "./apps";
import { makeOs } from "./context";
import { onAlarm, useAlarms } from "./device";
import { pick } from "./i18n";
import { cancelWhere } from "./notifications";
import { forgetApp, revokeOnce } from "./permissions";
import { usePower } from "./power";
import { onPush } from "./push";
import { ask, toast } from "./system";
import { handleSignal } from "./telecom";
import type { Activity, Extras, Intent, ShareContent, Task } from "./types";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const useOs = create(() => ({
  tasks: [] as Task[],
  foreground: null as number | null,
  recents: false,
  launchFrom: null as Rect | null,
  /** Apps currently holding a live camera or microphone track (privacy indicator). */
  sensing: [] as string[],
  /** Activities drawn on dark content (camera, viewers) that want light status bar icons. */
  lightBars: [] as number[],
}));

const S = { noApp: ["Bu işlemi yapabilecek uygulama yok", "No app can perform this action"] } as const;

let nextId = 1;
const results = new Map<number, (result?: Extras) => void>();
const set = useOs.setState;
const touchTask = (task: Task, activities = task.activities): Task => ({ ...task, activities, lastActive: Date.now() });
const taskOf = (activity: number) => useOs.getState().tasks.find(task => task.activities.some(item => item.id === activity));

export const foregroundTask = (): Task | undefined => {
  const { tasks, foreground } = useOs.getState();
  return tasks.find(task => task.id === foreground);
};

function settle(activities: Activity[], result?: Extras): void {
  for (const activity of activities) {
    results.get(activity.id)?.(result);
    results.delete(activity.id);
  }
}

/** Launcher/notification/system launches start a task; in-app launches stack onto the caller's task. */
function open(intent: Intent & { app: string }, caller?: number, from?: Rect): Promise<Extras | undefined> {
  const activity: Activity = { id: nextId++, app: intent.app, intent, routes: ["main"] };
  const { tasks } = useOs.getState();
  const host = caller === undefined ? undefined : taskOf(caller);
  const existing = tasks.find(task => task.activities[0].app === intent.app);
  if (host) {
    set({ tasks: tasks.map(task => (task === host ? touchTask(task, [...task.activities, activity]) : task)), foreground: host.id, recents: false });
  } else if (existing && intent.action === "MAIN") {
    set({ tasks: tasks.map(task => (task === existing ? touchTask(task) : task)), foreground: existing.id, recents: false, launchFrom: from ?? null });
    return Promise.resolve(undefined);
  } else if (existing) {
    settle(existing.activities);
    set({ tasks: tasks.map(task => (task === existing ? touchTask(task, [activity]) : task)), foreground: existing.id, recents: false, launchFrom: from ?? null });
  } else {
    const task: Task = { id: nextId++, activities: [activity], lastActive: Date.now() };
    set({ tasks: [...tasks, task], foreground: task.id, recents: false, launchFrom: from ?? null });
  }
  return new Promise(resolve => results.set(activity.id, resolve));
}

export async function startActivity(intent: Intent, caller?: number, from?: Rect): Promise<Extras | undefined> {
  const candidates = resolveIntent(intent);
  if (!candidates.length) {
    toast(pick(S.noApp));
    return undefined;
  }
  // Android always shows the share sheet for SEND, and a chooser when several apps qualify.
  const sharing = intent.action === "SEND" && !intent.app;
  const share: ShareContent | undefined = sharing ? { type: intent.type ?? "*/*", data: intent.data, text: intent.extras?.text?.toString() } : undefined;
  const app = candidates.length > 1 || sharing ? await ask({ kind: "chooser", apps: candidates, share }) : candidates[0];
  return app ? open({ ...intent, app }, caller, from) : undefined;
}

export const launch = (app: string, from?: Rect) => startActivity({ action: "MAIN", app }, undefined, from);

export function share(content: ShareContent, caller?: number): Promise<Extras | undefined> {
  return startActivity({ action: "SEND", type: content.type, data: content.data, extras: { text: content.text } }, caller);
}

/** Receivers run without UI; anything else opens an activity in a new task. */
export function dispatch(intent: Intent): void {
  const receiver = intent.app ? getApp(intent.app)?.receivers?.[intent.action] : undefined;
  if (receiver && intent.app) receiver(intent, makeOs(intent.app));
  else void startActivity(intent);
}

export function sendBroadcast(intent: Intent): void {
  const targets = intent.app ? [intent.app] : useInstalled.getState().installed;
  for (const app of targets) getApp(app)?.receivers?.[intent.action]?.({ ...intent, app }, makeOs(app));
}

onAlarm(alarm => dispatch(alarm.intent));
onPush((from, intent) => {
  if (intent.app === "telecom") return handleSignal(from, intent);
  if (intent.app && useInstalled.getState().installed.includes(intent.app)) dispatch({ ...intent, extras: { ...intent.extras, from } });
});

export function finishActivity(id: number, result?: Extras): void {
  const task = taskOf(id);
  if (!task) return;
  settle(task.activities.filter(activity => activity.id === id), result);
  const activities = task.activities.filter(activity => activity.id !== id);
  const { tasks, foreground } = useOs.getState();
  if (activities.length) set({ tasks: tasks.map(item => (item === task ? touchTask(item, activities) : item)) });
  else set({ tasks: tasks.filter(item => item !== task), foreground: foreground === task.id ? null : foreground });
}

export function killTask(id: number): void {
  const { tasks, foreground } = useOs.getState();
  const task = tasks.find(item => item.id === id);
  if (!task) return;
  settle(task.activities);
  const rest = tasks.filter(item => item !== task);
  for (const { app } of task.activities) if (!rest.some(item => item.activities.some(activity => activity.app === app))) revokeOnce(app);
  set({ tasks: rest, foreground: foreground === id ? null : foreground });
}

/** Like killing the process: tasks close and the app gets a TERMINATE broadcast to stop background work. */
export function forceStop(app: string): void {
  sendBroadcast({ app, action: "TERMINATE" });
  for (const task of useOs.getState().tasks.filter(item => item.activities.some(activity => activity.app === app))) killTask(task.id);
  cancelWhere(notification => notification.app === app);
}

export async function uninstallApp(app: string): Promise<void> {
  if (getApp(app)?.system) return;
  forceStop(app);
  forgetApp(app);
  useAlarms.setState(({ alarms }) => ({ alarms: alarms.filter(alarm => alarm.app !== app) }));
  markInstalled(app, false);
  await clearAppData(app);
}

export function updateRoutes(activity: number, change: (routes: string[]) => string[]): void {
  set(({ tasks }) => ({
    tasks: tasks.map(task => ({ ...task, activities: task.activities.map(item => (item.id === activity ? { ...item, routes: change(item.routes) } : item)) })),
  }));
}

export const goHome = () => set({ foreground: null, recents: false, launchFrom: null });
export const showRecents = (open: boolean) => set({ recents: open });
export const switchTo = (id: number) => set(({ tasks }) => ({ foreground: id, recents: false, tasks: tasks.map(task => (task.id === id ? touchTask(task) : task)) }));

/* Back dispatch: newest visible handler first, then in-app routes, then the activity stack, then home. */
type Owner = number | "system" | "home";
const backHandlers: Array<{ owner: Owner; run: () => void }> = [];
export const ActivityContext = createContext<number | null>(null);

export function useBackHandler(handler: () => void, active = true, ownerOverride?: Owner): void {
  const activity = useContext(ActivityContext);
  const owner = ownerOverride ?? activity ?? "system";
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    if (!active) return;
    const entry = { owner, run: () => latest.current() };
    backHandlers.push(entry);
    return () => {
      const index = backHandlers.indexOf(entry);
      if (index >= 0) backHandlers.splice(index, 1);
    };
  }, [active, owner]);
}

export function useLightStatusBar(on = true): void {
  const activity = useContext(ActivityContext);
  useEffect(() => {
    if (!on || activity === null) return;
    set(({ lightBars }) => ({ lightBars: [...lightBars, activity] }));
    return () => set(({ lightBars }) => ({ lightBars: lightBars.filter(id => id !== activity) }));
  }, [on, activity]);
}

/** True while the calling activity is what the user sees: top of the front task, no overview, screen on. */
export function useForeground(): boolean {
  const activity = useContext(ActivityContext);
  const screenOn = usePower(state => state.screenOn);
  const front = useOs(state => !state.recents && state.tasks.find(task => task.id === state.foreground)?.activities.at(-1)?.id === activity);
  return front && screenOn;
}

export function back(): void {
  const { recents, foreground } = useOs.getState();
  const task = recents ? undefined : foregroundTask();
  const top = task?.activities.at(-1);
  let current: Owner = top?.id ?? (foreground === null ? "home" : -1);
  if (recents) current = -1;
  const handler = backHandlers.findLast(entry => entry.owner === "system" || entry.owner === current);
  if (handler) return handler.run();
  if (recents) return set({ recents: false });
  if (!task || !top) return;
  if (top.routes.length > 1) return updateRoutes(top.id, routes => routes.slice(0, -1));
  if (task.activities.length > 1) return finishActivity(top.id);
  goHome();
}
