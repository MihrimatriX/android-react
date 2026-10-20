import { Component, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { getApp, pick, useLang, useSettings, useT, type Activity, type Task } from "../kernel";
import { makeOs } from "../kernel/context";
import { ActivityContext, killTask, switchTo, useOs, type Rect } from "../kernel/os";
import { AppGlyph, Button } from "../ui";
import { S } from "./strings";
import { useUi } from "./store";

const CARD_SCALE = 0.68;
/** Follows --back / --back-x, which the back gesture sets while the finger is down. */
const BACK_PREVIEW = "translateX(calc(var(--back, 0) * var(--back-x, 1) * 1.25rem)) scale(calc(1 - var(--back, 0) * 0.1))";
/** Home gesture: the window rides up with the finger and shrinks towards recents-card size. */
const homeLift = (dy: number) => `translateY(${Math.round(dy * 0.6)}px) scale(${Math.max(CARD_SCALE, 1 + dy / 900)})`;
/** Horizontal distance between recents cards, as a fraction of the screen width. */
const CARD_STEP = CARD_SCALE + 0.05;
const DECELERATE = "cubic-bezier(0.05, 0.7, 0.1, 1)";
const ACCELERATE = "cubic-bezier(0.3, 0, 0.8, 0.15)";

class CrashBoundary extends Component<{ app: string; onClose: () => void; children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false };
  static getDerivedStateFromError() {
    return { crashed: true };
  }
  render() {
    return this.state.crashed ? <CrashNotice app={this.props.app} onClose={this.props.onClose} /> : this.props.children;
  }
}

function CrashNotice({ app, onClose }: { app: string; onClose: () => void }) {
  const t = useT(S);
  const name = pick(getApp(app)?.name ?? ["?", "?"]);
  return (
    <div className="grid h-full place-items-center bg-black/40 p-8">
      <div role="alertdialog" className="pop rounded-4xl bg-surface-high p-6 text-on-surface">
        <p className="mb-6 text-title-lg">{t("stopped", { app: name })}</p>
        <Button variant="text" icon="close" onClick={onClose}>{t("closeApp")}</Button>
      </div>
    </div>
  );
}

function ActivityView({ activity, top, task }: { activity: Activity; top: boolean; task: number }) {
  const app = getApp(activity.app);
  const os = useMemo(() => makeOs(activity.app, activity.id), [activity.app, activity.id]);
  if (!app) return null;
  const { Component: Screen } = app;
  return (
    <ActivityContext.Provider value={activity.id}>
      <div inert={!top} className={`enter absolute inset-0 bg-surface [contain:layout_style] ${top ? "" : "invisible"}`}>
        <CrashBoundary app={activity.app} onClose={() => killTask(task)}>
          <Screen intent={activity.intent} route={activity.routes.at(-1) ?? "main"} os={os} />
        </CrashBoundary>
      </div>
    </ActivityContext.Provider>
  );
}

const fromRect = (rect: Rect, element: HTMLElement) =>
  `translate(${rect.x}px, ${rect.y}px) scale(${rect.width / element.offsetWidth}, ${rect.height / element.offsetHeight})`;

function TaskWindow({ task, index }: { task: Task; index: number }) {
  const lang = useLang();
  const { foreground, recents } = useOs(useShallow(state => ({ foreground: state.foreground, recents: state.recents })));
  const scroll = useUi(state => state.recentsScroll);
  const animScale = useSettings(state => state.animScale);
  const ref = useRef<HTMLDivElement>(null);
  const wasFront = useRef(false);
  const [leaving, setLeaving] = useState(false);
  const [drag, setDrag] = useState<{ y: number; live: boolean }>({ y: 0, live: false });
  const front = foreground === task.id;
  const homeDrag = useUi(state => state.homeDrag);
  const lifting = front && !recents && homeDrag !== null;
  // Remembered past the release, so the go-home shrink starts where the finger left the window.
  const lastLift = useRef(0);
  if (lifting) lastLift.current = homeDrag;
  else if (front) lastLift.current = 0;

  // Open from the tapped icon and shrink away when going home, like Pixel's launcher transitions.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || recents) return void (wasFront.current = front);
    if (front && !wasFront.current) {
      const origin = useOs.getState().launchFrom;
      const start = origin
        ? { transform: fromRect(origin, element), transformOrigin: "0 0", borderRadius: "40%", opacity: 0.5 }
        : { transform: "scale(0.94)", transformOrigin: "50% 50%", opacity: 0 };
      element.animate([start, { transform: "none", transformOrigin: start.transformOrigin, borderRadius: "0", opacity: 1 }], { duration: 420 * animScale, easing: DECELERATE });
    } else if (!front && wasFront.current && foreground === null) {
      setLeaving(true);
      const from = lastLift.current ? homeLift(lastLift.current) : "none";
      lastLift.current = 0;
      element.animate([{ transform: from, opacity: 1 }, { transform: "translateY(12%) scale(0.45)", opacity: 0, borderRadius: "56px" }], { duration: 280 * animScale, easing: ACCELERATE });
      // A timer, not onfinish: animations stall in background tabs and the window would stay visible.
      setTimeout(() => setLeaving(false), 280 * animScale);
    }
    wasFront.current = front;
  }, [front, recents, foreground, animScale]);

  const pointer = useRef<{ x: number; y: number; scroll: number; mode?: "x" | "y" } | null>(null);
  const width = () => ref.current?.offsetWidth ?? 360;
  const onPointerDown = (event: PointerEvent) => {
    pointer.current = { x: event.clientX, y: event.clientY, scroll: useUi.getState().recentsScroll };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent) => {
    const start = pointer.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    start.mode ??= Math.hypot(dx, dy) > 8 ? (Math.abs(dx) > Math.abs(dy) ? "x" : "y") : undefined;
    if (start.mode === "x") useUi.setState({ recentsScroll: start.scroll + dx / (width() * CARD_STEP) });
    if (start.mode === "y") setDrag({ y: Math.min(0, dy), live: true });
  };
  const onPointerUp = (event: PointerEvent) => {
    const start = pointer.current;
    pointer.current = null;
    if (!start) return;
    if (!start.mode) return switchTo(task.id);
    if (start.mode === "x") return useUi.setState(({ recentsScroll }) => ({ recentsScroll: Math.round(recentsScroll) }));
    const dismissed = event.clientY - start.y < -(ref.current?.offsetHeight ?? 800) * 0.2;
    setDrag({ y: dismissed ? -(ref.current?.offsetHeight ?? 800) : 0, live: false });
    if (dismissed) setTimeout(() => killTask(task.id), 200 * animScale);
  };

  const root = task.activities[0];
  const app = getApp(root.app);
  const card = `translateX(${(scroll - index) * CARD_STEP * 100}%) translateY(${drag.y}px) scale(${CARD_SCALE})`;
  let transform = recents ? card : BACK_PREVIEW;
  if (lifting) transform = homeLift(homeDrag);
  return (
    <div
      ref={ref}
      className={`pointer-events-auto absolute inset-0 [contain:layout_style] ${drag.live || lifting ? "" : "anim"} ${front || recents || leaving ? "" : "invisible"}`}
      style={{ transform, zIndex: front ? 2 : 1 }}
    >
      <div inert={!front || recents} className={`anim absolute inset-0 overflow-hidden ${recents || lifting ? "rounded-[3.5rem] shadow-2xl" : ""}`} style={recents || lifting ? undefined : { borderRadius: "calc(var(--back, 0) * 2.5rem)" }}>
        {task.activities.map((activity, position) => (
          <ActivityView key={activity.id} activity={activity} task={task.id} top={position === task.activities.length - 1} />
        ))}
      </div>
      {recents && (
        <>
          <div className="absolute -top-20 left-1/2 flex -translate-x-1/2 items-center gap-3 text-headline-sm text-white">
            {app && <AppGlyph app={app} size={40} />}
            {app && pick(app.name, undefined, lang)}
          </div>
          <div className="absolute inset-0 touch-none" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} />
        </>
      )}
    </div>
  );
}

export function Tasks() {
  const tasks = useOs(state => state.tasks);
  // Recents order: most recently used first, so index 0 sits in the centre.
  const order = useMemo(() => tasks.toSorted((a, b) => b.lastActive - a.lastActive).map(task => task.id), [tasks]);
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {tasks.map(task => (
        <TaskWindow key={task.id} task={task} index={order.indexOf(task.id)} />
      ))}
    </div>
  );
}
