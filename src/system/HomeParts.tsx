import { useMemo } from "react";
import { getApp, useBackHandler, useInstalledApps, useT } from "../kernel";
import { makeOs } from "../kernel/context";
import { launch } from "../kernel/os";
import { AppGlyph, TextField } from "../ui";
import { AppIcon } from "./AppIcon";
import type { MenuTarget } from "./Drawer";
import { renameFolder, useHome, type HomeItem } from "./home";
import { S } from "./strings";
import { screenRect, toScreen } from "./store";

export function FolderIcon({ apps }: { apps: string[] }) {
  return (
    <span className="ripple grid size-14 grid-cols-2 place-items-center gap-0.5 rounded-2xl bg-surface-container/80 p-1.5 backdrop-blur">
      {apps.slice(0, 4).flatMap(id => getApp(id) ?? []).map(app => (
        <AppGlyph key={app.id} app={app} size={20} />
      ))}
    </span>
  );
}

export function FolderView({ item, onClose, onMenu }: { item: HomeItem; onClose: () => void; onMenu: (target: MenuTarget) => void }) {
  const t = useT(S);
  useBackHandler(onClose, true, "home");
  const folder = item.folder;
  if (!folder) return null;
  return (
    <div className="enter absolute inset-0 z-40 grid place-items-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div className="pop w-72 rounded-4xl bg-surface-container p-4" onClick={event => event.stopPropagation()}>
        <TextField label={t("folder")} value={folder.name} placeholder={t("unnamedFolder")} onChange={name => useHome.setState(renameFolder(useHome.getState(), item.id, name))} />
        <div className="mt-4 grid grid-cols-3 gap-4">
          {folder.apps.flatMap(id => getApp(id) ?? []).map(app => (
            <AppIcon
              key={app.id}
              app={app}
              onClick={event => {
                onClose();
                void launch(app.id, screenRect(event.currentTarget));
              }}
              onContextMenu={event => {
                event.preventDefault();
                onMenu({ app: app.id, inFolder: true, ...toScreen(event.clientX, event.clientY) });
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** App widgets as 2×2 cards in the reserved rows of page 0. */
export function Widgets() {
  const installed = useInstalledApps();
  const apps = useMemo(() => installed.filter(app => app.Widget).slice(0, 2), [installed]);
  const contexts = useMemo(() => new Map(apps.map(app => [app.id, makeOs(app.id)])), [apps]);
  return (
    <div className="col-span-4 row-span-2 row-start-1 grid grid-cols-2 gap-3 p-2">
      {apps.map(app => {
        const Widget = app.Widget;
        const os = contexts.get(app.id);
        return Widget && os ? (
          <button key={app.id} type="button" className="pop min-w-0 text-left transition-transform active:scale-95" onClick={event => void launch(app.id, screenRect(event.currentTarget))}>
            <Widget os={os} />
          </button>
        ) : null;
      })}
    </div>
  );
}
