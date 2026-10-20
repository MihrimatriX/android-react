import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { getApp, haptic, useInstalledApps, useT, type AppDef } from "../kernel";
import { launch, useOs } from "../kernel/os";
import { usePower } from "../kernel/power";
import { Icon } from "../ui";
import { AppIcon } from "./AppIcon";
import { AppMenu, Drawer, UninstallDialog, type MenuTarget } from "./Drawer";
import { CELLS, COLUMNS, ROWS, moveItem, pageCount, sync, useHome, type HomeItem } from "./home";
import { FolderIcon, FolderView, Widgets } from "./HomeParts";
import { S } from "./strings";
import { pullShade, releaseShade, screenRect, toScreen, useUi } from "./store";

interface Gesture {
  x: number;
  y: number;
  axis?: "x" | "y";
  /** Long-pressed home item being dragged. */
  item?: HomeItem;
  timer?: ReturnType<typeof setTimeout>;
}

// Whole, even-pixel rows and 98px columns (like Android's int cell sizes), so centred icons never sit on half pixels.
const ROW_TRACKS = "grid-rows-[repeat(5,round(down,20%,2px))]";

export function Launcher() {
  const t = useT(S);
  const apps = useInstalledApps();
  const ids = useMemo(() => apps.map(app => app.id), [apps]);
  const layout = useHome();
  const appOpen = useOs(state => state.foreground !== null);
  const locked = usePower(state => state.locked);
  const drawer = useUi(state => state.drawer);
  const [page, setPage] = useState(0);
  const [swipe, setSwipe] = useState(0);
  const [dragged, setDragged] = useState<{ item: HomeItem; x: number; y: number; moved: boolean } | null>(null);
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [uninstall, setUninstall] = useState<string | null>(null);
  const [searchFocus, setSearchFocus] = useState(false);
  const gesture = useRef<Gesture | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const edgeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    useHome.setState(sync(useHome.getState(), ids));
  }, [ids]);
  const pages = pageCount(layout.items) + (dragged ? 1 : 0);
  useEffect(() => {
    setPage(current => Math.min(current, pages - 1));
  }, [pages]);
  useEffect(() => {
    useUi.setState({ homePage: page });
  }, [page]);

  // Like Pixel, the icon wave replays whenever home comes back into view; unlocking also zooms in.
  const [entrance, setEntrance] = useState({ key: 0, unlock: false });
  const previous = useRef({ appOpen, locked });
  useEffect(() => {
    const closed = previous.current.appOpen && !appOpen;
    const unlocked = previous.current.locked && !locked;
    previous.current = { appOpen, locked };
    if (closed || unlocked) setEntrance(({ key }) => ({ key: key + 1, unlock: unlocked }));
  }, [appOpen, locked]);
  const wave = (row: number) => ({ "--i": row }) as CSSProperties;

  const cellAt = (clientX: number, clientY: number) => {
    const box = grid.current?.getBoundingClientRect();
    if (!box) return -1;
    const column = Math.floor(((clientX - box.left) / box.width) * COLUMNS);
    const row = Math.floor(((clientY - box.top) / box.height) * ROWS);
    return column < 0 || row < 0 || column >= COLUMNS || row >= ROWS ? -1 : row * COLUMNS + column;
  };

  const onItemDown = (item: HomeItem) => (event: PointerEvent) => {
    const root = event.currentTarget.closest("[data-launcher]");
    const { pointerId, clientX, clientY } = event;
    gesture.current = {
      x: clientX,
      y: clientY,
      item,
      timer: setTimeout(() => {
        haptic("medium");
        root?.setPointerCapture(pointerId);
        setDragged({ item, x: clientX, y: clientY, moved: false });
        if (item.app) setMenu({ app: item.app, ...toScreen(clientX, clientY) });
      }, 450),
    };
  };

  const onDown = (event: PointerEvent) => {
    if (!gesture.current) gesture.current = { x: event.clientX, y: event.clientY };
  };

  const onMove = (event: PointerEvent) => {
    const current = gesture.current;
    if (!current) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (dragged) {
      const moved = dragged.moved || Math.hypot(dx, dy) > 10;
      if (moved) setMenu(null);
      setDragged({ ...dragged, x: event.clientX, y: event.clientY, moved });
      const { x, width } = toScreen(event.clientX, event.clientY);
      clearTimeout(edgeTimer.current);
      if (x < 24 || x > width - 24) edgeTimer.current = setTimeout(() => setPage(value => Math.max(0, Math.min(pages - 1, value + (x < 24 ? -1 : 1)))), 500);
      return;
    }
    if (Math.hypot(dx, dy) > 8) clearTimeout(current.timer);
    current.axis ??= Math.hypot(dx, dy) > 8 ? (Math.abs(dx) > Math.abs(dy) ? "x" : "y") : undefined;
    if (current.axis === "x") setSwipe(dx);
    if (current.axis === "y" && dy > 0) pullShade(dy);
  };

  const onUp = (event: PointerEvent) => {
    const current = gesture.current;
    gesture.current = null;
    clearTimeout(current?.timer);
    clearTimeout(edgeTimer.current);
    if (!current) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (dragged) {
      setDragged(null);
      if (!dragged.moved) return;
      const { y, width } = toScreen(event.clientX, event.clientY);
      const inZones = y < 96;
      if (inZones && toScreen(event.clientX, 0).x > width / 2 && dragged.item.app) setUninstall(dragged.item.app);
      else if (inZones) useHome.setState({ ...layout, items: layout.items.filter(item => item.id !== dragged.item.id) });
      else if (cellAt(event.clientX, event.clientY) >= 0) useHome.setState(moveItem(layout, dragged.item.id, page, cellAt(event.clientX, event.clientY)));
      return;
    }
    setSwipe(0);
    if (current.axis === "x" && Math.abs(dx) > 60) setPage(value => Math.max(0, Math.min(pages - 1, value + (dx < 0 ? 1 : -1))));
    if (current.axis === "y" && dy < -50) {
      setSearchFocus(false);
      useUi.setState({ drawer: true });
    }
    if (useUi.getState().shadeDrag !== null) releaseShade(dy, 0);
  };

  const openItem = (item: HomeItem, element: Element) => (item.folder ? setFolder(item.id) : item.app && void launch(item.app, screenRect(element)));
  const openFolder = layout.items.find(item => item.id === folder);

  return (
    <div
      data-launcher
      inert={appOpen}
      className="absolute inset-0 z-[5] flex touch-none flex-col"
      style={{ paddingTop: "var(--inset-top)", paddingBottom: "var(--inset-bottom)" }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {dragged?.moved && (
        <div className="enter absolute inset-x-0 top-0 z-20 flex h-24 items-end justify-around pb-3 text-label text-white">
          <span className="flex items-center gap-2"><Icon name="close" />{t("removeFromHome")}</span>
          {dragged.item.app && !getApp(dragged.item.app)?.system && <span className="flex items-center gap-2"><Icon name="delete" />{t("uninstall")}</span>}
        </div>
      )}
      <div key={entrance.key} className={`flex min-h-0 flex-1 flex-col ${entrance.unlock ? "unlock-in" : ""}`}>
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div className={`flex h-full ${swipe ? "" : "anim"}`} style={{ transform: `translateX(calc(${-page * 100}% + ${swipe}px))` }}>
            {Array.from({ length: pages }, (_, index) => (
              <div key={index} ref={index === page ? grid : undefined} className={`grid h-full w-full shrink-0 grid-cols-4 px-2.5 ${ROW_TRACKS}`}>
                {index === 0 && <Widgets />}
                {layout.items.filter(item => item.page === index && item.cell < CELLS).map(item => {
                  const app = item.app ? getApp(item.app) : undefined;
                  const hidden = dragged?.moved && dragged.item.id === item.id;
                  return (
                    <div
                      key={item.id}
                      onPointerDown={onItemDown(item)}
                      onClick={event => openItem(item, event.currentTarget.querySelector("[data-glyph]") ?? event.currentTarget)}
                      className={`rise flex min-w-0 flex-col items-center justify-center ${hidden ? "opacity-0" : ""}`}
                      style={{ ...wave(Math.floor(item.cell / COLUMNS)), gridColumn: (item.cell % COLUMNS) + 1, gridRow: Math.floor(item.cell / COLUMNS) + 1 }}
                    >
                      {app && <AppIcon app={app} onWallpaper />}
                      {item.folder && (
                        <span className="flex w-full flex-col items-center gap-1.5">
                          <FolderIcon apps={item.folder.apps} />
                          <span className="w-full truncate text-center text-body-sm text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.45)]">{item.folder.name || t("folder")}</span>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-center gap-1.5 py-2">
          {Array.from({ length: pages }, (_, index) => <span key={index} className={`size-1.5 rounded-full ${index === page ? "bg-white" : "bg-white/40"}`} />)}
        </div>
        <div className="grid grid-cols-4 px-2.5 pb-3">
          {layout.dock.flatMap(id => getApp(id) ?? []).map(app => (
            <AppIcon key={app.id} app={app} label={false} className="rise" style={wave(5)} onClick={event => void launch(app.id, screenRect(event.currentTarget))} />
          ))}
        </div>
        <button
          type="button"
          aria-label={t("search")}
          onClick={() => {
            setSearchFocus(true);
            useUi.setState({ drawer: true });
          }}
          className="mx-4 mb-3 flex h-14 items-center gap-3 rounded-full bg-surface-high/90 px-5 text-body-lg text-on-surface-variant backdrop-blur"
        >
          <Icon name="search" />
          {t("search")}
        </button>
      </div>
      {dragged?.moved && dragged.item.app && getApp(dragged.item.app) && (
        <div className="pointer-events-none absolute z-50 scale-110" style={{ left: toScreen(dragged.x, 0).x - 28, top: toScreen(0, dragged.y).y - 28 }}>
          <AppIcon app={getApp(dragged.item.app) as AppDef} label={false} />
        </div>
      )}
      {drawer && <Drawer focusSearch={searchFocus} onMenu={setMenu} />}
      {openFolder && <FolderView item={openFolder} onClose={() => setFolder(null)} onMenu={setMenu} />}
      {menu && <AppMenu target={menu} onClose={() => setMenu(null)} onUninstall={setUninstall} />}
      <UninstallDialog app={uninstall} onClose={() => setUninstall(null)} />
    </div>
  );
}
