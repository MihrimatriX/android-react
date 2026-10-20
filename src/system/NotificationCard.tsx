import { useState, type MouseEvent } from "react";
import { formatTime, getApp, pick, useLang, useSettings, useT, type Notification, type NotificationAction } from "../kernel";
import { cancel } from "../kernel/notifications";
import { dispatch } from "../kernel/os";
import { usePower } from "../kernel/power";
import { Icon, IconButton, useDrag } from "../ui";
import { S } from "./strings";
import { setShade } from "./store";

/** Tapping a notification opens its intent and, unless it is ongoing, dismisses it (autoCancel). */
export function openNotification(notification: Notification): void {
  if (!notification.ongoing && !notification.media && !notification.fullScreen) cancel(notification.id);
  setShade(0);
  if (notification.intent) dispatch(notification.intent);
}

function runAction(action: NotificationAction, reply?: string): void {
  dispatch({ ...action.intent, extras: { ...action.intent.extras, reply } });
}

export function NotificationCard({ notification, onOpen = openNotification, flat }: {
  notification: Notification;
  onOpen?: (notification: Notification) => void;
  flat?: boolean;
}) {
  const t = useT(S);
  const lang = useLang();
  // Inline actions that type text need an unlock only behind a secure (PIN/pattern) lock.
  const locked = usePower(state => state.locked);
  const secure = useSettings(state => state.lock.kind === "pin" || state.lock.kind === "pattern");
  const secureLocked = locked && secure;
  const [offset, setOffset] = useState(0);
  const [replying, setReplying] = useState<NotificationAction | null>(null);
  const [text, setText] = useState("");
  const app = getApp(notification.app);
  const sticky = !!notification.ongoing || !!notification.fullScreen;
  const drag = useDrag({
    axis: "x",
    onMove: ({ dx }) => !sticky && setOffset(dx),
    onEnd: ({ dx, vx }) => {
      // TODO(human): sticky (ongoing / fullScreen) notifications must never be dismissed by a swipe or fling.
      const dismissed = Math.abs(dx) > 120 || Math.abs(vx) > 0.7;
      setOffset(dismissed ? Math.sign(dx) * 480 : 0);
      if (dismissed) setTimeout(() => cancel(notification.id), 160);
    },
  });
  const stop = (handler: () => void) => (event: MouseEvent) => {
    event.stopPropagation();
    handler();
  };
  const send = () => {
    if (replying && text.trim()) runAction(replying, text.trim());
    setReplying(null);
    setText("");
  };
  const actions = notification.actions ?? [];

  return (
    <article
      {...drag}
      aria-label={notification.title}
      onClick={() => onOpen(notification)}
      className={`touch-pan-y cursor-pointer p-4 text-on-surface ${flat ? "" : "rounded-3xl bg-surface-highest"} ${offset ? "" : "anim"}`}
      style={{ transform: `translateX(${offset}px)`, opacity: 1 - Math.min(1, Math.abs(offset) / 400) }}
    >
      <div className="flex gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-on-primary">
          <Icon name={notification.icon ?? app?.icon ?? "notifications"} size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-label-sm text-on-surface-variant">
            {app ? pick(app.name, undefined, lang) : t("system")} · {formatTime(notification.time, lang)}
          </p>
          <p className="truncate text-title-sm">{notification.title}</p>
          {notification.text && <p className="line-clamp-3 text-body text-on-surface-variant">{notification.text}</p>}
          {notification.progress !== undefined && (
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-secondary-container">
              <div className="anim h-full bg-primary" style={{ width: `${notification.progress * 100}%` }} />
            </div>
          )}
        </div>
        {notification.image && <img src={notification.image} alt="" className="size-12 shrink-0 rounded-xl object-cover" />}
      </div>
      {notification.media ? (
        <div className="mt-3 flex justify-center gap-4">
          {actions.map(action => (
            <IconButton key={action.label} icon={action.icon ?? "play_arrow"} label={action.label} variant="tonal" size={48} onClick={stop(() => runAction(action))} />
          ))}
        </div>
      ) : replying ? (
        <div className="mt-3 flex items-center gap-2" onClick={event => event.stopPropagation()}>
          <input
            autoFocus
            value={text}
            aria-label={t("reply")}
            placeholder={t("reply")}
            onChange={event => setText(event.target.value)}
            onKeyDown={event => event.key === "Enter" && send()}
            className="h-10 min-w-0 flex-1 rounded-full bg-surface-container px-4 text-body outline-none"
          />
          <IconButton icon="send" label={t("send")} variant="filled" onClick={send} />
        </div>
      ) : (
        actions.length > 0 && (
          <div className="mt-2 -mb-2 flex flex-wrap gap-1 pl-10">
            {actions.map(action => (
              <button
                key={action.label}
                type="button"
                disabled={secureLocked && !!action.reply}
                onClick={stop(() => (action.reply ? setReplying(action) : runAction(action)))}
                className="ripple h-9 rounded-full px-3 text-label text-primary disabled:opacity-40"
              >
                {action.label}
              </button>
            ))}
          </div>
        )
      )}
    </article>
  );
}
