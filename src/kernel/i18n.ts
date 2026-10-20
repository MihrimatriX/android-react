import { useCallback } from "react";
import { getSettings, useSettings } from "./settings";
import type { Lang, Strings, Text } from "./types";

type Vars = Record<string, string | number>;

function fill(template: string, vars?: Vars): string {
  return vars ? template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? "")) : template;
}

/** Resolves a text outside React (receivers, notifications) using the current language. */
export function pick(text: Text, vars?: Vars, lang: Lang = getSettings().lang): string {
  return fill(text[lang === "tr" ? 0 : 1], vars);
}

export function useLang(): Lang {
  return useSettings(settings => settings.lang);
}

export function useT<S extends Strings>(strings: S): (key: keyof S, vars?: Vars) => string {
  const lang = useLang();
  return useCallback((key: keyof S, vars?: Vars) => pick(strings[key], vars, lang), [strings, lang]);
}

export const locale = (lang: Lang = getSettings().lang) => (lang === "tr" ? "tr-TR" : "en-US");

export function formatTime(time: Date | number, lang: Lang = getSettings().lang): string {
  return new Intl.DateTimeFormat(locale(lang), { hour: "numeric", minute: "2-digit", hour12: lang === "en" }).format(time);
}

export function formatDate(time: Date | number, options: Intl.DateTimeFormatOptions, lang: Lang = getSettings().lang): string {
  return new Intl.DateTimeFormat(locale(lang), options).format(time);
}

/** Local-time "YYYYMMDD_HHMMSS" for file names, as Android camera and screenshot files use. */
export function fileStamp(date = new Date()): string {
  const two = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}_${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`;
}

export function formatSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  const power = Math.min(units.length - 1, Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(1024)));
  return `${(bytes / 1024 ** power).toFixed(power ? 1 : 0)} ${units[power]}`;
}

export function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const clock = `${String(Math.floor(total / 60) % 60).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  return hours ? `${hours}:${clock}` : clock;
}

/** Strings shared by many screens. */
export const COMMON = {
  ok: ["Tamam", "OK"],
  cancel: ["İptal", "Cancel"],
  save: ["Kaydet", "Save"],
  delete: ["Sil", "Delete"],
  edit: ["Düzenle", "Edit"],
  share: ["Paylaş", "Share"],
  search: ["Ara", "Search"],
  rename: ["Yeniden adlandır", "Rename"],
  retry: ["Tekrar dene", "Retry"],
  back: ["Geri", "Back"],
  more: ["Diğer seçenekler", "More options"],
  close: ["Kapat", "Close"],
  add: ["Ekle", "Add"],
  name: ["Ad", "Name"],
  loading: ["Yükleniyor…", "Loading…"],
  offline: ["Bağlantı yok", "No connection"],
  offlineHint: ["Wi-Fi'yi açın veya uçak modunu kapatın", "Turn on Wi-Fi or turn off airplane mode"],
  error: ["Bir şeyler ters gitti", "Something went wrong"],
  permissionNeeded: ["İzin gerekli", "Permission required"],
  grant: ["İzin ver", "Allow"],
  today: ["Bugün", "Today"],
  yesterday: ["Dün", "Yesterday"],
  deleteConfirm: ["Silinsin mi?", "Delete?"],
  start: ["Başlat", "Start"],
  pause: ["Duraklat", "Pause"],
  stop: ["Durdur", "Stop"],
  reset: ["Sıfırla", "Reset"],
  play: ["Oynat", "Play"],
  label: ["Etiket", "Label"],
  untitled: ["Adsız", "Untitled"],
  open: ["Aç", "Open"],
} satisfies Strings;
