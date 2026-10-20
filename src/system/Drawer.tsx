import { useMemo, useState, type CSSProperties } from "react";
import { getApp, pick, useBackHandler, useInstalledApps, useLang, useT, type AppDef } from "../kernel";
import { launch, startActivity, uninstallApp } from "../kernel/os";
import { Button, Dialog, Icon, SearchField, useDrag, useLongPress } from "../ui";
import { AppIcon } from "./AppIcon";
import { addApp, ejectFromFolder, isPlaced, removeApp, useHome } from "./home";
import { S } from "./strings";
import { screenRect, toScreen, useUi } from "./store";

export interface MenuTarget {
  app: string;
  x: number;
  y: number;
  inFolder?: boolean;
}

/** Long-press popup shared by the home screen, folders and the drawer. */
export function AppMenu({ target, onClose, onUninstall }: { target: MenuTarget; onClose: () => void; onUninstall: (app: string) => void }) {
  const t = useT(S);
  const layout = useHome();
  const app = getApp(target.app);
  useBackHandler(onClose, true, "home");
  if (!app) return null;
  const run = (action: () => void) => () => {
    onClose();
    action();
  };
  const items = [
    { icon: "info", label: t("appInfo"), run: () => void startActivity({ app: "settings", action: "APP_DETAILS", extras: { app: app.id } }) },
    !isPlaced(layout, app.id) && { icon: "add_to_home_screen", label: t("addToHome"), run: () => useHome.setState(addApp(layout, app.id)) },
    target.inFolder && { icon: "folder_off", label: t("removeFromFolder"), run: () => useHome.setState(ejectFromFolder(layout, app.id)) },
    !app.system && { icon: "delete", label: t("uninstall"), run: () => onUninstall(app.id) },
  ].filter(item => !!item);
  return (
    <>
      <div className="absolute inset-0 z-40" onPointerDown={onClose} />
      <div
        role="menu"
        className="pop absolute z-50 w-56 overflow-hidden rounded-3xl bg-surface-container py-2 text-on-surface shadow-xl"
        style={{ left: Math.max(8, Math.min(target.x - 112, toScreen(0, 0).width - 232)), top: Math.max(48, Math.min(target.y - 40, toScreen(0, 0).height - 260)) }}
      >
        {items.map(item => (
          <button key={item.label} role="menuitem" type="button" onClick={run(item.run)} className="ripple flex h-12 w-full items-center gap-3 px-4 text-label">
            <Icon name={item.icon} className="text-on-surface-variant" />
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}

export function UninstallDialog({ app, onClose }: { app: string | null; onClose: () => void }) {
  const t = useT(S);
  const definition = app ? getApp(app) : undefined;
  return (
    <Dialog
      open={!!definition}
      onClose={onClose}
      icon="delete"
      title={definition && pick(definition.name)}
      actions={
        <>
          <Button variant="text" onClick={onClose}>{t("dismiss")}</Button>
          <Button variant="text" onClick={() => app && void uninstallApp(app).then(() => useHome.setState(removeApp(useHome.getState(), app))).finally(onClose)}>
            {t("uninstall")}
          </Button>
        </>
      }
    >
      {definition && t("uninstallConfirm", { app: pick(definition.name) })}
    </Dialog>
  );
}

const close = () => useUi.setState({ drawer: false });

function DrawerIcon({ app, index, onOpen, onMenu }: { app: AppDef; index: number; onOpen: (app: AppDef, element: Element) => void; onMenu: (target: MenuTarget) => void }) {
  const press = useLongPress(point => onMenu({ app: app.id, ...toScreen(point.clientX, point.clientY) }));
  return <AppIcon app={app} {...press} className="rise" style={{ "--i": Math.min(index, 20) } as CSSProperties} onClick={event => onOpen(app, event.currentTarget.firstElementChild ?? event.currentTarget)} />;
}

export function Drawer({ focusSearch, onMenu }: { focusSearch: boolean; onMenu: (target: MenuTarget) => void }) {
  const t = useT(S);
  const lang = useLang();
  const apps = useInstalledApps();
  const [query, setQuery] = useState("");
  const [pull, setPull] = useState(0);
  useBackHandler(close, true, "home");
  const sorted = useMemo(
    () => apps.toSorted((a, b) => pick(a.name, undefined, lang).localeCompare(pick(b.name, undefined, lang), lang)),
    [apps, lang],
  );
  const matches = sorted.filter(app => pick(app.name, undefined, lang).toLocaleLowerCase(lang).includes(query.trim().toLocaleLowerCase(lang)));
  const drag = useDrag({ axis: "y", onMove: ({ dy }) => setPull(Math.max(0, dy)), onEnd: ({ dy, vy }) => (dy > 100 || vy > 0.5 ? close() : setPull(0)) });
  const webSearch = () => void startActivity({ action: "VIEW", data: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}` }).then(close);
  const open = (app: AppDef, element: Element) => {
    void launch(app.id, screenRect(element));
    close();
  };

  return (
    <div
      className="enter-up absolute inset-0 z-30 flex flex-col bg-surface-container/95 backdrop-blur-xl"
      style={{ paddingTop: "calc(var(--inset-top) + 0.5rem)", transform: `translateY(${pull}px)` }}
    >
      <div {...drag} className="touch-none px-4 pb-3">
        <SearchField value={query} onChange={setQuery} placeholder={t("searchApps")} autoFocus={focusSearch} />
      </div>
      <div className="grid flex-1 auto-rows-min grid-cols-4 gap-y-5 overflow-y-auto px-2.5 pb-8">
        {matches.map((app, index) => (
          <DrawerIcon key={app.id} app={app} index={index} onOpen={open} onMenu={onMenu} />
        ))}
        {query.trim() && (
          <div className="col-span-4 flex flex-col items-center gap-3 pt-4 text-body text-on-surface-variant">
            {!matches.length && t("noResults")}
            <Button variant="tonal" icon="travel_explore" onClick={webSearch}>{t("searchWeb", { query: query.trim() })}</Button>
          </div>
        )}
      </div>
    </div>
  );
}
