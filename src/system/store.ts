import { create } from "zustand";

/** System UI state shared between the status bar, launcher, gestures and overlays. */
export const useUi = create(() => ({
  /** 0 closed, 1 notifications with compact tiles, 2 full quick settings. */
  shade: 0 as 0 | 1 | 2,
  /** Finger distance in px while the closed shade is being pulled down; null when no pull is in progress. */
  shadeDrag: null as number | null,
  /** Finger lift in px (≤ 0) while the home gesture is in progress; null otherwise. */
  homeDrag: null as number | null,
  drawer: false,
  /** Time the volume panel was last poked; 0 hides it. */
  volumeAt: 0,
  keyboardHeight: 0,
  recentsScroll: 0,
  /** Home page index, for the wallpaper's parallax. */
  homePage: 0,
  /** Screenshot flash trigger. */
  flashAt: 0,
}));

export const setShade = (shade: 0 | 1 | 2) => useUi.setState({ shade });

export const pullShade = (dy: number) => useUi.setState({ shadeDrag: Math.max(0, Math.round(dy)) });

/** Like Android: a long pull or a downward fling opens it; a long pull goes straight to full quick settings. */
export function releaseShade(dy: number, velocity: number) {
  const open = dy > 64 || velocity > 0.4;
  useUi.setState({ shadeDrag: null, shade: open ? (dy > 280 ? 2 : 1) : 0 });
}

/** Position of an element relative to the phone screen, for launch animations. */
export function screenRect(element: Element) {
  const box = element.getBoundingClientRect();
  const screen = element.closest(".screen")?.getBoundingClientRect() ?? { left: 0, top: 0 };
  return { x: box.left - screen.left, y: box.top - screen.top, width: box.width, height: box.height };
}

/** Converts viewport coordinates to phone-screen coordinates. */
export function toScreen(clientX: number, clientY: number) {
  const screen = document.querySelector(".screen")?.getBoundingClientRect() ?? { left: 0, top: 0, width: 400, height: 860 };
  return { x: clientX - screen.left, y: clientY - screen.top, width: screen.width, height: screen.height };
}
