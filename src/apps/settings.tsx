// budget: 13 settings screens (per-app permissions, lock setup, developer options…) share one app file
import { useEffect, useState, type ReactNode } from "react";
import {
  allApps, clearAppData, COMMON, factoryReset, forceStop, formatNumber, formatSize, getApp, grantOf, hashSecret, lockNow, pick, setGrant, uninstallApp,
  useBattery, useFileIndex, useGrants, useInstalledApps, useLang, usePhone, useSettings, useT, WALLPAPERS, wallpaperCss,
  type AppDef, type AppProps, type Grant, type LockKind, type Os, type Permission, type SystemSettings,
} from "../kernel";
import { AppGlyph, Button, Chip, Dialog, Icon, ListItem, PatternPad, PinPad, Radio, Scaffold, Slider, Subheader, Switch } from "../ui";

/* String table: one line per screen keeps the 13 screens' texts scannable. */
const S = {
  ...COMMON,
  name: ["Ayarlar", "Settings"], description: ["Telefonunuzu yapılandırın", "Configure your phone"],
  network: ["Ağ ve internet", "Network & internet"], wifi: ["Wi-Fi", "Wi-Fi"], connected: ["WebDroid-5G ağına bağlı", "Connected to WebDroid-5G"], airplane: ["Uçak modu", "Airplane mode"], bluetooth: ["Bluetooth", "Bluetooth"],
  apps: ["Uygulamalar", "Apps"], openApp: ["Aç", "Open"], forceStop: ["Durmaya zorla", "Force stop"], uninstall: ["Kaldır", "Uninstall"], permissions: ["İzinler", "Permissions"], clearData: ["Verileri temizle", "Clear storage"], cleared: ["Veriler temizlendi", "Storage cleared"],
  permCamera: ["Kamera", "Camera"], permMicrophone: ["Mikrofon", "Microphone"], permLocation: ["Konum", "Location"], permStorage: ["Fotoğraflar ve videolar", "Photos and videos"], permNotifications: ["Bildirimler", "Notifications"],
  granted: ["İzin verildi", "Allowed"], once: ["Yalnızca bu sefer", "Only this time"], denied: ["İzin verilmedi", "Not allowed"], blocked: ["İzin verilmedi", "Not allowed"],
  notifications: ["Bildirimler", "Notifications"], dnd: ["Rahatsız Etmeyin", "Do Not Disturb"], lockScreenNotes: ["Kilit ekranında bildirimler", "Notifications on lock screen"],
  battery: ["Pil", "Battery"], level: ["%{n}", "{n}%"], charging: ["Şarj oluyor", "Charging"], saver: ["Pil Tasarrufu", "Battery Saver"], saverHint: ["Koyu temayı açar, arka plan etkinliğini azaltır", "Turns on dark theme and limits background activity"],
  storage: ["Depolama", "Storage"], images: ["Görseller", "Images"], videos: ["Videolar", "Videos"], audio: ["Ses", "Audio"], documents: ["Dokümanlar", "Documents"], other: ["Diğer", "Other"],
  sound: ["Ses ve titreşim", "Sound & vibration"], media: ["Medya", "Media"], ring: ["Zil ve bildirim", "Ring & notifications"], alarm: ["Alarm", "Alarm"], ringer: ["Zil modu", "Ringer mode"], ringerSound: ["Ses", "Sound"], ringerVibrate: ["Titreşim", "Vibrate"], ringerSilent: ["Sessiz", "Silent"], touchSounds: ["Dokunma sesleri", "Touch sounds"], haptics: ["Dokunma titreşimi", "Touch vibration"],
  display: ["Ekran", "Display"], theme: ["Tema", "Theme"], light: ["Açık", "Light"], dark: ["Koyu", "Dark"], auto: ["Sistem ayarını kullan", "Use system setting"], brightness: ["Parlaklık düzeyi", "Brightness level"], fontSize: ["Yazı ve ekran boyutu", "Font & display size"], timeout: ["Ekran zaman aşımı", "Screen timeout"], seconds: ["{n} saniye", "{n} seconds"], minutes: ["{n} dakika", "{n} minutes"], navigation: ["Sistem navigasyonu", "System navigation"], gesture: ["Hareketle gezinme", "Gesture navigation"], buttons: ["3 düğmeli gezinme", "3-button navigation"],
  wallpaper: ["Duvar kağıdı ve stil", "Wallpaper & style"], fromGallery: ["Galeriden seç", "Choose from gallery"], themedIcons: ["Temalı simgeler", "Themed icons"], themedHint: ["Uygulama simgeleri duvar kağıdı renklerini alır", "App icons take on your wallpaper colours"],
  security: ["Güvenlik", "Security"], screenLock: ["Ekran kilidi", "Screen lock"], none: ["Yok", "None"], swipe: ["Kaydırma", "Swipe"], pin: ["PIN", "PIN"], pattern: ["Desen", "Pattern"], current: ["Mevcut kilidi doğrulayın", "Confirm your current lock"], choose: ["Yeni kilidi girin (en az 4)", "Enter the new lock (at least 4)"], repeat: ["Tekrar girin", "Enter it again"], mismatch: ["Eşleşmedi, tekrar deneyin", "Didn't match, try again"],
  location: ["Konum", "Location"], useLocation: ["Konumu kullan", "Use location"],
  system: ["Sistem", "System"], language: ["Dil", "Language"], langTr: ["Türkçe", "Türkçe"], langEn: ["English", "English"], developer: ["Geliştirici seçenekleri", "Developer options"], reset: ["Tüm verileri sil (fabrika ayarları)", "Erase all data (factory reset)"], resetConfirm: ["Tüm uygulamalar, dosyalar ve ayarlar silinecek.", "All apps, files and settings will be erased."], animScale: ["Animasyon ölçeği", "Animation scale"], showTaps: ["Dokunmaları göster", "Show taps"],
  about: ["Telefon hakkında", "About phone"], deviceName: ["Cihaz adı", "Device name"], model: ["WebDroid Telefon", "WebDroid Phone"], phoneNumber: ["Telefon numarası", "Phone number"], version: ["Android sürümü", "Android version"], build: ["Yapı numarası", "Build number"], stepsAway: ["Geliştirici olmanıza {n} adım kaldı", "You are now {n} steps away from being a developer"], nowDeveloper: ["Artık bir geliştiricisiniz!", "You are now a developer!"],
} as const;

type Key = keyof typeof S;
// Pixel's Settings home cycles its icon circles through the palette's three accents.
const CIRCLES = ["bg-primary-container text-on-primary-container", "bg-tertiary-container text-on-tertiary-container", "bg-secondary-container text-on-secondary-container"];
const PAGES: Array<[string, string]> = [
  ["network", "wifi"], ["apps", "apps"], ["notifications", "notifications"], ["battery", "battery_full"], ["storage", "storage"], ["sound", "volume_up"],
  ["display", "brightness_6"], ["wallpaper", "palette"], ["security", "lock"], ["location", "location_on"], ["system", "settings_suggest"], ["about", "smartphone"],
];
const PERMISSION_LABEL: Record<Permission, Key> = { camera: "permCamera", microphone: "permMicrophone", location: "permLocation", storage: "permStorage", notifications: "permNotifications" };
const CATEGORIES: Array<[Key, (mime: string) => boolean]> = [
  ["images", mime => mime.startsWith("image/")], ["videos", mime => mime.startsWith("video/")], ["audio", mime => mime.startsWith("audio/")],
  ["documents", mime => mime.startsWith("text/") || mime.includes("pdf")], ["other", () => true],
];
const set = (patch: Partial<SystemSettings>) => useSettings.setState(patch);
const toggleIn = (list: string[], item: string, present: boolean) => (present ? [...new Set([...list, item])] : list.filter(entry => entry !== item));
let buildTaps = 0;

function Toggle({ label, hint, value, onChange, icon }: { label: string; hint?: string; value: boolean; onChange: (value: boolean) => void; icon?: string }) {
  return <ListItem icon={icon} headline={label} supporting={hint} trailing={<Switch checked={value} label={label} onChange={onChange} />} onClick={() => onChange(!value)} />;
}

function Choice<T extends string | number>({ options, value, onChange }: { options: Array<[T, string]>; value: T; onChange: (value: T) => void }) {
  return options.map(([option, label]) => (
    <ListItem key={String(option)} leading={<Radio checked={value === option} onChange={() => onChange(option)} label={label} />} headline={label} onClick={() => onChange(option)} />
  ));
}

/** Android flow: confirm the current PIN/pattern, enter the new one twice. */
function LockSetup({ kind, os }: { kind: LockKind; os: Os }) {
  const t = useT(S);
  const lock = useSettings(state => state.lock);
  const secretKind = (value: LockKind) => value === "pin" || value === "pattern";
  const [step, setStep] = useState<"current" | "choose" | "repeat">(secretKind(lock.kind) ? "current" : "choose");
  const [first, setFirst] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const finish = async (secret?: string) => {
    set({ lock: { kind, hash: secret ? await hashSecret(secret) : undefined } });
    lockNow();
    os.back();
  };
  const submit = async (value: string) => {
    setPin("");
    setError(false);
    if (step === "current") {
      if ((await hashSecret(value)) !== lock.hash) return setError(true);
      if (secretKind(kind)) return setStep("choose");
      return finish();
    }
    if (value.length < 4) return setError(true);
    if (step === "choose") {
      setFirst(value);
      return setStep("repeat");
    }
    if (value === first) return finish(value);
    setError(true);
    setStep("choose");
  };
  useEffect(() => {
    if (!secretKind(kind) && !secretKind(lock.kind)) void finish();
  }, []);
  const usesPattern = (step === "current" ? lock.kind : kind) === "pattern";
  return (
    <Scaffold title={t(kind)} onBack={os.back}>
      <div className="flex flex-col items-center gap-8 pt-8">
        <p className={`text-title ${error ? "text-error" : ""}`}>{t(error ? "mismatch" : step)}</p>
        {usesPattern ? <PatternPad error={error} onComplete={value => void submit(value)} /> : <PinPad value={pin} onChange={setPin} onSubmit={() => void submit(pin)} labels={{ delete: t("delete"), enter: t("ok") }} />}
      </div>
    </Scaffold>
  );
}

function AppInfo({ id, os }: { id: string; os: Os }) {
  const t = useT(S);
  const app = getApp(id);
  const { mutedApps, mutedChannels } = useSettings();
  useGrants(state => state.grants[id]);
  if (!app) return null;
  const clear = () => {
    forceStop(id);
    void clearAppData(id).then(() => os.toast(t("cleared")));
  };
  return (
    <Scaffold title={pick(app.name)} onBack={os.back}>
      <div className="flex flex-col items-center gap-4 py-6">
        <AppGlyph app={app} size={72} />
        <div className="flex gap-2">
          <Button variant="tonal" icon="open_in_new" onClick={() => void os.startActivity({ action: "MAIN", app: id })}>{t("openApp")}</Button>
          <Button variant="tonal" icon="block" onClick={() => forceStop(id)}>{t("forceStop")}</Button>
        </div>
      </div>
      <Toggle icon="notifications" label={t("notifications")} value={!mutedApps.includes(id)} onChange={on => set({ mutedApps: toggleIn(mutedApps, id, !on) })} />
      {Object.entries(app.channels ?? {}).map(([channel, info]) => (
        <Toggle key={channel} label={pick(info.name)} value={!mutedChannels.includes(`${id}/${channel}`)} onChange={on => set({ mutedChannels: toggleIn(mutedChannels, `${id}/${channel}`, !on) })} />
      ))}
      {!!app.permissions?.length && <Subheader>{t("permissions")}</Subheader>}
      {app.permissions?.map(permission => {
        const grant: Grant = grantOf(id, permission) ?? "denied";
        return <Toggle key={permission} label={t(PERMISSION_LABEL[permission])} hint={t(grant)} value={grant === "granted" || grant === "once"} onChange={on => setGrant(id, permission, on ? "granted" : "denied")} />;
      })}
      <Subheader>{t("storage")}</Subheader>
      <ListItem icon="delete_sweep" headline={t("clearData")} onClick={clear} />
      {!app.system && <ListItem icon="delete" headline={t("uninstall")} onClick={() => void uninstallApp(id).then(os.back)} />}
    </Scaffold>
  );
}

function Settings({ route, intent, os }: AppProps) {
  const t = useT(S);
  const lang = useLang();
  const settings = useSettings();
  const battery = useBattery();
  const number = usePhone(state => state.number);
  const files = useFileIndex(state => state.entries);
  const installed = useInstalledApps();
  const [resetting, setResetting] = useState(false);
  // Deep links: app info from the launcher, a page from a quick-settings long press.
  useEffect(() => {
    if (intent.action === "APP_DETAILS" && intent.extras?.app) os.replace(`app/${intent.extras.app}`);
    else if (intent.extras?.page) os.replace(String(intent.extras.page));
  }, [intent, os]);

  const page = (title: Key, children: ReactNode) => <Scaffold title={t(title)} onBack={os.back} large>{children}</Scaffold>;
  const slider = (label: Key, control: ReactNode) => <div className="px-4 py-3"><p className="pb-2 text-body">{t(label)}</p>{control}</div>;
  const named = (list: typeof installed) => list.map(app => ({ app, label: pick(app.name, undefined, lang) }));
  if (route.startsWith("app/")) return <AppInfo id={route.slice(4)} os={os} />;
  if (route.startsWith("lock/")) return <LockSetup kind={route.slice(5) as LockKind} os={os} />;

  switch (route) {
    case "network":
      return page("network", <>
        <Toggle icon="wifi" label={t("wifi")} hint={settings.wifi && !settings.airplane ? t("connected") : undefined} value={settings.wifi} onChange={wifi => set({ wifi })} />
        <Toggle icon="flight" label={t("airplane")} value={settings.airplane} onChange={airplane => set({ airplane })} />
        <Toggle icon="bluetooth" label={t("bluetooth")} value={settings.bluetooth} onChange={bluetooth => set({ bluetooth })} />
      </>);
    case "apps":
      return page("apps", named(installed).map(({ app, label }) => <ListItem key={app.id} leading={<AppGlyph app={app} size={40} />} headline={label} onClick={() => os.push(`app/${app.id}`)} />));
    case "notifications":
      return page("notifications", <>
        <Toggle icon="do_not_disturb_on" label={t("dnd")} value={settings.dnd} onChange={dnd => set({ dnd })} />
        <Toggle icon="lock" label={t("lockScreenNotes")} value={settings.lockNotifications} onChange={lockNotifications => set({ lockNotifications })} />
        <Subheader>{t("apps")}</Subheader>
        {named(installed).map(({ app, label }) => <Toggle key={app.id} label={label} value={!settings.mutedApps.includes(app.id)} onChange={on => set({ mutedApps: toggleIn(settings.mutedApps, app.id, !on) })} />)}
      </>);
    case "battery":
      return page("battery", <>
        <div className="px-4 py-6">
          <p className="text-display">{t("level", { n: Math.round(battery.level * 100) })}</p>
          {battery.charging && <p className="text-body text-on-surface-variant">{t("charging")}</p>}
        </div>
        <Toggle icon="battery_saver" label={t("saver")} hint={t("saverHint")} value={settings.batterySaver} onChange={batterySaver => set({ batterySaver })} />
      </>);
    case "storage": {
      const categoryOf = (mime: string) => CATEGORIES.find(([, test]) => test(mime))?.[0] ?? "other";
      const sizes = CATEGORIES.map(([key]) => [key, files.filter(file => categoryOf(file.mime) === key).reduce((sum, file) => sum + file.size, 0)] as const);
      return page("storage", <>
        <p className="px-4 py-4 text-headline">{formatSize(sizes.reduce((sum, [, size]) => sum + size, 0))}</p>
        {sizes.map(([key, size]) => <ListItem key={key} headline={t(key)} trailing={formatSize(size)} />)}
      </>);
    }
    case "sound":
      return page("sound", <>
        {(["media", "ring", "alarm"] as const).map(stream => (
          <div key={stream}>{slider(stream, <Slider label={t(stream)} icon={{ media: "music_note", ring: "ring_volume", alarm: "alarm" }[stream]} value={settings.volumes[stream]} onChange={value => set({ volumes: { ...settings.volumes, [stream]: value } })} onCommit={() => os.sound("notify")} />)}</div>
        ))}
        <Subheader>{t("ringer")}</Subheader>
        <Choice options={[["sound", t("ringerSound")], ["vibrate", t("ringerVibrate")], ["silent", t("ringerSilent")]]} value={settings.ringer} onChange={ringer => set({ ringer })} />
        <Toggle label={t("touchSounds")} value={settings.touchSounds} onChange={touchSounds => set({ touchSounds })} />
        <Toggle label={t("haptics")} value={settings.haptics} onChange={haptics => set({ haptics })} />
      </>);
    case "display":
      return page("display", <>
        <Subheader>{t("theme")}</Subheader>
        <Choice options={[["light", t("light")], ["dark", t("dark")], ["auto", t("auto")]]} value={settings.theme} onChange={theme => set({ theme })} />
        {slider("brightness", <Slider label={t("brightness")} icon="brightness_6" min={0.1} value={settings.brightness} onChange={brightness => set({ brightness })} />)}
        {slider("fontSize", <Slider label={t("fontSize")} min={0.85} max={1.3} step={0.05} value={settings.fontScale} onChange={fontScale => set({ fontScale })} />)}
        <Subheader>{t("timeout")}</Subheader>
        <Choice options={[15, 30, 60, 120, 300, 600].map(seconds => [seconds, seconds < 60 ? t("seconds", { n: seconds }) : t("minutes", { n: seconds / 60 })])} value={settings.screenTimeout} onChange={screenTimeout => set({ screenTimeout })} />
        <Subheader>{t("navigation")}</Subheader>
        <Choice options={[["gesture", t("gesture")], ["buttons", t("buttons")]]} value={settings.navMode} onChange={navMode => set({ navMode })} />
      </>);
    case "wallpaper": {
      const fromGallery = () => void os.startActivity({ action: "GET_CONTENT", type: "image/*" }).then(result => result?.path && os.settings.set({ wallpaper: String(result.path) }));
      return page("wallpaper", <div className="grid grid-cols-3 gap-3 p-4">
        {Object.keys(WALLPAPERS).map((id, index) => (
          <button key={id} type="button" aria-label={`${t("wallpaper")} ${index + 1}`} onClick={() => os.settings.set({ wallpaper: id })} className={`aspect-[9/16] rounded-2xl ${settings.wallpaper === id ? "ring-4 ring-primary ring-offset-2 ring-offset-surface" : ""}`} style={{ background: wallpaperCss(id) }} />
        ))}
        <Button variant="tonal" icon="photo_library" className="col-span-3" onClick={fromGallery}>{t("fromGallery")}</Button>
        <div className="col-span-3 -mx-4"><Toggle icon="palette" label={t("themedIcons")} hint={t("themedHint")} value={settings.themedIcons} onChange={themedIcons => set({ themedIcons })} /></div>
      </div>);
    }
    case "security":
      return page("security", <>
        <Subheader>{t("screenLock")}</Subheader>
        <Choice options={(["none", "swipe", "pin", "pattern"] as const).map(kind => [kind, t(kind)])} value={settings.lock.kind} onChange={kind => os.push(`lock/${kind}`)} />
      </>);
    case "location":
      return page("location", <>
        <Toggle icon="location_on" label={t("useLocation")} value={settings.location} onChange={location => set({ location })} />
        {named(allApps().filter(app => app.permissions?.includes("location"))).map(({ app, label }) => <ListItem key={app.id} headline={label} supporting={t(grantOf(app.id, "location") ?? "denied")} onClick={() => os.push(`app/${app.id}`)} />)}
      </>);
    case "system":
      return page("system", <>
        <Subheader>{t("language")}</Subheader>
        <Choice options={[["tr", t("langTr")], ["en", t("langEn")]]} value={settings.lang} onChange={value => set({ lang: value })} />
        {settings.developer && <ListItem icon="code" headline={t("developer")} onClick={() => os.push("developer")} />}
        <ListItem icon="restart_alt" headline={t("reset")} onClick={() => setResetting(true)} />
        <Dialog open={resetting} onClose={() => setResetting(false)} icon="warning" title={t("reset")} actions={<><Button variant="text" onClick={() => setResetting(false)}>{t("cancel")}</Button><Button variant="danger" onClick={() => void factoryReset()}>{t("delete")}</Button></>}>
          {t("resetConfirm")}
        </Dialog>
      </>);
    case "developer":
      return page("developer", <>
        <Toggle label={t("developer")} value={settings.developer} onChange={developer => set({ developer })} />
        <Subheader>{t("animScale")}</Subheader>
        <div className="flex flex-wrap gap-2 px-4">{[0, 0.5, 1, 1.5, 2, 5].map(scale => <Chip key={scale} label={`${scale}x`} selected={settings.animScale === scale} onClick={() => set({ animScale: scale })} />)}</div>
        <Toggle label={t("showTaps")} value={settings.showTaps} onChange={showTaps => set({ showTaps })} />
      </>);
    case "about": {
      const tapBuild = () => {
        buildTaps++;
        if (buildTaps >= 7) set({ developer: true });
        os.toast(settings.developer || buildTaps >= 7 ? t("nowDeveloper") : t("stepsAway", { n: 7 - buildTaps }));
      };
      return page("about", <>
        <ListItem headline={t("deviceName")} supporting={[settings.userName, t("model")].filter(Boolean).join(" · ")} />
        <ListItem headline={t("phoneNumber")} supporting={formatNumber(number)} />
        <ListItem headline={t("version")} supporting="15" />
        <ListItem headline={t("build")} supporting="WD1A.241004.001" onClick={tapBuild} />
      </>);
    }
  }
  return (
    <Scaffold title={t("name")} large>
      {PAGES.map(([id, icon], index) => (
        <ListItem key={id} leading={<span className={`grid size-10 place-items-center rounded-full ${CIRCLES[index % CIRCLES.length]}`}><Icon name={icon} /></span>} headline={t(id as Key)} onClick={() => os.push(id)} />
      ))}
    </Scaffold>
  );
}

export default {
  id: "settings",
  name: S.name,
  icon: "settings",
  tint: { hue: 250, chroma: 0.15 },
  description: S.description,
  system: true,
  handles: [{ action: "APP_DETAILS" }],
  Component: Settings,
} satisfies AppDef;
