import { useEffect, useState, type CSSProperties } from "react";
import { useShallow } from "zustand/react/shallow";
import { feedback, formatDate, hashSecret, useBattery, useLang, useNow, useSettings, useT, wallpaperCss, type Notification } from "../kernel";
import { groupNotifications, useNotifications } from "../kernel/notifications";
import { foregroundTask, launch, useOs } from "../kernel/os";
import { unlock, usePower } from "../kernel/power";
import { Icon, IconButton, PatternPad, PinPad, useDrag } from "../ui";
import { NotificationCard, openNotification } from "./NotificationCard";
import { S } from "./strings";

/**
 * How long input stays blocked after the n-th consecutive wrong PIN/pattern (0 = no wait).
 * Today: 30 s after every fifth miss, which never gets stricter for a determined guesser.
 */
function lockoutDelay(failures: number): number {
  // TODO(human): design an escalating policy here.
  return failures % 5 === 0 ? 30000 : 0;
}

export function LockScreen() {
  const t = useT(S);
  const lang = useLang();
  const now = useNow("second");
  const locked = usePower(state => state.locked);
  const overLock = useOs(state => !state.recents && !!foregroundTask()?.activities.at(-1)?.intent.showWhenLocked && state.foreground !== null);
  const { lock, lockNotifications, wallpaper } = useSettings(useShallow(state => ({ lock: state.lock, lockNotifications: state.lockNotifications, wallpaper: state.wallpaper })));
  const notifications = useNotifications(state => state.list);
  const battery = useBattery();
  const [stage, setStage] = useState<"glance" | "auth">("glance");
  const [lift, setLift] = useState(0);
  const [pin, setPin] = useState("");
  const [failures, setFailures] = useState(0);
  const [blockedUntil, setBlockedUntil] = useState(0);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);

  useEffect(() => {
    if (!locked) return;
    setStage("glance");
    setPin("");
    setPending(null);
  }, [locked]);

  const done = () => {
    unlock();
    setFailures(0);
    pending?.();
  };
  const proceed = () => (lock.kind === "pin" || lock.kind === "pattern" ? setStage("auth") : done());
  const drag = useDrag({
    axis: "y",
    onMove: ({ dy }) => setLift(Math.min(0, dy)),
    onEnd: ({ dy, vy }) => {
      setLift(0);
      if (dy < -120 || vy < -0.6) proceed();
    },
  });

  const blocked = blockedUntil > now;
  const verify = async (secret: string) => {
    if (blocked) return;
    if ((await hashSecret(secret)) === lock.hash) return done();
    feedback("error", "heavy");
    setError(true);
    setPin("");
    setTimeout(() => setError(false), 900);
    const next = failures + 1;
    setFailures(next);
    const delay = lockoutDelay(next);
    if (delay > 0) setBlockedUntil(Date.now() + delay);
  };
  const openAfterUnlock = (notification: Notification) => {
    setPending(() => () => openNotification(notification));
    proceed();
  };

  const prompt = () => {
    if (blocked) return t("tryAgainIn", { seconds: Math.ceil((blockedUntil - now) / 1000) });
    if (error) return t("wrong");
    return t(lock.kind === "pin" ? "enterPin" : "drawPattern");
  };

  const time = new Date(now);
  const hours = String(lang === "en" ? time.getHours() % 12 || 12 : time.getHours()).padStart(2, "0");
  const minutes = String(time.getMinutes()).padStart(2, "0");

  if (!locked || overLock) return null;
  const groups = lockNotifications ? groupNotifications(notifications).slice(0, 4) : [];
  return (
    <div className="enter absolute inset-0 z-40 flex flex-col text-white" style={{ paddingTop: "var(--inset-top)", background: `linear-gradient(rgb(0 0 0 / 0.3), rgb(0 0 0 / 0.3)), ${wallpaperCss(wallpaper)}` }}>
      {stage === "glance" ? (
        <div {...drag} className="flex flex-1 touch-none flex-col" style={{ transform: `translateY(${lift}px)`, opacity: 1 + lift / 400 }}>
          {/* Pixel's big stacked clock, which shrinks to one line when notifications need the room. */}
          <div className="flex flex-col items-center pt-8 text-center">
            <p className="text-title">{formatDate(now, { weekday: "long", day: "numeric", month: "long" }, lang)}</p>
            <div className={`anim mt-2 font-light tabular-nums ${groups.length ? "text-[4.5rem] leading-[3.75rem]" : "text-[9.5rem] leading-[7.75rem]"}`} style={{ color: "oklch(from var(--seed) 0.9 0.07 h)" }}>
              {groups.length ? `${hours}:${minutes}` : <><div>{hours}</div><div>{minutes}</div></>}
            </div>
            {battery.charging && (
              <p className="mt-4 flex items-center gap-2 text-label">
                <span className="relative grid size-5 place-items-center">
                  <span className="absolute inset-0 rounded-full bg-green-400" style={{ animation: "charge 1.8s ease-out infinite" }} />
                  <Icon name="bolt" filled size={16} className="relative text-green-200" />
                </span>
                {t("chargingLevel", { level: Math.round(battery.level * 100) })}
              </p>
            )}
          </div>
          <div className="mt-6 flex flex-1 flex-col gap-2 overflow-hidden px-4">
            {groups.map((group, index) => (
              <div key={group.key} className="rise" style={{ "--i": index } as CSSProperties}>
                <NotificationCard notification={group.items[0]} onOpen={openAfterUnlock} />
              </div>
            ))}
          </div>
          <div className="flex items-end justify-between px-8 pb-8">
            <IconButton icon="flashlight_on" label={t("tileFlashlight")} variant="tonal" size={52} onClick={() => useSettings.setState(state => ({ flashlight: !state.flashlight }))} />
            <p className="flex flex-col items-center pb-2 text-body text-white/80">
              <Icon name="keyboard_arrow_up" className="animate-[nudge_2s_ease-in-out_infinite]" />
              {t("swipeToUnlock")}
            </p>
            <IconButton
              icon="photo_camera"
              label={t("cameraShortcut")}
              variant="tonal"
              size={52}
              onClick={() => {
                setPending(() => () => void launch("camera"));
                proceed();
              }}
            />
          </div>
        </div>
      ) : (
        <div className="enter flex flex-1 flex-col items-center justify-end gap-8 pb-16 backdrop-blur-md">
          <p className={`text-title-lg ${error ? "text-red-300" : ""}`}>
            {prompt()}
          </p>
          <div className={blocked ? "pointer-events-none opacity-30" : ""}>
            {lock.kind === "pin" ? (
              <PinPad value={pin} onChange={setPin} onSubmit={() => void verify(pin)} labels={{ delete: t("deleteKey"), enter: t("enter") }} />
            ) : (
              <PatternPad error={error} onComplete={pattern => void verify(pattern)} />
            )}
          </div>
          <button type="button" className="ripple rounded-full px-4 py-2 text-label" onClick={() => setStage("glance")}>
            {t("back")}
          </button>
        </div>
      )}
    </div>
  );
}
