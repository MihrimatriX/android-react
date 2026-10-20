import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useShallow } from "zustand/react/shallow";
import { pick, useBattery, useDarkMode, useSettings, useT, wallpaperCss } from "../kernel";
import { useBuzz } from "../kernel/device";
import { notify, SYSTEM } from "../kernel/notifications";
import { showRecents } from "../kernel/os";
import { usePower, wake } from "../kernel/power";
import { DeviceToolbar } from "./DeviceToolbar";
import { hold, useSystemEffects } from "./effects";
import { provision } from "./provision";
import { Keyboard } from "./Keyboard";
import { Launcher } from "./Launcher";
import { LockScreen } from "./LockScreen";
import { NavBar } from "./NavBar";
import { Shade } from "./NotificationShade";
import { FullScreenAlert, HeadsUp, SystemDialogs, Toasts } from "./Overlays";
import { Recents } from "./Recents";
import { Boot, Setup } from "./Setup";
import { StatusBar } from "./StatusBar";
import { S } from "./strings";
import { setShade, useUi } from "./store";
import { Tasks } from "./Tasks";
import { VolumePanel } from "./VolumePanel";

function SideButton({ button, top, height, label }: { button: "power" | "up" | "down"; top: string; height: string; label: string }) {
  return <button type="button" aria-label={label} className="side-button" style={{ top, height }} {...hold(button)} />;
}

/** Desktops have no motor; the frame shakes for the duration of a vibration instead. */
function useBuzzing(): boolean {
  const until = useBuzz(state => state.until);
  const [buzzing, setBuzzing] = useState(false);
  useEffect(() => {
    const remaining = until - Date.now();
    setBuzzing(remaining > 0);
    if (remaining <= 0) return;
    const timer = setTimeout(() => setBuzzing(false), remaining);
    return () => clearTimeout(timer);
  }, [until]);
  return buzzing;
}

/** Real torch on phones that expose it; desktops just show the LED glow on the frame. */
function useTorch(on: boolean): void {
  useEffect(() => {
    if (!on || !navigator.maxTouchPoints || !navigator.mediaDevices) return;
    let stream: MediaStream | undefined;
    let cancelled = false;
    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then(media => {
        stream = media;
        if (cancelled) return media.getTracks().forEach(track => track.stop());
        return media.getVideoTracks()[0]?.applyConstraints({ advanced: [{ torch: true } as MediaTrackConstraintSet] });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      stream?.getTracks().forEach(track => track.stop());
    };
  }, [on]);
}

function useLowBatteryWarning(): void {
  const level = useBattery(state => state.level);
  const charging = useBattery(state => state.charging);
  const warned = useRef(false);
  useEffect(() => {
    if (charging || level > 0.15) warned.current = false;
    else if (!warned.current) {
      warned.current = true;
      notify(SYSTEM, { icon: "battery_alert", title: pick(S.lowBattery), text: pick(S.lowBatteryText, { level: Math.round(level * 100) }), intent: { app: "settings", action: "MAIN", extras: { page: "battery" } } });
    }
  }, [level, charging]);
}

export function Shell() {
  const t = useT(S);
  const screen = useRef<HTMLDivElement>(null);
  const settings = useSettings(
    useShallow(({ seed, animScale, fontScale, brightness, navMode, wallpaper, flashlight, lang }) => ({ seed, animScale, fontScale, brightness, navMode, wallpaper, flashlight, lang })),
  );
  const [nextDevice] = useState(() => crypto.randomUUID().slice(0, 8));
  const dark = useDarkMode();
  const { phase, screenOn, dimmed } = usePower(useShallow(state => ({ phase: state.phase, screenOn: state.screenOn, dimmed: state.dimmed })));
  const keyboardHeight = useUi(state => state.keyboardHeight);
  const flashAt = useUi(state => state.flashAt);
  const homePage = useUi(state => state.homePage);
  // The OS-level "reduce motion" preference wins over the developer animation scale.
  const animScale = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : settings.animScale;
  const buzzing = useBuzzing();
  useSystemEffects(screen);
  useTorch(settings.flashlight);
  useLowBatteryWarning();

  // Like Android density: 1rem tracks the screen width (412dp reference), so the phone looks the same at any size.
  useEffect(() => {
    const element = screen.current;
    if (!element) return;
    const resize = () => {
      document.documentElement.style.fontSize = `${(element.clientWidth / 412) * 16}px`;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    document.documentElement.lang = settings.lang;
  }, [settings.lang]);
  useEffect(() => {
    if (phase === "ready") void provision();
  }, [phase]);
  useEffect(() => {
    if (screenOn) return;
    setShade(0);
    showRecents(false);
  }, [screenOn]);

  const navInset = settings.navMode === "gesture" ? 1.5 : 3;
  const style = {
    "--seed": settings.seed,
    "--anim": animScale,
    "--font-scale": settings.fontScale,
    "--inset-top": "2.25rem",
    "--inset-bottom": `calc(${navInset}rem + ${keyboardHeight}px)`,
  } as CSSProperties;

  return (
    <div className="stage grid place-items-center">
      {/* On desktops the torch lights the desk; on phones useTorch drives the real LED instead. */}
      <div aria-hidden className={`torch desktop-only ${settings.flashlight ? "on" : ""}`} style={{ "--anim": animScale } as CSSProperties} />
      {/* The phone alone is centred; the toolbar hangs off its right edge. */}
      <div className="relative isolate">
        {/* Light the lit screen throws on the desk, in the wallpaper's colour. */}
        <div
          aria-hidden
          className="desktop-only pointer-events-none absolute -inset-x-40 -inset-y-28 -z-10 rounded-full blur-3xl transition-opacity duration-700"
          style={{ background: `radial-gradient(closest-side, oklch(from ${settings.seed} 0.55 0.14 h / 0.32) 55%, transparent)`, opacity: screenOn ? settings.brightness : 0 }}
        />
        <div className={`frame ${buzzing ? "buzz" : ""}`}>
          <SideButton button="power" top="12.5rem" height="5rem" label={t("power")} />
          <SideButton button="up" top="19.5rem" height="4rem" label={t("volumeUp")} />
          <SideButton button="down" top="24rem" height="4rem" label={t("volumeDown")} />
          <div ref={screen} className="device screen" data-theme={dark ? "dark" : "light"} style={style}>
            <div className="absolute inset-0 overflow-hidden">
              <div className="anim anim-slow absolute -inset-[6%]" style={{ translate: `${-homePage * 2.5}% 0` }}>
                <div className={`absolute inset-0 ${animScale > 0 ? "wallpaper-drift" : ""}`} style={{ background: wallpaperCss(settings.wallpaper) }} />
              </div>
            </div>
            {phase === "ready" && (
              <>
                <Launcher />
                <Recents />
                <Tasks />
                <LockScreen />
                <NavBar />
                <Shade />
                <VolumePanel />
                <HeadsUp />
                <FullScreenAlert />
              </>
            )}
            {phase !== "boot" && <StatusBar />}
            {phase === "setup" && <Setup />}
            {phase === "boot" && <Boot />}
            <SystemDialogs />
            <Toasts />
            <Keyboard />
            <span className="punch-hole pointer-events-none absolute top-2.5 left-1/2 z-[200] size-3.5 -translate-x-1/2 rounded-full bg-black ring-2 ring-white/5" />
            {flashAt > 0 && <div key={flashAt} className="pointer-events-none absolute inset-0 z-[140] bg-white" style={{ animation: "flash 350ms ease-out forwards" }} />}
            <div className="anim-slow pointer-events-none absolute inset-0 z-[150] bg-black" style={{ opacity: (1 - settings.brightness) * 0.8 + (dimmed ? 0.4 : 0) }} />
            {!screenOn && <div className="absolute inset-0 z-[160] bg-black" onClick={wake} />}
          </div>
        </div>
        <DeviceToolbar nextDevice={nextDevice} />
      </div>
    </div>
  );
}
