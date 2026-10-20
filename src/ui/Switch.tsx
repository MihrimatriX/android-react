import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { Icon } from "./Button";

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={event => {
        event.stopPropagation();
        onChange(!checked);
      }}
      className={`anim relative h-8 w-13 shrink-0 rounded-full border-2 ${checked ? "border-primary bg-primary" : "border-outline bg-surface-highest"}`}
    >
      <span
        className={`anim absolute top-1/2 grid -translate-y-1/2 place-items-center rounded-full ${checked ? "left-5 size-6 bg-on-primary text-primary" : "left-1.5 size-4 bg-outline"}`}
      >
        {checked && <Icon name="check" size={16} />}
      </span>
    </button>
  );
}

interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  onCommit?: () => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  vertical?: boolean;
  /** Pixel-style thick slider with an icon inside the filled part (brightness, volume). */
  icon?: string;
}

export function Slider({ value, onChange, onCommit, min = 0, max = 1, step, label, vertical, icon }: SliderProps) {
  const ref = useRef<HTMLDivElement>(null);
  const ratio = Math.min(1, Math.max(0, (value - min) / (max - min || 1)));
  const emit = (next: number) => {
    const clamped = Math.min(max, Math.max(min, next));
    onChange(step ? Math.round(clamped / step) * step : clamped);
  };
  const fromPointer = (event: PointerEvent) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const position = vertical ? (box.bottom - event.clientY) / box.height : (event.clientX - box.left) / box.width;
    emit(min + position * (max - min));
  };
  const onKey = (event: KeyboardEvent) => {
    const delta = step ?? (max - min) / 20;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") emit(value + delta);
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") emit(value - delta);
  };
  const fill = vertical ? { height: `${ratio * 100}%` } : { width: `${ratio * 100}%` };
  const thick = !!icon;
  let size = thick ? "h-12" : "h-10";
  if (vertical) size = thick ? "w-12" : "w-10";
  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value * 100) / 100}
      aria-orientation={vertical ? "vertical" : "horizontal"}
      onKeyDown={onKey}
      onPointerDown={event => {
        event.currentTarget.setPointerCapture(event.pointerId);
        fromPointer(event);
      }}
      onPointerMove={event => event.buttons && fromPointer(event)}
      onPointerUp={() => onCommit?.()}
      className={`relative shrink-0 cursor-pointer touch-none overflow-hidden ${vertical ? "h-full" : "w-full"} ${thick ? "rounded-3xl bg-secondary-container" : ""} ${size}`}
    >
      {thick ? (
        <div className={`absolute bottom-0 left-0 rounded-3xl bg-primary ${vertical ? "w-full" : "h-full"}`} style={{ ...fill, minWidth: vertical ? undefined : "3rem", minHeight: vertical ? "3rem" : undefined }}>
          <Icon name={icon} className={`absolute text-on-primary ${vertical ? "bottom-3 left-1/2 -translate-x-1/2" : "top-1/2 left-3 -translate-y-1/2"}`} />
        </div>
      ) : (
        <>
          <div className={`absolute rounded-full bg-secondary-container ${vertical ? "inset-x-[1.125rem] inset-y-0" : "inset-x-0 inset-y-[1.125rem]"}`} />
          <div className={`absolute rounded-full bg-primary ${vertical ? "bottom-0 left-[1.125rem] w-1" : "top-[1.125rem] left-0 h-1"}`} style={fill} />
          <div
            className="absolute size-5 rounded-full bg-primary shadow"
            style={vertical ? { left: "0.625rem", bottom: `calc(${ratio * 100}% - 0.625rem)` } : { top: "0.625rem", left: `calc(${ratio * 100}% - 0.625rem)` }}
          />
        </>
      )}
    </div>
  );
}

export function Radio({ checked, onChange, label }: { checked: boolean; onChange: () => void; label?: string }) {
  return (
    <button type="button" role="radio" aria-checked={checked} aria-label={label} onClick={onChange} className="ripple grid size-10 shrink-0 place-items-center rounded-full">
      <span className={`grid size-5 place-items-center rounded-full border-2 ${checked ? "border-primary" : "border-on-surface-variant"}`}>
        {checked && <span className="size-2.5 rounded-full bg-primary" />}
      </span>
    </button>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={event => {
        event.stopPropagation();
        onChange(!checked);
      }}
      className="ripple grid size-10 shrink-0 place-items-center rounded-full"
    >
      <span className={`grid size-[1.125rem] place-items-center rounded-[2px] border-2 ${checked ? "border-primary bg-primary text-on-primary" : "border-on-surface-variant"}`}>
        {checked && <Icon name="check" size={14} />}
      </span>
    </button>
  );
}
