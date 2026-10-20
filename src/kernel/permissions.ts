import { useEffect } from "react";
import { create } from "zustand";
import { getApp } from "./apps";
import { startActivity } from "./os";
import { getSettings } from "./settings";
import { persisted } from "./storage";
import { ask } from "./system";
import type { Grant, Permission } from "./types";

/** Saved decisions per app. "once" grants live only in memory and die with the app's task. */
export const useGrants = persisted("system/permissions", { grants: {} as Record<string, Partial<Record<Permission, Grant>>> });
const useOnce = create<{ once: Record<string, Permission[]> }>(() => ({ once: {} }));

/** Camera, microphone and location are the only ones Android offers "Only this time" for. */
const ONE_TIME: Permission[] = ["camera", "microphone", "location"];

export function grantOf(app: string, permission: Permission): Grant | undefined {
  if (useOnce.getState().once[app]?.includes(permission)) return "once";
  return useGrants.getState().grants[app]?.[permission];
}

export const isGranted = (app: string, permission: Permission): boolean => {
  const grant = grantOf(app, permission);
  return grant === "granted" || grant === "once";
};

export function setGrant(app: string, permission: Permission, grant: Grant | undefined): void {
  useGrants.setState(state => ({ grants: { ...state.grants, [app]: { ...state.grants[app], [permission]: grant } } }));
}

const inflight = new Map<string, Promise<boolean>>();

// Concurrent requests for the same permission share one dialog.
export function requestPermission(app: string, permission: Permission): Promise<boolean> {
  const key = `${app}/${permission}`;
  const request = inflight.get(key) ?? decide(app, permission).finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
}

async function decide(app: string, permission: Permission): Promise<boolean> {
  if (!getApp(app)?.permissions?.includes(permission)) return false;
  if (permission === "location" && !getSettings().location) return false;
  if (isGranted(app, permission)) return true;
  const previous = grantOf(app, permission);
  if (previous === "blocked") return false;
  const choice = await ask({ kind: "permission", app, permission, once: ONE_TIME.includes(permission) });
  if (choice === "once") {
    useOnce.setState(state => ({ once: { ...state.once, [app]: [...(state.once[app] ?? []), permission] } }));
    return true;
  }
  if (choice === "granted") setGrant(app, permission, "granted");
  else setGrant(app, permission, previous === "denied" ? "blocked" : "denied");
  return choice === "granted";
}

export function revokeOnce(app: string): void {
  useOnce.setState(state => ({ once: { ...state.once, [app]: [] } }));
}

export function forgetApp(app: string): void {
  revokeOnce(app);
  useGrants.setState(state => ({ grants: { ...state.grants, [app]: {} } }));
}

/** Re-renders on any grant change; asks once on mount. */
export function usePermission(app: string, permission: Permission): { granted: boolean; request: () => Promise<boolean> } {
  useGrants(state => state.grants[app]?.[permission]);
  useOnce(state => state.once[app]);
  const granted = isGranted(app, permission);
  useEffect(() => {
    if (!isGranted(app, permission)) void requestPermission(app, permission);
  }, [app, permission]);
  // Once blocked the dialog never shows again, so "Allow" leads to the app's settings page, as Android apps do.
  const request = async () => {
    if (grantOf(app, permission) !== "blocked") return requestPermission(app, permission);
    void startActivity({ action: "APP_DETAILS", app: "settings", extras: { app } });
    return false;
  };
  return { granted, request };
}
