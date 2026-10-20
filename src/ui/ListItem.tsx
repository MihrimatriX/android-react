import type { ReactNode } from "react";
import { Icon } from "./Button";
import { useLongPress } from "./gesture";

interface ListItemProps {
  icon?: string;
  leading?: ReactNode;
  headline: ReactNode;
  supporting?: ReactNode;
  trailing?: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  onLongPress?: () => void;
}

export function ListItem({ icon, leading, headline, supporting, trailing, selected, onClick, onLongPress }: ListItemProps) {
  const longPress = useLongPress(() => onLongPress?.());
  const interactive = !!(onClick || onLongPress);
  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-selected={selected}
      onClick={interactive ? onClick : undefined}
      onKeyDown={event => interactive && event.key === "Enter" && onClick?.()}
      {...(onLongPress ? longPress : {})}
      className={`flex min-h-14 items-center gap-4 px-4 py-2 ${interactive ? "ripple" : ""} ${selected ? "bg-secondary-container text-on-secondary-container" : ""}`}
    >
      {icon && <Icon name={icon} className="text-on-surface-variant" />}
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate text-body-lg">{headline}</div>
        {supporting && <div className="line-clamp-2 text-body text-on-surface-variant">{supporting}</div>}
      </div>
      {trailing && <div className="flex shrink-0 items-center gap-2 text-label-sm text-on-surface-variant">{trailing}</div>}
    </div>
  );
}

export function Subheader({ children }: { children: ReactNode }) {
  return <div className="px-4 pt-4 pb-2 text-title-sm text-primary">{children}</div>;
}

const AVATAR_TONES = ["bg-primary-container text-on-primary-container", "bg-secondary-container text-on-secondary-container", "bg-tertiary-container text-on-tertiary-container"];

export function Avatar({ name, src, size = 40, icon }: { name?: string; src?: string; size?: number; icon?: string }) {
  const tone = AVATAR_TONES[(name?.charCodeAt(0) ?? 0) % AVATAR_TONES.length];
  const style = { width: `${size / 16}rem`, height: `${size / 16}rem`, fontSize: `${size / 40}rem` };
  if (src) return <img src={src} alt="" style={style} className="shrink-0 rounded-full object-cover" />;
  return (
    <span style={style} className={`grid shrink-0 place-items-center rounded-full font-medium ${tone}`}>
      {name?.trim() ? name.trim()[0].toLocaleUpperCase() : <Icon name={icon ?? "person"} />}
    </span>
  );
}
