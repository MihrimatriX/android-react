import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Icon({ name, filled, size, className = "" }: { name: string; filled?: boolean; size?: number; className?: string }) {
  return (
    <span aria-hidden className={`icon ${filled ? "filled" : ""} ${className}`} style={size ? { fontSize: `${size / 16}rem` } : undefined}>
      {name}
    </span>
  );
}

type Native = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">;

const BUTTON = {
  filled: "bg-primary text-on-primary",
  tonal: "bg-secondary-container text-on-secondary-container",
  outlined: "border border-outline text-primary",
  text: "text-primary",
  danger: "bg-error text-on-error",
};

export function Button({ variant = "filled", icon, children, className = "", ...rest }: Native & { variant?: keyof typeof BUTTON; icon?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`ripple inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full text-label disabled:pointer-events-none disabled:opacity-40 ${icon ? "pr-6 pl-4" : "px-6"} ${BUTTON[variant]} ${className}`}
      {...rest}
    >
      {icon && <Icon name={icon} size={18} />}
      {children}
    </button>
  );
}

const ICON_BUTTON = {
  standard: "text-on-surface-variant",
  filled: "bg-primary text-on-primary",
  tonal: "bg-secondary-container text-on-secondary-container",
  outlined: "border border-outline-variant text-on-surface-variant",
};

export function IconButton({ icon, label, variant = "standard", selected, size = 40, className = "", ...rest }: Native & {
  icon: string;
  label: string;
  variant?: keyof typeof ICON_BUTTON;
  selected?: boolean;
  size?: number;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={selected}
      className={`ripple grid shrink-0 place-items-center rounded-full disabled:opacity-40 ${selected ? "bg-primary text-on-primary" : ICON_BUTTON[variant]} ${className}`}
      style={{ width: `${size / 16}rem`, height: `${size / 16}rem` }}
      {...rest}
    >
      <Icon name={icon} filled={selected} />
    </button>
  );
}

export function Fab({ icon, label, extended, className = "", ...rest }: Native & { icon: string; label: string; extended?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`ripple pop flex h-14 items-center gap-3 rounded-2xl bg-primary-container text-on-primary-container shadow-lg shadow-black/20 ${extended ? "pr-5 pl-4" : "w-14 justify-center"} ${className}`}
      {...rest}
    >
      <Icon name={icon} />
      {extended && <span className="text-label">{label}</span>}
    </button>
  );
}

export function Chip({ label, icon, selected, ...rest }: Native & { label: string; icon?: string; selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`ripple flex h-8 shrink-0 items-center gap-2 rounded-lg px-3 text-label ${selected ? "bg-secondary-container text-on-secondary-container" : "border border-outline-variant text-on-surface-variant"}`}
      {...rest}
    >
      {(selected || icon) && <Icon name={selected ? "check" : (icon ?? "")} size={18} />}
      {label}
    </button>
  );
}
