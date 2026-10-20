import { useEffect, useRef, useState, type PointerEvent } from "react";
import { feedback, useDarkMode, useSettings, useT, type SystemSettings } from "../kernel";
import { startActivity } from "../kernel/os";
import { Icon, useLongPress } from "../ui";
import { S } from "./strings";
import { setShade } from "./store";
import { RINGER } from "./VolumePanel";

type Key = keyof typeof S;

interface Tile {
  icon: (settings: SystemSettings) => string;
  label: Key;
  active: (settings: SystemSettings, dark: boolean) => boolean;
  toggle: (settings: SystemSettings, dark: boolean) => Partial<SystemSettings>;
  /** Long press opens the matching Settings page, as on Pixel. */
  page?: string;
}

const TILES: Record<string, Tile> = {
  wifi: { icon: s => (s.wifi ? "wifi" : "wifi_off"), label: "tileWifi", active: s => s.wifi, toggle: s => ({ wifi: !s.wifi }), page: "network" },
  bluetooth: { icon: () => "bluetooth", label: "tileBluetooth", active: s => s.bluetooth, toggle: s => ({ bluetooth: !s.bluetooth }), page: "network" },
  dnd: { icon: () => "do_not_disturb_on", label: "tileDnd", active: s => s.dnd, toggle: s => ({ dnd: !s.dnd }), page: "notifications" },
  flashlight: { icon: s => (s.flashlight ? "flashlight_on" : "flashlight_off"), label: "tileFlashlight", active: s => s.flashlight, toggle: s => ({ flashlight: !s.flashlight }) },
  airplane: { icon: () => "flight", label: "tileAirplane", active: s => s.airplane, toggle: s => ({ airplane: !s.airplane }), page: "network" },
  dark: { icon: () => "contrast", label: "tileDark", active: (_, dark) => dark, toggle: (_, dark) => ({ theme: dark ? "light" : "dark" }), page: "display" },
  location: { icon: s => (s.location ? "location_on" : "location_off"), label: "tileLocation", active: s => s.location, toggle: s => ({ location: !s.location }), page: "location" },
  ringer: {
    icon: s => ({ sound: "volume_up", vibrate: "vibration", silent: "volume_off" })[s.ringer],
    label: "tileRinger",
    active: s => s.ringer !== "sound",
    toggle: s => ({ ringer: RINGER[(RINGER.indexOf(s.ringer) + 1) % RINGER.length] }),
    page: "sound",
  },
  saver: { icon: () => "battery_saver", label: "tileSaver", active: s => s.batterySaver, toggle: s => ({ batterySaver: !s.batterySaver }), page: "battery" },
};

function TileButton({ id, compact, editing, onPointerDown }: { id: string; compact?: boolean; editing?: boolean; onPointerDown?: (event: PointerEvent) => void }) {
  const t = useT(S);
  const settings = useSettings();
  const dark = useDarkMode();
  const tile = TILES[id];
  const press = useLongPress(() => {
    if (editing || !tile.page) return;
    setShade(0);
    void startActivity({ app: "settings", action: "MAIN", extras: { page: tile.page } });
  });
  if (!tile) return null;
  const active = tile.active(settings, dark);
  const status = id === "ringer" ? t(({ sound: "ringerSound", vibrate: "ringerVibrate", silent: "ringerSilent" } as const)[settings.ringer]) : t(active ? "on" : "off");
  const toggle = () => {
    if (editing) return;
    feedback("click");
    useSettings.setState(tile.toggle(settings, dark));
  };
  const tone = active ? "bg-primary text-on-primary" : "bg-surface-highest text-on-surface";
  if (compact) {
    return (
      <button type="button" aria-label={t(tile.label)} aria-pressed={active} onClick={toggle} {...press} className={`ripple anim grid h-14 flex-1 place-items-center rounded-full active:scale-90 ${tone}`}>
        <Icon name={tile.icon(settings)} filled={active} />
      </button>
    );
  }
  return (
    <button
      type="button"
      data-tile={id}
      aria-pressed={active}
      onClick={toggle}
      {...(editing ? { onPointerDown } : press)}
      className={`ripple anim flex h-16 w-full min-w-0 items-center gap-3 active:scale-95 rounded-[1.25rem] px-4 text-left ${tone} ${editing ? "touch-none" : ""}`}
    >
      <Icon name={tile.icon(settings)} filled={active} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-label">{t(tile.label)}</span>
        <span className="block truncate text-label-sm opacity-80">{status}</span>
      </span>
    </button>
  );
}

export function CompactTiles() {
  const tiles = useSettings(state => state.tiles);
  return (
    <div className="flex gap-2">
      {tiles.slice(0, 4).map(id => (
        <TileButton key={id} id={id} compact />
      ))}
    </div>
  );
}

/** Edit mode: drag tiles to reorder, drop on the lower area to remove, tap an unused tile to add it. */
export function TileGrid({ editing }: { editing: boolean }) {
  const t = useT(S);
  const tiles = useSettings(state => state.tiles);
  const [dragging, setDragging] = useState<string | null>(null);
  const spare = Object.keys(TILES).filter(id => !tiles.includes(id));
  const dragRef = useRef<string | null>(null);

  useEffect(() => {
    if (!dragging) return;
    const move = (event: globalThis.PointerEvent) => {
      const over = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-tile],[data-spare]");
      const target = over?.dataset.tile;
      const id = dragRef.current;
      if (!id || !target || target === id) return;
      const order = useSettings.getState().tiles.filter(tile => tile !== id);
      order.splice(order.indexOf(target), 0, id);
      useSettings.setState({ tiles: order });
    };
    const up = (event: globalThis.PointerEvent) => {
      const overSpare = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-spare]");
      const id = dragRef.current;
      if (overSpare && id && useSettings.getState().tiles.length > 1) useSettings.setState(state => ({ tiles: state.tiles.filter(tile => tile !== id) }));
      dragRef.current = null;
      setDragging(null);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    return () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
    };
  }, [dragging]);

  const start = (id: string) => (event: PointerEvent) => {
    (event.target as Element).releasePointerCapture?.(event.pointerId);
    dragRef.current = id;
    setDragging(id);
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {tiles.map(id => (
          <div key={id} className={dragging === id ? "scale-105 opacity-70" : ""}>
            <TileButton id={id} editing={editing} onPointerDown={start(id)} />
          </div>
        ))}
      </div>
      {editing && (
        <div data-spare className="mt-4 rounded-3xl border border-dashed border-outline p-3">
          <p className="pb-3 text-label-sm text-on-surface-variant">{t("dragToAdd")}</p>
          <div className="grid grid-cols-2 gap-2">
            {spare.map(id => (
              <div key={id} onClick={() => useSettings.setState(state => ({ tiles: [...state.tiles, id] }))}>
                <TileButton id={id} editing />
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
