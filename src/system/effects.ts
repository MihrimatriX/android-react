import { useEffect, type RefObject } from "react";
import { feedback } from "../kernel/device";
import { back } from "../kernel/os";
import { power, userActivity } from "../kernel/power";
import { getSettings } from "../kernel/settings";
import { takeScreenshot } from "./screenshot";
import { stepVolume } from "./VolumePanel";

/* Hardware buttons: actions fire on release so power + volume-down can be detected as a screenshot chord. */
type Button = "power" | "up" | "down";
const held = new Set<Button>();
let chord = false;

function pressButton(button: Button): void {
  held.add(button);
  if (held.has("power") && held.has("down") && !chord) {
    chord = true;
    void takeScreenshot();
  }
}

function releaseButton(button: Button): void {
  if (!held.delete(button)) return;
  if (chord) {
    chord = held.size > 0;
    return;
  }
  userActivity();
  if (button === "power") power();
  else stepVolume(button === "up" ? 1 : -1);
}

/** Pointer handlers for an on-screen hardware key, pressed and released like the real ones so the screenshot chord still works. */
export const hold = (button: Button) => ({
  onPointerDown: () => pressButton(button),
  onPointerUp: () => releaseButton(button),
  onPointerLeave: () => releaseButton(button),
});

const KEYS: Record<string, Button> = { F7: "power", F8: "down", F9: "up" };

function ripple(host: Element, event: PointerEvent): void {
  const box = host.getBoundingClientRect();
  const size = Math.hypot(box.width, box.height) * 2;
  const wave = document.createElement("span");
  wave.className = "ripple-wave";
  Object.assign(wave.style, { width: `${size}px`, height: `${size}px`, left: `${event.clientX - box.left - size / 2}px`, top: `${event.clientY - box.top - size / 2}px` });
  host.appendChild(wave);
  wave.addEventListener("animationend", () => wave.remove());
}

function showTap(screen: Element, event: PointerEvent): void {
  const box = screen.getBoundingClientRect();
  const dot = document.createElement("span");
  Object.assign(dot.style, {
    position: "absolute", zIndex: "220", width: "40px", height: "40px", borderRadius: "50%", pointerEvents: "none",
    background: "rgb(255 255 255 / 0.5)", border: "2px solid rgb(0 0 0 / 0.3)",
    left: `${event.clientX - box.left - 20}px`, top: `${event.clientY - box.top - 20}px`, animation: "tap 400ms ease-out forwards",
  });
  screen.appendChild(dot);
  dot.addEventListener("animationend", () => dot.remove());
}

/** One place for touch-wide behaviour: ripples, "show taps", click sound + haptic, and hardware keys. */
export function useSystemEffects(screen: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const element = screen.current;
    if (!element) return;
    const onPointerDown = (event: PointerEvent) => {
      userActivity();
      const host = (event.target as Element).closest(".ripple");
      if (host) ripple(host, event);
      if (getSettings().showTaps) showTap(element, event);
    };
    const onClick = (event: MouseEvent) => {
      const target = (event.target as Element).closest("button, [role=button], [role=switch], [role=tab], a");
      if (target && !target.closest("[data-no-feedback]")) feedback("click");
    };
    const onKeyDown = (event: KeyboardEvent) => {
      userActivity();
      if (KEYS[event.key]) {
        event.preventDefault();
        if (!event.repeat) pressButton(KEYS[event.key]);
      } else if (event.key === "Escape") back();
    };
    const onKeyUp = (event: KeyboardEvent) => KEYS[event.key] && releaseButton(KEYS[event.key]);
    element.addEventListener("pointerdown", onPointerDown, true);
    element.addEventListener("click", onClick, true);
    addEventListener("keydown", onKeyDown);
    addEventListener("keyup", onKeyUp);
    return () => {
      element.removeEventListener("pointerdown", onPointerDown, true);
      element.removeEventListener("click", onClick, true);
      removeEventListener("keydown", onKeyDown);
      removeEventListener("keyup", onKeyUp);
    };
  }, [screen]);
}
