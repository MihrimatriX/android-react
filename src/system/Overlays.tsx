import { useShallow } from "zustand/react/shallow";
import { formatTime, getApp, pick, useBackHandler, useLang, useNow, useT, type Permission } from "../kernel";
import { useNotifications } from "../kernel/notifications";
import { dispatch } from "../kernel/os";
import { usePower } from "../kernel/power";
import { answer, useSystem } from "../kernel/system";
import { Button, Icon, Sheet, useDrag } from "../ui";
import { AppIcon } from "./AppIcon";
import { NotificationCard } from "./NotificationCard";
import { S } from "./strings";
import { useUi } from "./store";

/** Pops important notifications over apps; calls and alarms stay until handled. */
export function HeadsUp() {
  const { list, headsUp } = useNotifications(useShallow(state => ({ list: state.list, headsUp: state.headsUp })));
  const shade = useUi(state => state.shade);
  const locked = usePower(state => state.locked);
  const drag = useDrag({ axis: "y", onEnd: ({ dy }) => dy < -30 && useNotifications.setState({ headsUp: null }) });
  const takeover = list.find(item => item.fullScreen);
  const current = takeover ?? list.find(item => item.id === headsUp);
  if (!current || shade || locked) return null;
  return (
    <div {...drag} className="enter-down absolute inset-x-2 z-[65] overflow-hidden rounded-3xl shadow-2xl" style={{ top: "calc(var(--inset-top) + 0.25rem)" }}>
      <NotificationCard notification={current} />
    </div>
  );
}

/** Incoming call / ringing alarm over the lock screen. */
export function FullScreenAlert() {
  const lang = useLang();
  const now = useNow();
  const alert = useNotifications(state => state.list.find(item => item.fullScreen));
  const locked = usePower(state => state.locked);
  if (!alert || !locked) return null;
  const [reject, accept] = alert.actions ?? [];
  const big = (action: typeof reject, tone: string) =>
    action && (
      <button type="button" onClick={() => dispatch(action.intent)} className="flex flex-col items-center gap-2 text-label">
        <span className={`ripple grid size-18 place-items-center rounded-full ${tone}`}>
          <Icon name={action.icon ?? "close"} size={32} />
        </span>
        {action.label}
      </button>
    );
  return (
    <div className="enter absolute inset-0 z-[80] flex flex-col items-center bg-black/80 px-8 pt-24 pb-20 text-white backdrop-blur-xl">
      <p className="text-title">{alert.text}</p>
      <p className="mt-2 text-center text-headline-lg">{alert.title}</p>
      <p className="mt-2 text-title-lg text-white/70 tabular-nums">{formatTime(now, lang)}</p>
      <span className="mt-16 grid size-28 animate-pulse place-items-center rounded-full bg-white/10">
        <Icon name={alert.icon ?? (alert.fullScreen === "call" ? "call" : "alarm")} size={56} />
      </span>
      <div className="mt-auto flex w-full justify-around">
        {big(reject, "bg-red-600")}
        {big(accept, alert.fullScreen === "call" ? "bg-green-600" : "bg-white/20")}
      </div>
    </div>
  );
}

export function Toasts() {
  const toasts = useSystem(state => state.toasts);
  return (
    <div aria-live="polite" className="pointer-events-none absolute inset-x-0 z-[85] flex flex-col items-center gap-2 px-8" style={{ bottom: "calc(var(--inset-bottom) + 4rem)" }}>
      {toasts.map(item => (
        <p key={item.id} className="enter-up rounded-full bg-inverse-surface px-4 py-3 text-center text-body text-inverse-on-surface shadow-lg">
          {item.text}
        </p>
      ))}
    </div>
  );
}

const PERMISSION_ICONS: Record<Permission, string> = {
  camera: "photo_camera",
  microphone: "mic",
  location: "location_on",
  storage: "folder",
  notifications: "notifications",
};
const PERMISSION_TEXT: Record<Permission, keyof typeof S> = {
  camera: "camera",
  microphone: "microphone",
  location: "location",
  storage: "storage",
  notifications: "notificationsPermission",
};

/** Kernel-requested dialogs: runtime permissions and the app chooser / share sheet. */
export function SystemDialogs() {
  const t = useT(S);
  const lang = useLang();
  const pending = useSystem(state => state.dialogs[0]);
  useBackHandler(() => pending && answer(pending.id, pending.dialog.kind === "permission" ? "denied" : null), !!pending);
  if (!pending) return null;
  const { dialog, id } = pending;
  if (dialog.kind === "permission") {
    const app = getApp(dialog.app);
    const choice = (value: string, label: keyof typeof S) => (
      <Button key={value} variant="tonal" className="w-full" onClick={() => answer(id, value)}>
        {t(label)}
      </Button>
    );
    return (
      <div className="enter absolute inset-0 z-[70] flex items-end bg-black/40 p-4 pb-8">
        <div role="alertdialog" className="enter-up w-full rounded-4xl bg-surface-high p-6 text-center text-on-surface">
          <Icon name={PERMISSION_ICONS[dialog.permission]} className="text-primary" size={28} />
          <p className="mt-4 mb-6 text-headline-sm">{t("permissionTitle", { app: app ? pick(app.name, undefined, lang) : dialog.app, what: t(PERMISSION_TEXT[dialog.permission]) })}</p>
          <div className="flex flex-col gap-2">
            {dialog.once ? [choice("granted", "whileUsing"), choice("once", "onlyThisTime")] : choice("granted", "allow")}
            {choice("denied", "deny")}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="absolute inset-0 z-[70]">
      <Sheet open onClose={() => answer(id, null)} title={t(dialog.share ? "shareVia" : "openWith")}>
        {dialog.share?.text && <p className="mx-6 mb-3 line-clamp-3 rounded-2xl bg-surface-high p-3 text-body text-on-surface-variant">{dialog.share.text}</p>}
        <div className="grid grid-cols-4 gap-y-5 px-3 pb-6">
          {dialog.apps.flatMap(appId => getApp(appId) ?? []).map(app => (
            <AppIcon key={app.id} app={app} size={52} onClick={() => answer(id, app.id)} />
          ))}
        </div>
      </Sheet>
    </div>
  );
}
