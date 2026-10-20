import { create } from "zustand";
import type { Permission, ShareContent } from "./types";

/** Requests the kernel makes to the system UI; the user's answer resolves the promise. */
type SystemDialog =
  | { kind: "permission"; app: string; permission: Permission; once: boolean }
  | { kind: "chooser"; apps: string[]; share?: ShareContent };

interface PendingDialog {
  id: number;
  dialog: SystemDialog;
  resolve: (answer: string | null) => void;
}

interface Toast {
  id: number;
  text: string;
}

export const useSystem = create<{ dialogs: PendingDialog[]; toasts: Toast[] }>(() => ({ dialogs: [], toasts: [] }));

let nextId = 1;

export function ask(dialog: SystemDialog): Promise<string | null> {
  return new Promise(resolve => {
    useSystem.setState(state => ({ dialogs: [...state.dialogs, { id: nextId++, dialog, resolve }] }));
  });
}

export function answer(id: number, value: string | null): void {
  const pending = useSystem.getState().dialogs.find(item => item.id === id);
  useSystem.setState(state => ({ dialogs: state.dialogs.filter(item => item.id !== id) }));
  pending?.resolve(value);
}

export function toast(text: string): void {
  const id = nextId++;
  useSystem.setState(state => ({ toasts: [...state.toasts.slice(-1), { id, text }] }));
  setTimeout(() => useSystem.setState(state => ({ toasts: state.toasts.filter(item => item.id !== id) })), 2500);
}
