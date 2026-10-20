import { useShallow } from "zustand/react/shallow";
import { formatTime, getApp, useAlarms, useBattery, useLang, useNow, useOnline, useSettings } from "../kernel";
import { useNotifications } from "../kernel/notifications";
import { foregroundTask, useOs } from "../kernel/os";
import { usePower } from "../kernel/power";
import { Icon, useDrag } from "../ui";
import { pullShade, releaseShade, useUi } from "./store";

/** White icons over wallpaper and dark content; theme colour inside apps. */
export function useLightBars(): boolean {
  const shade = useUi(state => state.shade);
  const locked = usePower(state => state.locked);
  const setup = usePower(state => state.phase === "setup");
  const { recents, lightBars } = useOs(useShallow(state => ({ recents: state.recents, lightBars: state.lightBars, tasks: state.tasks, foreground: state.foreground })));
  if (shade || setup) return false;
  const top = foregroundTask()?.activities.at(-1);
  if (top?.intent.showWhenLocked && !recents) return lightBars.includes(top.id);
  if (locked || recents || !top) return true;
  return lightBars.includes(top.id);
}

function batteryIcon(level: number, charging: boolean): string {
  if (charging) return "battery_charging_full";
  const bars = Math.round(level * 7);
  return bars >= 7 ? "battery_full" : `battery_${bars}_bar`;
}

export function StatusBar() {
  const lang = useLang();
  const now = useNow();
  const online = useOnline();
  const light = useLightBars();
  const settings = useSettings(useShallow(({ wifi, airplane, dnd, ringer, bluetooth, batterySaver }) => ({ wifi, airplane, dnd, ringer, bluetooth, batterySaver })));
  const battery = useBattery();
  const alarmSet = useAlarms(state => state.alarms.some(alarm => alarm.clock));
  const sensing = useOs(state => state.sensing.length > 0);
  const apps = useNotifications(useShallow(state => [...new Set(state.list.filter(item => item.importance !== "min").map(item => item.app))]));
  const phase = usePower(state => state.phase);
  const ready = phase === "ready";
  const drag = useDrag({
    axis: "y",
    onMove: ({ dy }) => ready && pullShade(dy),
    onEnd: ({ dy, vy }) => ready && releaseShade(dy, vy),
  });

  return (
    <div
      {...drag}
      // Capture at once: a quick pull leaves the 36px bar before the drag slop is crossed.
      onPointerDown={event => {
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.onPointerDown(event);
      }}
      className="anim absolute inset-x-0 top-0 z-[92] flex h-(--inset-top) touch-none items-center gap-2 px-7 text-[0.8125rem] leading-5 font-medium"
      style={{ color: light ? "#fff" : "var(--md-on-surface)" }}
    >
      <span className="tabular-nums">{formatTime(now, lang)}</span>
      <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
        {apps.slice(0, 4).map(app => (
          <Icon key={app} name={getApp(app)?.icon ?? "notifications"} size={16} />
        ))}
        {apps.length > 4 && <span className="size-1 rounded-full bg-current" />}
      </span>
      <span className="flex items-center gap-1">
        {alarmSet && <Icon name="alarm" size={16} />}
        {settings.dnd && <Icon name="do_not_disturb_on" size={16} />}
        {settings.ringer === "vibrate" && <Icon name="vibration" size={16} />}
        {settings.ringer === "silent" && <Icon name="volume_off" size={16} />}
        {settings.bluetooth && <Icon name="bluetooth" size={16} />}
        {settings.airplane ? (
          <Icon name="flight" size={16} />
        ) : (
          settings.wifi && <Icon name={online ? "network_wifi" : "signal_wifi_statusbar_not_connected"} filled size={16} />
        )}
        <Icon name={batteryIcon(battery.level, battery.charging)} filled size={16} className={settings.batterySaver ? "text-amber-400" : ""} />
        <span className="tabular-nums">{Math.round(battery.level * 100)}</span>
        {sensing && <span aria-hidden className="ml-1 size-2 rounded-full bg-green-500" />}
      </span>
    </div>
  );
}
