// budget: four complete tools (repeating alarms with snooze, timer, stopwatch with laps, world clock) behind one icon
import { useState, type ReactNode } from "react";
import { appStore, COMMON, formatDate, formatDuration, formatTime, locale, pick, useLang, useNow, useT, type AppDef, type AppProps, type Os } from "../kernel";
import { BottomNav, Chip, EmptyState, Fab, IconButton, ListItem, ProgressRing, Scaffold, SearchField, Sheet, Switch, useFrame } from "../ui";

const S = {
  ...COMMON,
  name: ["Saat", "Clock"],
  description: ["Alarm, zamanlayıcı, kronometre ve dünya saatleri", "Alarms, timer, stopwatch and world clocks"],
  alarm: ["Alarm", "Alarm"],
  clock: ["Saat", "Clock"],
  timer: ["Zamanlayıcı", "Timer"],
  stopwatch: ["Kronometre", "Stopwatch"],
  noAlarms: ["Alarm yok", "No alarms"],
  addAlarm: ["Alarm ekle", "Add alarm"],
  snooze: ["Ertele", "Snooze"],
  lap: ["Tur", "Lap"],
  lapN: ["Tur {n}", "Lap {n}"],
  timesUp: ["Süre doldu", "Time's up"],
  setIn: ["Alarm {h} sa {m} dk sonra çalacak", "Alarm set for {h} h {m} min from now"],
  addCity: ["Şehir ekle", "Add city"],
  channel: ["Alarmlar ve zamanlayıcılar", "Alarms & timers"],
} as const;

/** `days`: 0 = Sunday … 6 = Saturday; empty means it rings once. */
type AlarmItem = { id: string; hour: number; minute: number; days: number[]; label: string; enabled: boolean };

const useClock = appStore("clock", {
  alarms: [] as AlarmItem[],
  cities: ["Europe/London", "America/New_York", "Asia/Tokyo"],
  timer: { duration: 300000, endsAt: 0, remaining: 300000 },
  watch: { startedAt: 0, elapsed: 0, laps: [] as number[] },
});

/** Next ring time strictly after `from`; local Date arithmetic keeps DST and month ends right. */
export function nextOccurrence(alarm: Pick<AlarmItem, "hour" | "minute" | "days">, from: number): number {
  const base = new Date(from);
  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset, alarm.hour, alarm.minute, 0, 0);
    if (candidate.getTime() > from && (!alarm.days.length || alarm.days.includes(candidate.getDay()))) return candidate.getTime();
  }
  throw new Error("unreachable: a week always contains a matching day");
}

function saveAlarm(os: Os, alarm: AlarmItem, announce = true): void {
  const minutesOfDay = (item: AlarmItem) => item.hour * 60 + item.minute;
  useClock.setState(({ alarms }) => ({ alarms: [...alarms.filter(item => item.id !== alarm.id), alarm].sort((a, b) => minutesOfDay(a) - minutesOfDay(b)) }));
  if (!alarm.enabled) return os.cancelAlarm(alarm.id);
  const at = nextOccurrence(alarm, Date.now());
  os.setAlarm(alarm.id, at, { action: "ALARM", extras: { id: alarm.id } });
  const minutes = Math.round((at - Date.now()) / 60000);
  if (announce) os.toast(pick(S.setIn, { h: Math.floor(minutes / 60), m: minutes % 60 }));
}

function ring(os: Os, id: string, title: string, text: string): void {
  os.notify({
    id, fullScreen: "alarm", channel: "alarms", icon: "alarm", title, text,
    actions: [
      { label: pick(S.snooze), icon: "snooze", intent: { action: "SNOOZE", app: "clock", extras: { id } } },
      { label: pick(S.stop), icon: "alarm_off", intent: { action: "DISMISS", app: "clock", extras: { id } } },
    ],
  });
}

const clockValue = (alarm: AlarmItem) => `${String(alarm.hour).padStart(2, "0")}:${String(alarm.minute).padStart(2, "0")}`;

function AlarmsTab({ os }: { os: Os }) {
  const t = useT(S);
  const lang = useLang();
  const alarms = useClock(state => state.alarms);
  const weekdays = [1, 2, 3, 4, 5, 6, 0].map(day => ({ day, name: formatDate(new Date(2024, 0, 7 + day), { weekday: "narrow" }, lang) }));
  const update = (alarm: AlarmItem, patch: Partial<AlarmItem>, announce = true) => saveAlarm(os, { ...alarm, ...patch }, announce);
  const remove = (alarm: AlarmItem) => {
    useClock.setState({ alarms: alarms.filter(item => item.id !== alarm.id) });
    os.cancelAlarm(alarm.id);
  };
  const setTime = (alarm: AlarmItem, value: string) => {
    const [hour, minute] = value.split(":").map(Number);
    if (Number.isFinite(hour) && Number.isFinite(minute)) update(alarm, { hour, minute, enabled: true });
  };
  const toggleDay = (alarm: AlarmItem, day: number) => update(alarm, { days: alarm.days.includes(day) ? alarm.days.filter(item => item !== day) : [...alarm.days, day] });
  if (!alarms.length) return <EmptyState icon="alarm" title={t("noAlarms")} />;
  return (
    <div className="flex flex-col gap-3 p-4 pb-24">
      {alarms.map(alarm => (
        <div key={alarm.id} className={`rounded-3xl p-4 ${alarm.enabled ? "bg-primary-container text-on-primary-container" : "bg-surface-container"}`}>
          <div className="flex items-center gap-2">
            <input type="time" aria-label={t("alarm")} value={clockValue(alarm)} onChange={event => setTime(alarm, event.target.value)} className="min-w-0 flex-1 bg-transparent text-[2.75rem] leading-tight tabular-nums outline-none" />
            <Switch checked={alarm.enabled} label={t("alarm")} onChange={enabled => update(alarm, { enabled })} />
          </div>
          <div className="flex items-center">
            <input value={alarm.label} placeholder={t("label")} aria-label={t("label")} onChange={event => update(alarm, { label: event.target.value }, false)} className="min-w-0 flex-1 bg-transparent text-body outline-none placeholder:opacity-60" />
            <IconButton icon="delete" label={t("delete")} onClick={() => remove(alarm)} />
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {weekdays.map(({ day, name }) => (
              <button key={day} type="button" aria-pressed={alarm.days.includes(day)} onClick={() => toggleDay(alarm, day)} className={`ripple size-8 rounded-full text-label-sm ${alarm.days.includes(day) ? "bg-primary text-on-primary" : "border border-outline"}`}>
                {name}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ClockTab({ adding, onClose }: { adding: boolean; onClose: () => void }) {
  const t = useT(S);
  const lang = useLang();
  const now = useNow("second");
  const cities = useClock(state => state.cities);
  const [query, setQuery] = useState("");
  const zones = Intl.supportedValuesOf("timeZone").filter(zone => zone.toLowerCase().includes(query.toLowerCase()) && !cities.includes(zone));
  const city = (zone: string) => zone.split("/").at(-1)?.replace(/_/g, " ") ?? zone;
  const addCity = (zone: string) => {
    useClock.setState({ cities: [...cities, zone] });
    onClose();
  };
  return (
    <div className="pb-24">
      <div className="py-10 text-center">
        <p className="text-[4.5rem] leading-none font-light tabular-nums">{formatTime(now, lang)}</p>
        <p className="mt-2 text-title text-on-surface-variant">{formatDate(now, { weekday: "long", day: "numeric", month: "long" }, lang)}</p>
      </div>
      {cities.map(zone => (
        <ListItem
          key={zone}
          headline={city(zone)}
          supporting={formatDate(now, { weekday: "short", timeZoneName: "short", timeZone: zone }, lang)}
          trailing={<span className="text-headline-sm text-on-surface">{new Intl.DateTimeFormat(locale(lang), { hour: "numeric", minute: "2-digit", timeZone: zone }).format(now)}</span>}
          onLongPress={() => useClock.setState({ cities: cities.filter(item => item !== zone) })}
        />
      ))}
      <Sheet open={adding} onClose={onClose} title={t("addCity")}>
        <div className="px-4 pb-2">
          <SearchField value={query} onChange={setQuery} placeholder={t("search")} />
        </div>
        {zones.slice(0, 40).map(zone => (
          <ListItem key={zone} headline={city(zone)} supporting={zone} onClick={() => addCity(zone)} />
        ))}
      </Sheet>
    </div>
  );
}

function TimerTab({ os }: { os: Os }) {
  const t = useT(S);
  const timer = useClock(state => state.timer);
  const now = useNow("second");
  const running = timer.endsAt > 0;
  const left = running ? Math.max(0, timer.endsAt - now) : timer.remaining;
  const set = (patch: Partial<typeof timer>) => useClock.setState({ timer: { ...timer, ...patch } });
  const start = () => {
    set({ endsAt: Date.now() + timer.remaining });
    os.setAlarm("timer", Date.now() + timer.remaining, { action: "TIMER" });
  };
  const pause = () => {
    set({ endsAt: 0, remaining: left });
    os.cancelAlarm("timer");
  };
  const reset = () => {
    set({ endsAt: 0, remaining: timer.duration });
    os.cancelAlarm("timer");
  };
  const choose = (minutes: number) => set({ duration: minutes * 60000, remaining: minutes * 60000 });
  return (
    <div className="flex flex-col items-center gap-8 py-10">
      <ProgressRing value={left / timer.duration}>
        <span className="text-headline-lg tabular-nums">{formatDuration(left + 999)}</span>
      </ProgressRing>
      <div className="flex gap-2">
        {[1, 5, 10, 15, 30].map(minutes => (
          <Chip key={minutes} label={`${minutes}′`} disabled={running} selected={timer.duration === minutes * 60000} onClick={() => choose(minutes)} />
        ))}
      </div>
      <div className="flex items-center gap-4">
        <IconButton icon="restart_alt" label={t("reset")} variant="tonal" size={56} onClick={reset} />
        <IconButton icon={running ? "pause" : "play_arrow"} label={t(running ? "pause" : "start")} variant="filled" size={80} onClick={running ? pause : start} />
      </div>
    </div>
  );
}

const stamp = (ms: number) => `${formatDuration(ms)}.${String(Math.floor((ms % 1000) / 10)).padStart(2, "0")}`;

function StopwatchTab() {
  const t = useT(S);
  const watch = useClock(state => state.watch);
  const running = watch.startedAt > 0;
  const total = watch.elapsed + (running ? Date.now() - watch.startedAt : 0);
  useFrame(running);
  const set = (patch: Partial<typeof watch>) => useClock.setState({ watch: { ...watch, ...patch } });
  return (
    <div className="flex flex-col items-center gap-8 py-10">
      <p className="text-display tabular-nums">{stamp(total)}</p>
      <div className="flex items-center gap-4">
        <IconButton icon={running ? "flag" : "restart_alt"} label={t(running ? "lap" : "reset")} variant="tonal" size={56} onClick={() => set(running ? { laps: [total, ...watch.laps] } : { elapsed: 0, laps: [] })} />
        <IconButton icon={running ? "pause" : "play_arrow"} label={t(running ? "pause" : "start")} variant="filled" size={80} onClick={() => set(running ? { startedAt: 0, elapsed: total } : { startedAt: Date.now() })} />
      </div>
      <div className="w-full">
        {watch.laps.map((lap, index) => (
          <ListItem key={lap} headline={t("lapN", { n: watch.laps.length - index })} trailing={<span className="text-title text-on-surface tabular-nums">{stamp(lap)}</span>} />
        ))}
      </div>
    </div>
  );
}

function Clock({ os, intent }: AppProps) {
  const t = useT(S);
  const [tab, setTab] = useState<"alarm" | "clock" | "timer" | "stopwatch">(intent.extras?.tab === "timer" ? "timer" : "alarm");
  const [addingCity, setAddingCity] = useState(false);
  const newAlarm = () => saveAlarm(os, { id: crypto.randomUUID(), hour: (new Date().getHours() + 1) % 24, minute: 0, days: [], label: "", enabled: true });
  const tabs = (["alarm", "clock", "timer", "stopwatch"] as const).map((value, index) => ({ value, label: t(value), icon: ["alarm", "schedule", "hourglass_bottom", "timer"][index] }));
  const fabs: Partial<Record<typeof tab, ReactNode>> = { alarm: <Fab icon="add" label={t("addAlarm")} onClick={newAlarm} />, clock: <Fab icon="public" label={t("addCity")} onClick={() => setAddingCity(true)} /> };
  const fab = fabs[tab];
  return (
    <Scaffold title={t("name")} fab={fab} bottom={<BottomNav items={tabs} value={tab} onChange={setTab} />}>
      {tab === "alarm" && <AlarmsTab os={os} />}
      {tab === "clock" && <ClockTab adding={addingCity} onClose={() => setAddingCity(false)} />}
      {tab === "timer" && <TimerTab os={os} />}
      {tab === "stopwatch" && <StopwatchTab />}
    </Scaffold>
  );
}

/** Material You "bold" clock: hours over minutes on a palette-tinted card. */
function ClockWidget() {
  const lang = useLang();
  const now = new Date(useNow());
  const hours = lang === "en" ? now.getHours() % 12 || 12 : now.getHours();
  return (
    <span className="flex aspect-square w-full flex-col items-center justify-center rounded-[2.25rem] bg-primary-container text-on-primary-container">
      <span className="text-[3.75rem] leading-[0.95] font-bold tracking-tight tabular-nums">{String(hours).padStart(2, "0")}</span>
      <span className="text-[3.75rem] leading-[0.95] font-bold tracking-tight text-primary tabular-nums">{String(now.getMinutes()).padStart(2, "0")}</span>
      <span className="mt-1.5 text-label-sm">{formatDate(now, { weekday: "short", day: "numeric", month: "short" }, lang)}</span>
    </span>
  );
}

const resetTimer = () => useClock.setState(({ timer }) => ({ timer: { ...timer, endsAt: 0, remaining: timer.duration } }));

export default {
  id: "clock",
  name: S.name,
  icon: "schedule",
  tint: { hue: 275 },
  liveIcon: "clock",
  description: S.description,
  system: true,
  channels: { alarms: { name: S.channel, importance: "high" } },
  Component: Clock,
  Widget: ClockWidget,
  receivers: {
    // Runs from the kernel's AlarmManager even when the Clock app is not open.
    ALARM(intent, os) {
      const alarm = useClock.getState().alarms.find(item => item.id === intent.extras?.id);
      if (!alarm) return;
      ring(os, alarm.id, alarm.label || pick(S.alarm), formatTime(Date.now()));
      if (!intent.extras?.snoozed) saveAlarm(os, { ...alarm, enabled: alarm.days.length > 0 }, false);
    },
    SNOOZE(intent, os) {
      const id = String(intent.extras?.id);
      os.cancel(id);
      if (id === "timer") resetTimer();
      else os.setAlarm(`${id}-snooze`, Date.now() + 10 * 60000, { action: "ALARM", extras: { id, snoozed: true } });
    },
    DISMISS: (intent, os) => os.cancel(String(intent.extras?.id)),
    TIMER(_, os) {
      resetTimer();
      ring(os, "timer", pick(S.timesUp), pick(S.timer));
    },
  },
} satisfies AppDef;
