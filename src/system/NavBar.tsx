import { useRef, useState, type PointerEvent } from "react";
import { feedback, haptic, useSettings, useT } from "../kernel";
import { back, goHome, showRecents, switchTo, useOs } from "../kernel/os";
import { Icon } from "../ui";
import { useLightBars } from "./StatusBar";
import { S } from "./strings";
import { useUi } from "./store";

function previousTask(): number | undefined {
  const { tasks, foreground } = useOs.getState();
  return tasks.toSorted((a, b) => b.lastActive - a.lastActive).find(task => task.id !== foreground)?.id;
}

export const home = () => {
  useUi.setState({ drawer: false });
  goHome();
};

/** Swipe up = home, swipe up and hold = recents, swipe sideways along the handle = previous app. */
function GestureHandle({ light }: { light: boolean }) {
  const start = useRef<{ x: number; y: number; at: number; lastY: number; still: number; armed: boolean } | null>(null);
  const lift = useUi(state => state.homeDrag) ?? 0;
  const setLift = (homeDrag: number | null) => useUi.setState({ homeDrag });
  const onDown = (event: PointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = { x: event.clientX, y: event.clientY, at: Date.now(), lastY: event.clientY, still: Date.now(), armed: false };
  };
  const onMove = (event: PointerEvent) => {
    const gesture = start.current;
    if (!gesture) return;
    if (Math.abs(event.clientY - gesture.lastY) > 3) gesture.still = Date.now();
    gesture.lastY = event.clientY;
    const dy = event.clientY - gesture.y;
    setLift(Math.min(0, Math.round(dy)));
    if (!gesture.armed && dy < -80 && Date.now() - gesture.still > 220) {
      gesture.armed = true;
      haptic("medium");
    }
  };
  const onUp = (event: PointerEvent) => {
    const gesture = start.current;
    start.current = null;
    setLift(null);
    if (!gesture) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (gesture.armed) return showRecents(true);
    if (dy < -40) {
      feedback("tick");
      return home();
    }
    const previous = Math.abs(dx) > 60 ? previousTask() : undefined;
    if (previous !== undefined) switchTo(previous);
  };
  return (
    <div className="absolute inset-x-0 bottom-0 z-[46] flex h-6 touch-none justify-center" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <span
        className="mt-2.5 h-1 w-28 rounded-full"
        style={{ background: light ? "#fff" : "var(--md-on-surface)", transform: `translateY(${Math.round(lift / 4)}px)`, opacity: 0.9 }}
      />
    </div>
  );
}

/** Android 15 predictive back: the edge swipe's progress shrinks the app before you let go. */
function previewBack(progress: number, side: "left" | "right"): void {
  const screen = document.querySelector<HTMLElement>(".screen");
  screen?.style.setProperty("--back", String(progress));
  screen?.style.setProperty("--back-x", side === "left" ? "1" : "-1");
}

/** Edge swipe inwards = back, with the arrow bubble that follows the finger. */
function BackEdge({ side }: { side: "left" | "right" }) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const [pull, setPull] = useState<{ distance: number; y: number } | null>(null);
  const direction = side === "left" ? 1 : -1;
  const onDown = (event: PointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = { x: event.clientX, y: event.clientY };
  };
  const onMove = (event: PointerEvent) => {
    if (!start.current) return;
    const distance = Math.max(0, (event.clientX - start.current.x) * direction);
    if (distance > 70 && (pull?.distance ?? 0) <= 70) haptic("light");
    const box = event.currentTarget.getBoundingClientRect();
    setPull({ distance, y: event.clientY - box.top });
    previewBack(Math.min(1, distance / 160), side);
  };
  const onUp = () => {
    if (pull && pull.distance > 70) {
      feedback("tick");
      back();
    }
    start.current = null;
    setPull(null);
    previewBack(0, side);
  };
  return (
    <div
      className={`absolute top-(--inset-top) bottom-6 z-[46] w-3 touch-none ${side === "left" ? "left-0" : "right-0"}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {pull && (
        <span
          className="absolute grid size-9 place-items-center rounded-full bg-surface-highest text-on-surface shadow"
          style={{ top: pull.y - 18, [side]: Math.min(pull.distance, 90) / 3, opacity: Math.min(1, pull.distance / 70), transform: `scale(${pull.distance > 70 ? 1.1 : 0.9})` }}
        >
          <Icon name={side === "left" ? "arrow_back" : "arrow_forward"} size={20} />
        </span>
      )}
    </div>
  );
}

export function NavBar() {
  const t = useT(S);
  const mode = useSettings(state => state.navMode);
  const light = useLightBars();
  const recents = useOs(state => state.recents);
  if (mode === "gesture") {
    return (
      <>
        <BackEdge side="left" />
        <BackEdge side="right" />
        <GestureHandle light={light} />
      </>
    );
  }
  const button = "ripple grid h-12 w-20 place-items-center rounded-full";
  return (
    <nav className="absolute inset-x-0 bottom-0 z-[46] flex h-12 items-center justify-around px-6" style={{ color: light ? "#fff" : "var(--md-on-surface)" }}>
      <button type="button" aria-label={t("back")} className={button} onClick={back}>
        <Icon name="change_history" size={20} className="-rotate-90" />
      </button>
      <button type="button" aria-label={t("home")} className={button} onClick={home}>
        <Icon name="radio_button_unchecked" size={22} />
      </button>
      <button type="button" aria-label={t("recents")} className={button} onClick={() => showRecents(!recents)}>
        <Icon name="crop_square" size={20} />
      </button>
    </nav>
  );
}
