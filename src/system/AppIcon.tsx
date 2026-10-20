import type { HTMLAttributes } from "react";
import { pick, useLang, type AppDef } from "../kernel";
import { AppGlyph } from "../ui";

/** Themed (Material You) app icon, optionally with its label. */
export function AppIcon({ app, size = 56, label = true, onWallpaper, className = "", ...rest }: HTMLAttributes<HTMLButtonElement> & {
  app: AppDef;
  size?: number;
  label?: boolean;
  onWallpaper?: boolean;
}) {
  const lang = useLang();
  const name = pick(app.name, undefined, lang);
  return (
    <button type="button" aria-label={name} className={`group flex w-full min-w-0 flex-col items-center gap-1.5 ${className}`} {...rest}>
      {/* Pixel's launcher squeezes the icon under the finger instead of drawing a ripple. */}
      <span data-glyph className="anim-fast transition-transform duration-150 group-active:scale-[0.88]">
        <AppGlyph app={app} size={size} />
      </span>
      {label && (
        <span className={`w-full truncate px-0.5 text-center text-body-sm ${onWallpaper ? "text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.45)]" : "text-on-surface"}`}>
          {name}
        </span>
      )}
    </button>
  );
}
