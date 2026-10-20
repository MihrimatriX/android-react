import { useState, type MouseEvent } from "react";
import { create } from "zustand";
import { allApps, COMMON, getApp, markInstalled, pick, uninstallApp, useInstalled, useLang, useOnline, useT, type AppDef, type AppProps, type Os, type Permission } from "../kernel";
import { AppGlyph, BottomNav, Button, Dialog, ListItem, OfflineState, Scaffold, SearchField, Subheader } from "../ui";

const S = {
  ...COMMON,
  name: ["Uygulama Mağazası", "App Store"],
  description: ["Uygulamaları keşfedin, yükleyin ve kaldırın", "Discover, install and remove apps"],
  discover: ["Keşfet", "Discover"],
  installed: ["Yüklü", "Installed"],
  available: ["Yüklenebilir", "Available"],
  install: ["Yükle", "Install"],
  uninstall: ["Kaldır", "Uninstall"],
  downloading: ["İndiriliyor: {app}", "Downloading: {app}"],
  installedNote: ["{app} yüklendi", "{app} installed"],
  uninstallConfirm: ["{app} kaldırılsın mı? Verileri de silinir.", "Uninstall {app}? Its data will be deleted too."],
  systemApp: ["Sistem uygulaması", "System app"],
  permissions: ["İzinler", "Permissions"],
  noPermissions: ["Özel izin gerektirmez", "Needs no special permissions"],
  searchApps: ["Uygulama ara", "Search apps"],
  channel: ["Yüklemeler", "Installs"],
  camera: ["Kamera", "Camera"], microphone: ["Mikrofon", "Microphone"], location: ["Konum", "Location"], storage: ["Fotoğraflar ve medya", "Photos and media"], notifications: ["Bildirimler", "Notifications"],
} as const;

/** Simulated download progress per app id; the install itself is just making the shipped app visible. */
const useDownloads = create(() => ({ progress: {} as Record<string, number> }));
const DOWNLOAD_MS = 1600;

function install(os: Os, app: AppDef): void {
  const started = Date.now();
  const name = pick(app.name);
  const tick = setInterval(() => {
    const progress = Math.min(1, (Date.now() - started) / DOWNLOAD_MS);
    useDownloads.setState(({ progress: all }) => ({ progress: { ...all, [app.id]: progress } }));
    os.notify({ id: `install-${app.id}`, channel: "installs", ongoing: progress < 1, icon: "download", title: pick(S.downloading, { app: name }), progress });
    if (progress < 1) return;
    clearInterval(tick);
    markInstalled(app.id, true);
    useDownloads.setState(({ progress: all }) => ({ progress: Object.fromEntries(Object.entries(all).filter(([id]) => id !== app.id)) }));
    os.cancel(`install-${app.id}`);
    os.notify({ channel: "installs", icon: app.icon, title: pick(S.installedNote, { app: name }), intent: { action: "MAIN", app: app.id } });
  }, 120);
}

function Action({ app, os, onUninstall }: { app: AppDef; os: Os; onUninstall: (app: AppDef) => void }) {
  const t = useT(S);
  const installed = useInstalled(state => state.installed.includes(app.id));
  const progress = useDownloads(state => state.progress[app.id]);
  const online = useOnline();
  if (progress !== undefined) {
    return (
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-secondary-container">
        <span className="anim block h-full bg-primary" style={{ width: `${progress * 100}%` }} />
      </span>
    );
  }
  // Buttons sit inside a clickable row, so they must not also open the detail page.
  const only = (run: () => void) => (event: MouseEvent) => {
    event.stopPropagation();
    run();
  };
  const open = only(() => void os.startActivity({ action: "MAIN", app: app.id }));
  if (!installed) return <Button disabled={!online} onClick={only(() => install(os, app))}>{t("install")}</Button>;
  if (app.system) return <Button variant="tonal" onClick={open}>{t("open")}</Button>;
  return (
    <span className="flex gap-1">
      <Button variant="outlined" onClick={only(() => onUninstall(app))}>{t("uninstall")}</Button>
      <Button variant="tonal" onClick={open}>{t("open")}</Button>
    </span>
  );
}

function Store({ route, os }: AppProps) {
  const t = useT(S);
  const lang = useLang();
  const online = useOnline();
  const installedIds = useInstalled(state => state.installed);
  const [tab, setTab] = useState<"discover" | "installed">("discover");
  const [query, setQuery] = useState("");
  const [removing, setRemoving] = useState<AppDef | null>(null);
  const name = (app: AppDef) => pick(app.name, undefined, lang);
  const apps = allApps()
    .filter(app => name(app).toLocaleLowerCase(lang).includes(query.toLocaleLowerCase(lang)))
    .sort((a, b) => name(a).localeCompare(name(b), lang));
  const icon = (app: AppDef, size: number) => <AppGlyph app={app} size={size} />;
  const row = (app: AppDef) => (
    <ListItem key={app.id} leading={icon(app, 48)} headline={name(app)} supporting={pick(app.description, undefined, lang)} trailing={<Action app={app} os={os} onUninstall={setRemoving} />} onClick={() => os.push(`app/${app.id}`)} />
  );
  const confirm = (
    <Dialog
      open={!!removing}
      onClose={() => setRemoving(null)}
      icon="delete"
      title={removing && name(removing)}
      actions={<><Button variant="text" onClick={() => setRemoving(null)}>{t("cancel")}</Button><Button variant="text" onClick={() => removing && void uninstallApp(removing.id).finally(() => setRemoving(null))}>{t("uninstall")}</Button></>}
    >
      {removing && t("uninstallConfirm", { app: name(removing) })}
    </Dialog>
  );

  const detail = route.startsWith("app/") ? getApp(route.slice(4)) : undefined;
  if (detail) {
    return (
      <Scaffold title="" onBack={os.back}>
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-center gap-4">
            {icon(detail, 72)}
            <div>
              <h1 className="text-headline-sm">{name(detail)}</h1>
              {detail.system && <p className="text-body text-on-surface-variant">{t("systemApp")}</p>}
            </div>
          </div>
          <Action app={detail} os={os} onUninstall={setRemoving} />
          <p className="text-body-lg">{pick(detail.description, undefined, lang)}</p>
          <Subheader>{t("permissions")}</Subheader>
          {detail.permissions?.length ? detail.permissions.map((permission: Permission) => <ListItem key={permission} icon="shield" headline={t(permission)} />) : <p className="px-4 text-body text-on-surface-variant">{t("noPermissions")}</p>}
        </div>
        {confirm}
      </Scaffold>
    );
  }

  const installedApps = apps.filter(app => installedIds.includes(app.id));
  const available = apps.filter(app => !installedIds.includes(app.id));
  const showInstalled = tab === "installed" || available.length === 0;
  return (
    <Scaffold title={t("name")} bottom={<BottomNav items={[{ value: "discover", icon: "storefront", label: t("discover") }, { value: "installed", icon: "apps", label: t("installed") }]} value={tab} onChange={setTab} />}>
      <div className="px-4 pb-2"><SearchField value={query} onChange={setQuery} placeholder={t("searchApps")} /></div>
      {!online && tab === "discover" && <OfflineState />}
      {tab === "discover" && available.length > 0 && <Subheader>{t("available")}</Subheader>}
      {tab === "discover" && available.map(row)}
      {showInstalled && <Subheader>{t("installed")}</Subheader>}
      {showInstalled && installedApps.map(row)}
      {confirm}
    </Scaffold>
  );
}

export default {
  id: "store",
  name: S.name,
  icon: "storefront",
  tint: { hue: 305 },
  description: S.description,
  system: true,
  permissions: ["notifications"],
  channels: { installs: { name: S.channel, importance: "low" } },
  Component: Store,
} satisfies AppDef;
