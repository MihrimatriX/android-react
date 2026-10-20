import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";

export interface DragInfo {
  dx: number;
  dy: number;
  /** Velocity in px/ms at release, used for fling decisions. */
  vx: number;
  vy: number;
}

interface DragOptions {
  axis?: "x" | "y";
  onMove?: (info: DragInfo) => void;
  onEnd?: (info: DragInfo) => void;
}

interface Track {
  id: number;
  x: number;
  y: number;
  lastX: number;
  lastY: number;
  lastTime: number;
  vx: number;
  vy: number;
  active: boolean;
}

const SLOP = 8;

/** Pointer-based drag with an axis lock, so a vertical list still scrolls under a horizontal swipe. */
export function useDrag(options: DragOptions) {
  const latest = useRef(options);
  latest.current = options;
  const track = useRef<Track | null>(null);
  const dragged = useRef(false);
  const info = (event: PointerEvent, state: Track): DragInfo => ({ dx: event.clientX - state.x, dy: event.clientY - state.y, vx: state.vx, vy: state.vy });

  const finish = (event: PointerEvent) => {
    const state = track.current;
    track.current = null;
    if (!state || state.id !== event.pointerId || !state.active) return;
    dragged.current = true;
    latest.current.onEnd?.(info(event, state));
  };

  return {
    onPointerDown(event: PointerEvent) {
      if (event.button !== 0) return;
      const now = performance.now();
      track.current = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, lastTime: now, vx: 0, vy: 0, active: false };
      dragged.current = false;
    },
    onPointerMove(event: PointerEvent) {
      const state = track.current;
      if (!state || state.id !== event.pointerId) return;
      const dx = event.clientX - state.x;
      const dy = event.clientY - state.y;
      if (!state.active) {
        if (Math.hypot(dx, dy) < SLOP) return;
        const horizontal = Math.abs(dx) > Math.abs(dy);
        if ((latest.current.axis === "x" && !horizontal) || (latest.current.axis === "y" && horizontal)) {
          track.current = null;
          return;
        }
        state.active = true;
        try {
          (event.currentTarget as Element).setPointerCapture(event.pointerId);
        } catch {
          // the pointer was already released (cancelled touch); the drag still works without capture
        }
      }
      const now = performance.now();
      const elapsed = Math.max(1, now - state.lastTime);
      state.vx = (event.clientX - state.lastX) / elapsed;
      state.vy = (event.clientY - state.lastY) / elapsed;
      Object.assign(state, { lastX: event.clientX, lastY: event.clientY, lastTime: now });
      latest.current.onMove?.(info(event, state));
    },
    onPointerUp: finish,
    onPointerCancel: finish,
    // A drag must not also count as a tap on whatever is under the finger.
    onClickCapture(event: MouseEvent) {
      if (!dragged.current) return;
      dragged.current = false;
      event.stopPropagation();
      event.preventDefault();
    },
  };
}

export function useLongPress(onLongPress: (event: { clientX: number; clientY: number }) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const start = useRef({ x: 0, y: 0 });
  const fired = useRef(false);
  const stop = () => clearTimeout(timer.current);
  return {
    onPointerDown(event: PointerEvent) {
      fired.current = false;
      start.current = { x: event.clientX, y: event.clientY };
      const point = { clientX: event.clientX, clientY: event.clientY };
      timer.current = setTimeout(() => {
        fired.current = true;
        onLongPress(point);
      }, 450);
    },
    onPointerMove(event: PointerEvent) {
      if (Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > SLOP) stop();
    },
    onPointerUp: stop,
    onPointerCancel: stop,
    onContextMenu: (event: MouseEvent) => event.preventDefault(),
    onClickCapture(event: MouseEvent) {
      if (!fired.current) return;
      fired.current = false;
      event.stopPropagation();
    },
  };
}

/** Re-renders every animation frame while `active` (stopwatch digits, waveforms, seek bars). */
export function useFrame(active: boolean): void {
  const [, setFrame] = useState(0);
  useEffect(() => {
    if (!active) return;
    let frame = requestAnimationFrame(function tick() {
      setFrame(value => value + 1);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [active]);
}
