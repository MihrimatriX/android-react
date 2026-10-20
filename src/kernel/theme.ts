import { useSyncExternalStore } from "react";
import { fileUrl } from "./fs";
import { setSettings, useSettings } from "./settings";

export const WALLPAPERS: Record<string, { css: string; seed: string }> = {
  dusk: {
    seed: "#5b6cc9",
    css: "radial-gradient(90% 60% at 15% 10%, #9fb0ff 0%, transparent 60%), radial-gradient(80% 60% at 90% 95%, #f2a7c9 0%, transparent 60%), linear-gradient(165deg, #273071, #5a3f8d 55%, #b9679a)",
  },
  forest: {
    seed: "#3f7d5a",
    css: "radial-gradient(80% 50% at 80% 15%, #c9e7a7 0%, transparent 55%), radial-gradient(90% 70% at 10% 90%, #1d4d3a 0%, transparent 70%), linear-gradient(170deg, #2f6b4f, #4f8f5f 50%, #183c2e)",
  },
  ember: {
    seed: "#c4622d",
    css: "radial-gradient(70% 50% at 25% 20%, #ffd29a 0%, transparent 60%), radial-gradient(90% 60% at 85% 85%, #7a1f2b 0%, transparent 65%), linear-gradient(160deg, #e0813f, #b8452f 55%, #5d1e2c)",
  },
  ocean: {
    seed: "#1f7a8c",
    css: "radial-gradient(80% 50% at 70% 10%, #a6f0f0 0%, transparent 55%), radial-gradient(90% 70% at 20% 100%, #0b2e4a 0%, transparent 70%), linear-gradient(175deg, #2a9bab, #1a6a86 50%, #0d3150)",
  },
  sand: {
    seed: "#a07a4f",
    css: "radial-gradient(80% 60% at 20% 15%, #fff1d6 0%, transparent 60%), radial-gradient(70% 50% at 90% 90%, #8b6844 0%, transparent 60%), linear-gradient(170deg, #e9d2ae, #c8a477 55%, #8d6a47)",
  },
  night: {
    seed: "#4b4f9e",
    css: "radial-gradient(60% 40% at 75% 18%, #6a6fd6 0%, transparent 60%), radial-gradient(90% 60% at 10% 90%, #301a52 0%, transparent 65%), linear-gradient(180deg, #0f1230, #1d1f4a 50%, #120d26)",
  },
};

/** Built-in ids map to gradients; anything else is a file path from the gallery. */
export function wallpaperCss(wallpaper: string): string {
  return WALLPAPERS[wallpaper]?.css ?? `center / cover no-repeat url("${fileUrl(wallpaper)}"), #222`;
}

/**
 * Material You seeds the palette from the wallpaper's most prominent *colourful* colour,
 * not its average (which tends to mud). Pixels are bucketed by hue and weighted by chroma.
 */
function pickSeed(pixels: Uint8ClampedArray): string {
  const buckets = Array.from({ length: 24 }, () => ({ weight: 0, red: 0, green: 0, blue: 0 }));
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const [red, green, blue] = [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
    const max = Math.max(red, green, blue);
    const chroma = max - Math.min(red, green, blue);
    if (chroma < 24 || max < 40) continue;
    let hue = (red - green) / chroma + 4;
    if (max === red) hue = ((green - blue) / chroma + 6) % 6;
    else if (max === green) hue = (blue - red) / chroma + 2;
    const bucket = buckets[Math.floor((hue / 6) * 24) % 24];
    bucket.weight += chroma;
    bucket.red += red * chroma;
    bucket.green += green * chroma;
    bucket.blue += blue * chroma;
  }
  const best = buckets.reduce((top, bucket) => (bucket.weight > top.weight ? bucket : top));
  if (!best.weight) return "#6b6f80";
  const hex = (sum: number) => Math.round(sum / best.weight).toString(16).padStart(2, "0");
  return `#${hex(best.red)}${hex(best.green)}${hex(best.blue)}`;
}

async function seedFromImage(url: string): Promise<string> {
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return "#6b6f80";
  context.drawImage(image, 0, 0, 64, 64);
  return pickSeed(context.getImageData(0, 0, 64, 64).data);
}

export async function setWallpaper(wallpaper: string): Promise<void> {
  const seed = WALLPAPERS[wallpaper]?.seed ?? (await seedFromImage(fileUrl(wallpaper)).catch(() => "#6b6f80"));
  setSettings({ wallpaper, seed });
}

const darkQuery = () => globalThis.matchMedia?.("(prefers-color-scheme: dark)");
const subscribeDark = (notify: () => void) => {
  darkQuery()?.addEventListener("change", notify);
  return () => darkQuery()?.removeEventListener("change", notify);
};

/** Battery saver forces dark theme, as on Pixel. */
export function useDarkMode(): boolean {
  const systemDark = useSyncExternalStore(subscribeDark, () => darkQuery()?.matches ?? false);
  return useSettings(({ theme, batterySaver }) => batterySaver || theme === "dark" || (theme === "auto" && systemDark));
}
