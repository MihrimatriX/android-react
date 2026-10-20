import { useMemo } from "react";
import { create } from "zustand";
import { deviceId } from "./storage";
import type { FileEntry } from "./types";

export const DIR = "inode/directory";
const ROOT_DIRS = ["/DCIM", "/Pictures", "/Download", "/Music", "/Documents", "/Recordings"];

const MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", flac: "audio/flac",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  txt: "text/plain", md: "text/markdown", json: "application/json", html: "text/html", pdf: "application/pdf",
};

export const extension = (path: string) => /\.([^./]+)$/.exec(path)?.[1]?.toLowerCase() ?? "";
export const mimeOf = (path: string) => MIME[extension(path)] ?? "application/octet-stream";
export const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);
export const dirname = (path: string) => path.slice(0, path.lastIndexOf("/")) || "/";
export const join = (dir: string, name: string) => `${dir === "/" ? "" : dir}/${name}`;
const isInside = (path: string, dir: string) => path.startsWith(dir === "/" ? "/" : `${dir}/`);

/** Picks "name (1).ext", "name (2).ext"… when `path` is taken, like Android's download manager. */
export function uniquePath(path: string, taken: (candidate: string) => boolean): string {
  if (!taken(path)) return path;
  const dot = basename(path).lastIndexOf(".");
  const stem = dot > 0 ? path.slice(0, path.length - basename(path).length + dot) : path;
  const ext = dot > 0 ? basename(path).slice(dot) : "";
  for (let copy = 1; ; copy++) if (!taken(`${stem} (${copy})${ext}`)) return `${stem} (${copy})${ext}`;
}

/** Directories never stored explicitly are implied by the files below them. */
export function listDir(entries: FileEntry[], dir: string): FileEntry[] {
  const children = new Map<string, FileEntry>();
  for (const entry of entries) {
    if (!isInside(entry.path, dir)) continue;
    const name = entry.path.slice(dir === "/" ? 1 : dir.length + 1).split("/")[0];
    const path = join(dir, name);
    const direct = path === entry.path;
    if (direct && entry.mime !== DIR) children.set(path, entry);
    else if (!children.has(path)) children.set(path, { path, mime: DIR, size: 0, mtime: entry.mtime });
  }
  return [...children.values()].sort((a, b) => Number(b.mime === DIR) - Number(a.mime === DIR) || a.path.localeCompare(b.path));
}

export const useFileIndex = create(() => ({ entries: [] as FileEntry[] }));
export const exists = (path: string) => useFileIndex.getState().entries.some(entry => entry.path === path || isInside(entry.path, path));
const api = (suffix: string) => `/api/files/${deviceId}${suffix}`;

export async function loadIndex(): Promise<void> {
  const response = await fetch(api("")).catch(() => null);
  const entries: FileEntry[] = response?.ok ? await response.json() : [];
  const missing = ROOT_DIRS.filter(dir => !entries.some(entry => entry.path === dir || isInside(entry.path, dir)));
  useFileIndex.setState({ entries });
  await Promise.all(missing.map(mkdir));
}

export const fileUrl = (path: string) => api(`/raw?path=${encodeURIComponent(path)}`);

export async function writeFile(path: string, data: Blob | string, mime = mimeOf(path)): Promise<FileEntry> {
  const response = await fetch(fileUrl(path), { method: "PUT", body: data, headers: { "content-type": mime } });
  if (!response.ok) throw new Error(`write failed: ${response.status}`);
  const entry: FileEntry = await response.json();
  useFileIndex.setState(({ entries }) => ({ entries: [...entries.filter(item => item.path !== path), entry] }));
  return entry;
}

export async function readFile(path: string): Promise<Blob> {
  const response = await fetch(fileUrl(path));
  if (!response.ok) throw new Error(`read failed: ${response.status}`);
  return response.blob();
}

export async function mkdir(path: string): Promise<void> {
  if (!exists(path)) await writeFile(path, "", DIR);
}

export async function removeFile(path: string): Promise<void> {
  await fetch(fileUrl(path), { method: "DELETE" });
  useFileIndex.setState(({ entries }) => ({ entries: entries.filter(item => item.path !== path && !isInside(item.path, path)) }));
}

async function transfer(op: "move" | "copy", from: string, to: string): Promise<void> {
  const response = await fetch(api("/op"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, from, to }) });
  if (!response.ok) throw new Error(`${op} failed`);
  useFileIndex.setState(({ entries }) => {
    const moved = entries.filter(item => item.path === from || isInside(item.path, from));
    const renamed = moved.map(item => ({ ...item, path: to + item.path.slice(from.length), mtime: Date.now() }));
    const kept = entries.filter(item => item.path !== to && !isInside(item.path, to) && (op === "copy" || !moved.includes(item)));
    return { entries: [...kept, ...renamed] };
  });
}

export const moveFile = (from: string, to: string) => transfer("move", from, to);
export const copyFile = (from: string, to: string) => transfer("copy", from, to);

export function useDir(dir: string): FileEntry[] {
  const entries = useFileIndex(state => state.entries);
  return useMemo(() => listDir(entries, dir), [entries, dir]);
}

/** Every file (not directory) under `dir` matching a MIME prefix, newest first. */
export function useMedia(prefixes: string[], dir = "/"): FileEntry[] {
  const entries = useFileIndex(state => state.entries);
  return useMemo(
    () =>
      entries
        .filter(entry => isInside(entry.path, dir) && prefixes.some(prefix => entry.mime.startsWith(prefix)))
        .sort((a, b) => b.mtime - a.mtime),
    [entries, dir, prefixes.join()],
  );
}
