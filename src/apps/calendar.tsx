import { useEffect, useState } from "react";
import { appStore, COMMON, formatDate, formatTime, pick, useLang, useNow, useT, type AppDef, type AppProps, type Os } from "../kernel";
import { Button, Chip, EmptyState, Fab, Icon, IconButton, ListItem, Scaffold, Switch, TextField } from "../ui";

const S = {
  ...COMMON,
  name: ["Takvim", "Calendar"],
  description: ["Ay, hafta ve gün görünümleri, hatırlatıcılar", "Month, week and day views with reminders"],
  month: ["Ay", "Month"],
  week: ["Hafta", "Week"],
  day: ["Gün", "Day"],
  newEvent: ["Yeni etkinlik", "New event"],
  title: ["Başlık", "Title"],
  location: ["Konum", "Location"],
  allDay: ["Tüm gün", "All day"],
  date: ["Tarih", "Date"],
  starts: ["Başlangıç", "Starts"],
  ends: ["Bitiş", "Ends"],
  reminder: ["Hatırlatıcı", "Reminder"],
  none: ["Yok", "None"],
  minutesBefore: ["{n} dk önce", "{n} min before"],
  atStart: ["Başladığında", "At start"],
  noEvents: ["Etkinlik yok", "No events"],
  previous: ["Önceki", "Previous"],
  next: ["Sonraki", "Next"],
  channel: ["Etkinlik hatırlatıcıları", "Event reminders"],
  startsAt: ["{time} başlıyor", "Starts at {time}"],
} as const;

interface CalendarEvent {
  id: string;
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  /** Minutes before start; -1 = no reminder. */
  reminder: number;
  location: string;
}

const useCalendar = appStore("calendar", { events: [] as CalendarEvent[] });
const startOfDay = (time: number) => new Date(new Date(time).setHours(0, 0, 0, 0)).getTime();
const addDays = (time: number, days: number) => new Date(new Date(time).setDate(new Date(time).getDate() + days)).getTime();
const sameDay = (a: number, b: number) => startOfDay(a) === startOfDay(b);
const eventsOn = (events: CalendarEvent[], day: number) => events.filter(event => event.start < addDays(startOfDay(day), 1) && event.end >= startOfDay(day)).sort((a, b) => a.start - b.start);
/** Turkish weeks start on Monday, US weeks on Sunday. */
const weekStart = (time: number, lang: string) => addDays(startOfDay(time), -((new Date(time).getDay() + (lang === "tr" ? 6 : 0)) % 7));
const toInput = (time: number) => new Date(time - new Date(time).getTimezoneOffset() * 60000).toISOString().slice(0, 16);

function saveEvent(os: Os, event: CalendarEvent): void {
  useCalendar.setState(({ events }) => ({ events: [...events.filter(item => item.id !== event.id), event] }));
  const at = event.start - event.reminder * 60000;
  if (event.reminder >= 0 && at > Date.now()) os.setAlarm(event.id, at, { action: "REMIND", extras: { id: event.id } });
  else os.cancelAlarm(event.id);
}

function EventEditor({ event, os }: { event: CalendarEvent; os: Os }) {
  const t = useT(S);
  const [draft, setDraft] = useState(event);
  const [from, to] = [toInput(draft.start), toInput(draft.end)];
  const setFrom = (value: string) => {
    const start = new Date(value).getTime();
    if (Number.isFinite(start)) setDraft({ ...draft, start, end: Math.max(start + 1800000, draft.end + (start - draft.start)) });
  };
  const remove = () => {
    useCalendar.setState(({ events }) => ({ events: events.filter(item => item.id !== event.id) }));
    os.cancelAlarm(event.id);
    os.back();
  };
  const save = () => {
    saveEvent(os, { ...draft, title: draft.title.trim() || pick(S.untitled) });
    os.back();
  };
  const reminderLabel = (minutes: number) => {
    if (minutes < 0) return t("none");
    return minutes ? t("minutesBefore", { n: minutes }) : t("atStart");
  };
  const field = "h-14 rounded-t-md border-b border-on-surface-variant bg-surface-highest px-4 text-body-lg text-on-surface outline-none";
  return (
    <Scaffold title={t(useCalendar.getState().events.some(item => item.id === event.id) ? "edit" : "newEvent")} onBack={os.back} actions={<Button className="mr-2" onClick={save}>{t("save")}</Button>}>
      <div className="flex flex-col gap-4 p-4">
        <TextField label={t("title")} value={draft.title} autoFocus onChange={title => setDraft({ ...draft, title })} />
        <ListItem headline={t("allDay")} trailing={<Switch checked={draft.allDay} label={t("allDay")} onChange={allDay => setDraft({ ...draft, allDay })} />} />
        <label className="flex flex-col gap-1 text-label-sm text-on-surface-variant">
          {t("starts")}
          <input type={draft.allDay ? "date" : "datetime-local"} value={draft.allDay ? from.slice(0, 10) : from} onChange={event => setFrom(event.target.value)} className={field} />
        </label>
        {!draft.allDay && (
          <label className="flex flex-col gap-1 text-label-sm text-on-surface-variant">
            {t("ends")}
            <input type="datetime-local" value={to} min={from} onChange={event => setDraft({ ...draft, end: Math.max(draft.start, new Date(event.target.value).getTime() || draft.end) })} className={field} />
          </label>
        )}
        <TextField label={t("location")} value={draft.location} onChange={location => setDraft({ ...draft, location })} />
        <p className="text-label-sm text-on-surface-variant">{t("reminder")}</p>
        <div className="flex flex-wrap gap-2">
          {[-1, 0, 10, 30, 60].map(minutes => (
            <Chip key={minutes} selected={draft.reminder === minutes} label={reminderLabel(minutes)} onClick={() => setDraft({ ...draft, reminder: minutes })} />
          ))}
        </div>
        {useCalendar.getState().events.some(item => item.id === event.id) && <Button variant="outlined" icon="delete" onClick={remove}>{t("delete")}</Button>}
      </div>
    </Scaffold>
  );
}

function Agenda({ events, day, onOpen }: { events: CalendarEvent[]; day: number; onOpen: (id: string) => void }) {
  const t = useT(S);
  const lang = useLang();
  const list = eventsOn(events, day);
  if (!list.length) return <p className="px-4 py-6 text-body text-on-surface-variant">{t("noEvents")}</p>;
  return list.map(event => (
    <ListItem
      key={event.id}
      leading={<span className="h-10 w-1 rounded-full bg-primary" />}
      headline={event.title}
      supporting={[event.allDay ? t("allDay") : `${formatTime(event.start, lang)} – ${formatTime(event.end, lang)}`, event.location].filter(Boolean).join(" · ")}
      trailing={event.reminder >= 0 && <Icon name="notifications" size={18} />}
      onClick={() => onOpen(event.id)}
    />
  ));
}

function Calendar({ intent, route, os }: AppProps) {
  const t = useT(S);
  const lang = useLang();
  const today = useNow();
  const events = useCalendar(state => state.events);
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [cursor, setCursor] = useState(startOfDay(Date.now()));
  const open = (id: string) => os.push(`event/${id}`);
  // Reminder notifications open the event they belong to.
  useEffect(() => {
    if (intent.extras?.id) os.push(`event/${intent.extras.id}`);
  }, [intent, os]);

  if (route.startsWith("event/")) {
    const id = route.slice(6);
    const start = cursor + 9 * 3600000;
    const event = events.find(item => item.id === id) ?? { id, title: "", start, end: start + 3600000, allDay: false, reminder: 10, location: "" };
    return <EventEditor key={id} event={event} os={os} />;
  }

  const move = (direction: number) => {
    const date = new Date(cursor);
    if (view === "month") date.setMonth(date.getMonth() + direction, 1);
    else date.setDate(date.getDate() + direction * (view === "week" ? 7 : 1));
    setCursor(date.getTime());
  };
  const first = weekStart(new Date(new Date(cursor).setDate(1)).getTime(), lang);
  const weekdays = Array.from({ length: 7 }, (_, index) => formatDate(addDays(weekStart(today, lang), index), { weekday: "narrow" }, lang));
  const title = formatDate(cursor, view === "day" ? { weekday: "long", day: "numeric", month: "long" } : { month: "long", year: "numeric" }, lang);

  return (
    <Scaffold
      title={title}
      actions={
        <>
          <IconButton icon="today" label={t("today")} onClick={() => setCursor(startOfDay(Date.now()))} />
          <IconButton icon="chevron_left" label={t("previous")} onClick={() => move(-1)} />
          <IconButton icon="chevron_right" label={t("next")} onClick={() => move(1)} />
        </>
      }
      fab={<Fab icon="add" label={t("newEvent")} onClick={() => open(crypto.randomUUID())} />}
    >
      <div className="flex gap-2 px-4 pb-3">
        {(["month", "week", "day"] as const).map(option => (
          <Chip key={option} label={t(option)} selected={view === option} onClick={() => setView(option)} />
        ))}
      </div>
      {view === "month" && (
        <div className="grid grid-cols-7 px-2 text-center">
          {weekdays.map((name, index) => (
            <span key={index} className="pb-2 text-label-sm text-on-surface-variant">{name}</span>
          ))}
          {Array.from({ length: 42 }, (_, index) => addDays(first, index)).map(day => {
            const count = eventsOn(events, day).length;
            const outside = new Date(day).getMonth() !== new Date(cursor).getMonth();
            return (
              <button key={day} type="button" onClick={() => setCursor(day)} className={`ripple flex h-12 flex-col items-center rounded-2xl pt-1 ${outside ? "opacity-40" : ""} ${sameDay(day, cursor) ? "bg-secondary-container" : ""}`}>
                <span className={`grid size-7 place-items-center rounded-full text-body ${sameDay(day, today) ? "bg-primary text-on-primary" : ""}`}>{new Date(day).getDate()}</span>
                {count > 0 && <span className="mt-0.5 flex gap-0.5">{Array.from({ length: Math.min(count, 3) }, (_, dot) => <span key={dot} className="size-1 rounded-full bg-primary" />)}</span>}
              </button>
            );
          })}
        </div>
      )}
      {view === "week" &&
        Array.from({ length: 7 }, (_, index) => addDays(weekStart(cursor, lang), index)).map(day => (
          <section key={day}>
            <h3 className={`px-4 pt-3 text-title-sm ${sameDay(day, today) ? "text-primary" : "text-on-surface-variant"}`}>{formatDate(day, { weekday: "long", day: "numeric", month: "short" }, lang)}</h3>
            <Agenda events={events} day={day} onOpen={open} />
          </section>
        ))}
      {view !== "week" && (
        <section className="pb-24">
          {view === "month" && <h3 className="px-4 pt-4 text-title-sm text-primary">{formatDate(cursor, { weekday: "long", day: "numeric", month: "long" }, lang)}</h3>}
          {!events.length && view === "day" ? <EmptyState icon="event" title={t("noEvents")} /> : <Agenda events={events} day={cursor} onOpen={open} />}
        </section>
      )}
    </Scaffold>
  );
}

export default {
  id: "calendar",
  name: S.name,
  icon: "calendar_month",
  tint: { hue: 245 },
  liveIcon: "calendar",
  description: S.description,
  permissions: ["notifications"],
  channels: { reminders: { name: S.channel, importance: "high" } },
  Component: Calendar,
  receivers: {
    REMIND(intent, os) {
      const event = useCalendar.getState().events.find(item => item.id === intent.extras?.id);
      if (!event) return;
      const time = event.allDay ? pick(S.allDay) : pick(S.startsAt, { time: formatTime(event.start) });
      os.notify({ id: event.id, channel: "reminders", icon: "event", title: event.title, text: [time, event.location].filter(Boolean).join(" · "), intent: { app: "calendar", action: "VIEW", extras: { id: event.id } } });
    },
  },
} satisfies AppDef;
