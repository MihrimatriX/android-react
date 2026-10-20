import { persisted } from "../kernel/storage";

/** Pure home-screen layout logic, kept apart from the launcher UI so it can be unit tested. */
export const COLUMNS = 4;
export const ROWS = 5;
export const CELLS = COLUMNS * ROWS;
/** The first two rows of page 0 belong to the app widgets (clock, weather). */
export const WIDGET_CELLS = COLUMNS * 2;

export interface HomeItem {
  id: string;
  page: number;
  cell: number;
  app?: string;
  folder?: { name: string; apps: string[] };
}

export interface HomeLayout {
  items: HomeItem[];
  dock: string[];
  /** Installed apps seen at the last sync; anything new gets an icon, like Android does on install. */
  seen: string[];
}

const DEFAULT_DOCK = ["phone", "messages", "browser", "camera"];
const DEFAULT_HOME = ["gallery", "clock", "store", "settings"];

export const useHome = persisted<HomeLayout>("system/home", { items: [], dock: [], seen: [] });

const reserved = (page: number, cell: number) => page === 0 && cell < WIDGET_CELLS;
const itemAt = (items: HomeItem[], page: number, cell: number) => items.find(item => item.page === page && item.cell === cell);

export function freeCell(items: HomeItem[]): { page: number; cell: number } {
  for (let page = 0; ; page++) {
    for (let cell = 0; cell < CELLS; cell++) if (!reserved(page, cell) && !itemAt(items, page, cell)) return { page, cell };
  }
}

export function isPlaced(layout: HomeLayout, app: string): boolean {
  return layout.dock.includes(app) || layout.items.some(item => item.app === app || item.folder?.apps.includes(app));
}

export function addApp(layout: HomeLayout, app: string): HomeLayout {
  if (isPlaced(layout, app)) return layout;
  return { ...layout, items: [...layout.items, { id: crypto.randomUUID(), ...freeCell(layout.items), app }] };
}

/** Removes an app everywhere; a folder left with one app turns back into that app's icon. */
export function removeApp(layout: HomeLayout, app: string): HomeLayout {
  const items = layout.items.flatMap((item): HomeItem[] => {
    if (item.app === app) return [];
    if (!item.folder) return [item];
    const apps = item.folder.apps.filter(member => member !== app);
    if (apps.length === 0) return [];
    if (apps.length === 1) return [{ id: item.id, page: item.page, cell: item.cell, app: apps[0] }];
    return [{ ...item, folder: { ...item.folder, apps } }];
  });
  return { ...layout, items, dock: layout.dock.filter(member => member !== app) };
}

/** Dropping an app on an app makes a folder; on a folder adds to it; on an empty cell moves it. */
export function moveItem(layout: HomeLayout, id: string, page: number, cell: number): HomeLayout {
  const item = layout.items.find(entry => entry.id === id);
  const target = itemAt(layout.items, page, cell);
  if (!item || reserved(page, cell) || target?.id === id) return layout;
  if (!target) return { ...layout, items: layout.items.map(entry => (entry.id === id ? { ...entry, page, cell } : entry)) };
  if (!item.app) return layout;
  const existing = target.folder?.apps ?? (target.app ? [target.app] : null);
  if (!existing) return layout;
  const apps = [...existing, item.app];
  const folder = { name: target.folder?.name ?? "", apps };
  return {
    ...layout,
    items: layout.items.filter(entry => entry.id !== id).map(entry => (entry.id === target.id ? { id: entry.id, page, cell, folder } : entry)),
  };
}

export function renameFolder(layout: HomeLayout, id: string, name: string): HomeLayout {
  return { ...layout, items: layout.items.map(item => (item.id === id && item.folder ? { ...item, folder: { ...item.folder, name } } : item)) };
}

/** Takes an app out of a folder and gives it its own cell. */
export function ejectFromFolder(layout: HomeLayout, app: string): HomeLayout {
  return addApp(removeApp(layout, app), app);
}

export function sync(layout: HomeLayout, installed: string[]): HomeLayout {
  const firstRun = layout.seen.length === 0 && layout.items.length === 0;
  let next: HomeLayout = firstRun ? { ...layout, dock: DEFAULT_DOCK.filter(app => installed.includes(app)) } : layout;
  const fresh = firstRun ? DEFAULT_HOME : installed.filter(app => !layout.seen.includes(app));
  for (const app of fresh) if (installed.includes(app)) next = addApp(next, app);
  for (const app of layout.seen) if (!installed.includes(app)) next = removeApp(next, app);
  // Layouts saved before the widget area grew get their icons moved out of it.
  for (const item of next.items.filter(entry => reserved(entry.page, entry.cell))) {
    const rest = next.items.filter(entry => entry !== item);
    next = { ...next, items: [...rest, { ...item, ...freeCell(rest) }] };
  }
  return { ...next, seen: installed };
}

export const pageCount = (items: HomeItem[]) => Math.max(1, ...items.map(item => item.page + 1));
