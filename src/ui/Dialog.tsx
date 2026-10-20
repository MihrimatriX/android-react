import { useState, type ReactNode } from "react";
import { useBackHandler } from "../kernel";
import { Icon } from "./Button";
import { useDrag } from "./gesture";

/*
 * Overlays use `fixed`: every app window (and the screen) sets CSS containment, which makes it the
 * containing block, so they cover their own window rather than the browser viewport.
 */

export function Dialog({ open, onClose, icon, title, children, actions }: {
  open: boolean;
  onClose: () => void;
  icon?: string;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  useBackHandler(onClose, open);
  if (!open) return null;
  return (
    <div className="enter fixed inset-0 z-50 grid place-items-center bg-black/40 p-6" onClick={onClose}>
      <div role="dialog" aria-modal onClick={event => event.stopPropagation()} className="pop w-full max-w-[19rem] rounded-4xl bg-surface-high p-6 text-on-surface shadow-xl">
        {icon && <Icon name={icon} className="mx-auto mb-4 block text-secondary" />}
        {title && <h2 className={`mb-4 text-headline-sm ${icon ? "text-center" : ""}`}>{title}</h2>}
        <div className="text-body text-on-surface-variant">{children}</div>
        {actions && <div className="mt-6 flex flex-wrap justify-end gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode }) {
  useBackHandler(onClose, open);
  const [offset, setOffset] = useState(0);
  const drag = useDrag({
    axis: "y",
    onMove: ({ dy }) => setOffset(Math.max(0, dy)),
    onEnd: ({ dy, vy }) => {
      setOffset(0);
      if (dy > 120 || vy > 0.6) onClose();
    },
  });
  if (!open) return null;
  return (
    <div className="enter fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        onClick={event => event.stopPropagation()}
        className="enter-up max-h-[88%] overflow-y-auto rounded-t-4xl bg-surface-low text-on-surface"
        style={{ transform: `translateY(${offset}px)`, paddingBottom: "var(--inset-bottom)" }}
      >
        <div {...drag} className="flex touch-none justify-center py-4">
          <span className="h-1 w-8 rounded-full bg-outline" />
        </div>
        {title && <h2 className="px-6 pb-3 text-title-lg">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export interface MenuItem {
  label: string;
  icon?: string;
  onClick: () => void;
}

/** Overflow menu anchored under the app bar's trailing edge. */
export function Menu({ open, onClose, items }: { open: boolean; onClose: () => void; items: MenuItem[] }) {
  useBackHandler(onClose, open);
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        role="menu"
        className="pop fixed right-2 z-50 min-w-48 origin-top-right rounded-xl bg-surface-container py-2 text-on-surface shadow-xl"
        style={{ top: "calc(var(--inset-top) + 3.5rem)" }}
      >
        {items.map(item => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              item.onClick();
            }}
            className="ripple flex h-12 w-full items-center gap-3 px-4 text-left text-label"
          >
            {item.icon && <Icon name={item.icon} className="text-on-surface-variant" />}
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}
