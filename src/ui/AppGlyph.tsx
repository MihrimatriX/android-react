import type { ReactNode } from "react";
import { formatDate, useLang, useNow, useSettings, type AppDef } from "../kernel";
import { Icon } from "./Button";

const rem = (px: number) => `${px / 16}rem`;

/** Analog face with ticking hands; hands follow currentColor so it also works as a themed icon. */
function ClockFace() {
  const now = new Date(useNow("second"));
  const minutes = now.getMinutes() + now.getSeconds() / 60;
  const hand = (degrees: number, length: number, width: number, color = "currentColor") => (
    <line x1="50" y1="50" x2="50" y2={50 - length} stroke={color} strokeWidth={width} strokeLinecap="round" transform={`rotate(${degrees} 50 50)`} />
  );
  return (
    <svg viewBox="0 0 100 100" className="size-full">
      {Array.from({ length: 12 }, (_, tick) => (
        <circle key={tick} cx="50" cy="15" r={tick % 3 ? 1.6 : 2.8} fill="currentColor" opacity={0.5} transform={`rotate(${tick * 30} 50 50)`} />
      ))}
      {hand(((now.getHours() % 12) + minutes / 60) * 30, 19, 7)}
      {hand(minutes * 6, 29, 5)}
      {hand(now.getSeconds() * 6, 33, 2, "#e8613c")}
      <circle cx="50" cy="50" r="4.5" fill="#e8613c" />
    </svg>
  );
}

function CalendarDate({ size }: { size: number }) {
  const lang = useLang();
  const now = useNow();
  return (
    <span className="flex flex-col items-center leading-none">
      <span className="font-semibold uppercase" style={{ fontSize: rem(Math.round(size * 0.16)) }}>
        {formatDate(now, { weekday: "short" }, lang)}
      </span>
      <span style={{ fontSize: rem(Math.round(size * 0.42)) }}>{new Date(now).getDate()}</span>
    </span>
  );
}

/** Pixel-style adaptive icon colours: a tonal background and a deeper glyph, both from the app's one hue. */
function iconColors({ hue, chroma = 1 }: AppDef["tint"]): { background: string; glyph: string } {
  // Same lightness and chroma for every app, so the set reads as one family whatever the hue.
  return { background: `oklch(0.92 ${0.06 * chroma} ${hue})`, glyph: `oklch(0.45 ${0.15 * chroma} ${hue})` };
}

/**
 * The one place app icons are drawn (home, drawer, folders, recents, store, settings).
 * Own colours by default; the wallpaper palette when "Themed icons" is on.
 */
export function AppGlyph({ app, size = 56 }: { app: AppDef; size?: number }) {
  const themed = useSettings(state => state.themedIcons);
  const colors = themed ? undefined : iconColors(app.tint);
  // An even glyph size keeps it centred on whole pixels.
  let content: ReactNode = <Icon name={app.icon} filled size={Math.round(size * 0.27) * 2} />;
  if (app.liveIcon === "clock") content = <ClockFace />;
  if (app.liveIcon === "calendar") content = <CalendarDate size={size} />;
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full shadow-[0_1px_2px_rgb(0_0_0/0.24)] ${themed ? "bg-primary-container text-on-primary-container" : ""}`}
      style={{ width: rem(size), height: rem(size), background: colors?.background, color: colors?.glyph, padding: app.liveIcon === "clock" ? rem(Math.round(size * 0.08)) : undefined }}
    >
      {content}
    </span>
  );
}
