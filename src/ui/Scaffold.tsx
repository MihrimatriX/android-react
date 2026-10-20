import type { ReactNode } from "react";
import { COMMON, useLightStatusBar, useT } from "../kernel";
import { Icon, IconButton } from "./Button";

interface ScaffoldProps {
  title?: ReactNode;
  onBack?: () => void;
  actions?: ReactNode;
  fab?: ReactNode;
  bottom?: ReactNode;
  large?: boolean;
  /** Dark, edge-to-edge content (camera, viewers) gets light status bar icons. */
  dark?: boolean;
  className?: string;
  children: ReactNode;
}

/** Window insets, app bar, scrolling body, FAB and bottom bar in one place (Compose's Scaffold). */
export function Scaffold({ title, onBack, actions, fab, bottom, large, dark, className = "", children }: ScaffoldProps) {
  useLightStatusBar(!!dark);
  return (
    <div
      className={`flex h-full flex-col ${dark ? "bg-black text-white" : ""} ${className.includes("bg-") || dark ? "" : "bg-surface text-on-surface"} ${className}`}
      style={{ paddingTop: "var(--inset-top)", paddingBottom: bottom ? 0 : "var(--inset-bottom)" }}
    >
      {title !== undefined && <AppBar title={title} onBack={onBack} actions={actions} large={large} />}
      <div className="relative min-h-0 flex-1">
        <main className="absolute inset-0 overflow-y-auto overscroll-contain">{children}</main>
        {fab && <div className="absolute right-4 bottom-4 z-10">{fab}</div>}
      </div>
      {bottom && (
        <div className="shrink-0 bg-surface-container" style={{ paddingBottom: "var(--inset-bottom)" }}>
          {bottom}
        </div>
      )}
    </div>
  );
}

export function AppBar({ title, onBack, actions, large }: Pick<ScaffoldProps, "title" | "onBack" | "actions" | "large">) {
  const t = useT(COMMON);
  const backButton = onBack && <IconButton icon="arrow_back" label={t("back")} onClick={onBack} />;
  if (large) {
    return (
      <header className="shrink-0 px-1 pt-1">
        <div className="flex h-14 items-center">
          {backButton}
          <div className="ml-auto flex">{actions}</div>
        </div>
        <h1 className="px-4 pt-4 pb-5 text-headline">{title}</h1>
      </header>
    );
  }
  return (
    <header className="flex h-16 shrink-0 items-center gap-1 px-1">
      {backButton ?? <span className="w-3" />}
      <h1 className="min-w-0 flex-1 truncate px-2 text-title-lg">{title}</h1>
      {actions}
    </header>
  );
}

export interface NavItem<T extends string> {
  value: T;
  icon: string;
  label: string;
}

export function BottomNav<T extends string>({ items, value, onChange }: { items: NavItem<T>[]; value: T; onChange: (value: T) => void }) {
  return (
    // Even, whole-pixel columns: the 64px indicator then centres on a whole pixel whatever the item count.
    <nav className="grid h-20 items-start justify-center pt-3" style={{ gridTemplateColumns: `repeat(${items.length}, round(down, ${100 / items.length}%, 2px))` }}>
      {items.map(item => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            onClick={() => onChange(item.value)}
            className="flex min-w-0 flex-col items-center gap-1 text-label-sm"
          >
            <span
              className={`ripple anim grid h-8 w-16 place-items-center rounded-full ${active ? "bg-secondary-container text-on-secondary-container" : "text-on-surface-variant"}`}
            >
              <Icon name={item.icon} filled={active} />
            </span>
            <span className={active ? "text-on-surface" : "text-on-surface-variant"}>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
