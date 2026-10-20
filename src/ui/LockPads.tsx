import { useRef, useState, type PointerEvent } from "react";
import { feedback, haptic } from "../kernel";
import { Icon } from "./Button";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "back", "0", "enter"];
const KEY_ICONS: Record<string, string> = { back: "backspace", enter: "keyboard_return" };

export function PinPad({ value, onChange, onSubmit, labels }: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  labels: { delete: string; enter: string };
}) {
  const press = (key: string) => {
    feedback("click");
    if (key === "back") onChange(value.slice(0, -1));
    else if (key === "enter") onSubmit();
    else if (value.length < 16) onChange(value + key);
  };
  return (
    <div className="flex flex-col items-center gap-6">
      <div aria-live="polite" className="flex h-6 items-center gap-3">
        {Array.from(value, (_, index) => (
          <span key={index} className="pop size-3 rounded-full bg-current" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-x-8 gap-y-4">
        {KEYS.map(key => (
          <button
            key={key}
            type="button"
            aria-label={{ back: labels.delete, enter: labels.enter }[key] ?? key}
            onClick={() => press(key)}
            className={`ripple grid size-18 place-items-center rounded-full text-headline ${key === "enter" ? "bg-primary text-on-primary" : "bg-white/15"}`}
          >
            {KEY_ICONS[key] ? <Icon name={KEY_ICONS[key]} /> : key}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 3×3 pattern lock; reports the visited dots as a string such as "0124". */
export function PatternPad({ onComplete, error }: { onComplete: (pattern: string) => void; error?: boolean }) {
  const [path, setPath] = useState<number[]>([]);
  const [finger, setFinger] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const locate = (event: PointerEvent) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return null;
    const x = ((event.clientX - box.left) / box.width) * 3;
    const y = ((event.clientY - box.top) / box.height) * 3;
    const column = Math.floor(x);
    const row = Math.floor(y);
    const onDot = column >= 0 && column < 3 && row >= 0 && row < 3 && Math.hypot(x - column - 0.5, y - row - 0.5) < 0.32;
    return { x, y, dot: onDot ? row * 3 + column : -1 };
  };
  const visit = (event: PointerEvent) => {
    const point = locate(event);
    if (!point) return;
    setFinger({ x: point.x, y: point.y });
    if (point.dot >= 0 && !path.includes(point.dot)) {
      haptic("light");
      setPath(current => (current.includes(point.dot) ? current : [...current, point.dot]));
    }
  };
  const finish = () => {
    if (path.length) onComplete(path.join(""));
    setFinger(null);
    setTimeout(() => setPath([]), 350);
  };
  const center = (dot: number) => ({ x: (dot % 3) + 0.5, y: Math.floor(dot / 3) + 0.5 });
  const points = [...path.map(center), ...(finger ? [finger] : [])].map(point => `${point.x},${point.y}`).join(" ");

  return (
    <div
      ref={ref}
      role="application"
      className={`relative size-64 touch-none ${error ? "text-error" : "text-current"}`}
      onPointerDown={event => {
        event.currentTarget.setPointerCapture(event.pointerId);
        setPath([]);
        visit(event);
      }}
      onPointerMove={event => event.buttons && visit(event)}
      onPointerUp={finish}
      onPointerCancel={finish}
    >
      <svg viewBox="0 0 3 3" className="absolute inset-0 size-full overflow-visible">
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth={0.06} strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
        {Array.from({ length: 9 }, (_, dot) => (
          <circle key={dot} cx={center(dot).x} cy={center(dot).y} r={path.includes(dot) ? 0.11 : 0.06} fill="currentColor" className="anim-fast" />
        ))}
      </svg>
    </div>
  );
}
