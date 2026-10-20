import { useMemo } from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import { persisted, wipe } from "./storage";
import type { AppDef, Intent, IntentFilter, Providers } from "./types";

const registry = new Map<string, AppDef>();

export function registerApps(apps: AppDef[]): void {
  for (const app of apps) registry.set(app.id, app);
}

export const getApp = (id: string): AppDef | undefined => registry.get(id);
export const allApps = (): AppDef[] => [...registry.values()];

/** `known` remembers every app ever offered, so a newly shipped preinstalled app still appears on old devices. */
export const useInstalled = persisted("system/apps", { installed: [] as string[], known: [] as string[] });

export function reconcileInstalled(): void {
  const { installed, known } = useInstalled.getState();
  const fresh = allApps().filter(app => !known.includes(app.id));
  const preinstalled = fresh.filter(app => app.preinstalled !== false || app.system).map(app => app.id);
  useInstalled.setState({
    installed: [...installed.filter(id => registry.has(id)), ...preinstalled],
    known: [...known, ...fresh.map(app => app.id)],
  });
}


export function useInstalledApps(): AppDef[] {
  const ids = useInstalled(state => state.installed);
  return useMemo(() => ids.flatMap(id => registry.get(id) ?? []), [ids]);
}

export function markInstalled(id: string, installed: boolean): void {
  useInstalled.setState(state => ({
    installed: installed ? [...new Set([...state.installed, id])] : state.installed.filter(item => item !== id),
  }));
}

/** Per-app persisted state; `clearAppData` wipes every store created here for the app. */
export function appStore<T extends object>(appId: string, initial: T) {
  return persisted(`app/${appId}/data`, initial);
}

export const clearAppData = (appId: string): Promise<void> => wipe(`app/${appId}/`);

function typeMatches(filterType: string, intentType: string): boolean {
  const [filterMain, filterSub] = filterType.split("/");
  const [intentMain, intentSub] = intentType.split("/");
  const part = (a?: string, b?: string) => a === "*" || b === "*" || a === b;
  return part(filterMain, intentMain) && part(filterSub, intentSub);
}

export function matches(filter: IntentFilter, intent: Intent): boolean {
  if (filter.action !== intent.action) return false;
  if (filter.scheme && !intent.data?.startsWith(`${filter.scheme}:`)) return false;
  if (filter.type || intent.type) return !!filter.type && !!intent.type && typeMatches(filter.type, intent.type);
  return true;
}

/** Installed apps able to handle `intent`, honouring an explicit target. */
export function resolveIntent(intent: Intent): string[] {
  const { installed } = useInstalled.getState();
  if (intent.app) return installed.includes(intent.app) ? [intent.app] : [];
  return installed.filter(id => registry.get(id)?.handles?.some(filter => matches(filter, intent)));
}

const emptyProviders: { [K in keyof Providers]: StoreApi<Providers[K]> } = {
  contacts: createStore(() => ({ contacts: [] })),
};

function providerFor<K extends keyof Providers>(key: K, installed: string[]): StoreApi<Providers[K]> {
  for (const id of installed) {
    const provider = registry.get(id)?.providers?.[key];
    if (provider) return provider as StoreApi<Providers[K]>;
  }
  return emptyProviders[key];
}

export function queryProvider<K extends keyof Providers>(key: K): Providers[K] {
  return providerFor(key, useInstalled.getState().installed).getState();
}

export function useProvider<K extends keyof Providers, T>(key: K, selector: (data: Providers[K]) => T): T {
  const installed = useInstalled(state => state.installed);
  return useStore(providerFor(key, installed), selector);
}
