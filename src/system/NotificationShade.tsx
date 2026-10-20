import { useEffect, useState, type CSSProperties } from "react";
import { formatDate, formatTime, useBackHandler, useLang, useNow, useSettings, useT } from "../kernel";
import { clearAll, groupNotifications, useNotifications, type NotificationGroup } from "../kernel/notifications";
import { startActivity } from "../kernel/os";
import { screenOff } from "../kernel/power";
import { Button, Icon, IconButton, Slider, useDrag } from "../ui";
import { NotificationCard } from "./NotificationCard";
import { CompactTiles, TileGrid } from "./QuickSettings";
import { S } from "./strings";
import { setShade, useUi } from "./store";

function Group({ group }: { group: NotificationGroup }) {
  const [open, setOpen] = useState(false);
  const shown = open ? group.items : group.items.slice(0, 1);
  return (
    <div className="overflow-hidden rounded-3xl bg-surface-highest">
      {shown.map(notification => (
        <NotificationCard key={notification.id} notification={notification} flat />
      ))}
      {group.items.length > 1 && (
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="ripple flex h-9 w-full items-center justify-center gap-1 text-label-sm text-on-surface-variant">
          {!open && `+${group.items.length - 1}`}
          <Icon name={open ? "expand_less" : "expand_more"} size={18} />
        </button>
      )}
    </div>
  );
}

const openSettings = (page?: string) => {
  setShade(0);
  void startActivity({ app: "settings", action: "MAIN", extras: { page } });
};

export function Shade() {
  const t = useT(S);
  const lang = useLang();
  const now = useNow();
  const shade = useUi(state => state.shade);
  const shadeDrag = useUi(state => state.shadeDrag);
  const brightness = useSettings(state => state.brightness);
  const list = useNotifications(state => state.list);
  const [editing, setEditing] = useState(false);
  const [pull, setPull] = useState(0);
  useBackHandler(() => (editing ? setEditing(false) : setShade(0)), shade > 0);
  useEffect(() => {
    if (!shade) setEditing(false);
  }, [shade]);

  const expand = useDrag({
    axis: "y",
    onMove: ({ dy }) => setPull(dy),
    onEnd: ({ dy }) => {
      setPull(0);
      if (dy > 40) setShade(2);
      if (dy < -40) setShade(shade === 2 ? 1 : 0);
    },
  });
  const collapse = useDrag({
    axis: "y",
    onMove: ({ dy }) => setPull(Math.min(0, dy)),
    onEnd: ({ dy }) => {
      setPull(0);
      if (dy < -40) setShade(0);
    },
  });
  const sleep = () => {
    setShade(0);
    screenOff();
  };

  // Closed, the shade waits just above the screen, so opening, closing and the finger all move the same layer.
  const level = shade || 1;
  const live = shadeDrag !== null || pull !== 0;
  let offset = "0px";
  if (shadeDrag !== null) offset = `min(0px, calc(${shadeDrag}px - 100%))`;
  else if (!shade) offset = "-100%";
  else if (pull < 0) offset = `${pull}px`;
  const groups = groupNotifications(list);
  const clearable = list.some(item => !item.ongoing && !item.media && !item.fullScreen);
  return (
    <div
      inert={!shade}
      className={`absolute inset-0 z-50 flex flex-col bg-surface-container/95 text-on-surface backdrop-blur-2xl ${live ? "" : "anim"}`}
      style={{ paddingTop: "var(--inset-top)", transform: `translateY(${offset})` }}
    >
      <div {...expand} className={`touch-none px-4 pt-2 ${level === 2 ? "flex min-h-0 flex-1 flex-col" : ""}`}>
        <div className="flex items-center gap-3 pb-4">
          <span className="text-headline-sm tabular-nums">{formatTime(now, lang)}</span>
          <span className="min-w-0 flex-1 truncate text-label text-on-surface-variant">{formatDate(now, { weekday: "short", day: "numeric", month: "short" }, lang)}</span>
          {level === 2 && (
            <>
              <IconButton icon={editing ? "check" : "edit"} label={t(editing ? "done" : "edit")} onClick={() => setEditing(!editing)} />
              <IconButton icon="power_settings_new" label={t("power")} onClick={sleep} />
              <IconButton icon="settings" label={t("settings")} onClick={() => openSettings()} />
            </>
          )}
        </div>
        {level === 1 ? (
          <CompactTiles />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <Slider label={t("brightness")} icon="brightness_6" value={brightness} min={0.1} onChange={value => useSettings.setState({ brightness: value })} />
            <div className="min-h-0 overflow-y-auto pb-2" onPointerDown={event => event.stopPropagation()}>
              <TileGrid editing={editing} />
            </div>
          </div>
        )}
      </div>
      {level === 1 && (
        <div className="mt-4 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3">
          {groups.length === 0 && <p className="py-10 text-center text-body text-on-surface-variant">{t("noNotifications")}</p>}
          {groups.map((group, index) => (
            <div key={group.key} className="rise" style={{ "--i": index } as CSSProperties}>
              <Group group={group} />
            </div>
          ))}
          {/* Like Android, the Manage / Clear all footer only shows under notifications. */}
          {groups.length > 0 && (
            <div className="flex justify-between py-2">
              <Button variant="tonal" onClick={() => openSettings("notifications")}>{t("manage")}</Button>
              {clearable && <Button variant="tonal" icon="clear_all" onClick={clearAll}>{t("clearAll")}</Button>}
            </div>
          )}
        </div>
      )}
      <div {...collapse} className="mt-auto flex touch-none justify-center py-3">
        <span className="h-1 w-10 rounded-full bg-on-surface-variant/50" />
      </div>
    </div>
  );
}
