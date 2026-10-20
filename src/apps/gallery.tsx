import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { basename, COMMON, dirname, fileUrl, formatDate, takenPath, uniquePath, useLang, useMedia, usePermission, useT, type AppDef, type AppProps, type FileEntry, type Os } from "../kernel";
import { BottomNav, Button, Chip, Dialog, EmptyState, Icon, IconButton, PermissionState, Scaffold } from "../ui";

const S = {
  ...COMMON,
  name: ["Galeri", "Gallery"],
  description: ["Fotoğraflarınız ve videolarınız", "Your photos and videos"],
  photos: ["Fotoğraflar", "Photos"],
  albums: ["Albümler", "Albums"],
  noPhotos: ["Henüz fotoğraf yok", "No photos yet"],
  noPhotosHint: ["Kamerayla çektikleriniz ve ekran görüntüleri burada görünür", "Photos you take and screenshots appear here"],
  needStorage: ["Fotoğrafları göstermek için izin gerekiyor", "Permission is needed to show your photos"],
  setWallpaper: ["Duvar kağıdı yap", "Set as wallpaper"],
  wallpaperSet: ["Duvar kağıdı ayarlandı", "Wallpaper set"],
  rotate: ["Döndür", "Rotate"],
  original: ["Orijinal", "Original"],
  square: ["Kare", "Square"],
  filter: ["Filtre", "Filter"],
  none: ["Yok", "None"], mono: ["S/B", "Mono"], sepia: ["Sepya", "Sepia"], vivid: ["Canlı", "Vivid"], warm: ["Sıcak", "Warm"], cool: ["Soğuk", "Cool"],
  saveCopy: ["Kopya kaydet", "Save copy"],
  pick: ["Fotoğraf seçin", "Choose a photo"],
  items: ["{n} öğe", "{n} items"],
  previous: ["Önceki", "Previous"],
  next: ["Sonraki", "Next"],
} as const;

const FILTERS = { none: "none", mono: "grayscale(1)", sepia: "sepia(0.9)", vivid: "saturate(1.6) contrast(1.1)", warm: "sepia(0.25) saturate(1.3) hue-rotate(-12deg)", cool: "saturate(1.1) hue-rotate(18deg) brightness(1.05)" };
type Filter = keyof typeof FILTERS;
const ASPECTS: Array<[string, number | null]> = [["original", null], ["square", 1], ["4:3", 4 / 3], ["16:9", 16 / 9]];

function Thumb({ entry, onOpen }: { entry: FileEntry; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} aria-label={basename(entry.path)} className="relative aspect-square overflow-hidden bg-surface-high">
      {entry.mime.startsWith("video/") ? <video src={fileUrl(entry.path)} muted preload="metadata" className="size-full object-cover" /> : <img src={fileUrl(entry.path)} alt="" loading="lazy" className="size-full object-cover" />}
      {entry.mime.startsWith("video/") && <Icon name="play_circle" filled className="absolute right-1 bottom-1 text-white drop-shadow" />}
    </button>
  );
}

function Viewer({ entry, list, os }: { entry: FileEntry; list: FileEntry[]; os: Os }) {
  const t = useT(S);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0, swipe: 0 });
  const [confirm, setConfirm] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef({ distance: 0, scale: 1, x: 0, y: 0, pointerX: 0, pointerY: 0 });
  const index = list.findIndex(item => item.path === entry.path);
  const image = entry.mime.startsWith("image/");
  useEffect(() => {
    setView({ scale: 1, x: 0, y: 0, swipe: 0 });
  }, [entry.path]);

  const go = (delta: number) => list[index + delta] && os.replace(`view/${list[index + delta].path}`);
  const spread = () => {
    const [first, second] = [...pointers.current.values()];
    return second ? Math.hypot(first.x - second.x, first.y - second.y) : 0;
  };
  const begin = (event: PointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    start.current = { distance: spread(), scale: view.scale, x: view.x, y: view.y, pointerX: event.clientX, pointerY: event.clientY };
  };
  // Two fingers pinch, one finger pans when zoomed and pages between items when not.
  const move = (event: PointerEvent) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const origin = start.current;
    if (pointers.current.size === 2 && origin.distance) return setView({ ...view, scale: Math.min(5, Math.max(1, (origin.scale * spread()) / origin.distance)) });
    const dx = event.clientX - origin.pointerX;
    const dy = event.clientY - origin.pointerY;
    setView(view.scale > 1 ? { ...view, x: origin.x + dx, y: origin.y + dy } : { ...view, swipe: dx });
  };
  const end = (event: PointerEvent) => {
    pointers.current.delete(event.pointerId);
    if (view.scale === 1 && Math.abs(view.swipe) > 60) go(view.swipe < 0 ? 1 : -1);
    if (view.scale <= 1) setView({ scale: 1, x: 0, y: 0, swipe: 0 });
  };
  const remove = async () => {
    await os.fs.remove(entry.path);
    setConfirm(false);
    if (list[index + 1] || list[index - 1]) go(list[index + 1] ? 1 : -1);
    else os.back();
  };
  const setWallpaper = () => {
    os.settings.set({ wallpaper: entry.path });
    os.toast(t("wallpaperSet"));
  };
  const transform = `translate(${view.x + view.swipe}px, ${view.y}px) scale(${view.scale})`;
  return (
    <Scaffold dark title="" onBack={os.back} actions={<IconButton icon="share" label={t("share")} className="text-white" onClick={() => os.share({ type: entry.mime, data: entry.path })} />}>
      <div className="flex h-full flex-col">
        <div className="relative min-h-0 flex-1 touch-none overflow-hidden" onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onDoubleClick={() => setView({ scale: view.scale > 1 ? 1 : 2.5, x: 0, y: 0, swipe: 0 })}>
          {image ? (
            <img src={fileUrl(entry.path)} alt={basename(entry.path)} draggable={false} className={`size-full object-contain ${pointers.current.size ? "" : "anim"}`} style={{ transform }} />
          ) : (
            <video src={fileUrl(entry.path)} controls autoPlay className="size-full object-contain" />
          )}
        </div>
        <div className="flex justify-around py-3">
          <IconButton icon="chevron_left" label={t("previous")} className="text-white" disabled={index <= 0} onClick={() => go(-1)} />
          {image && <IconButton icon="tune" label={t("edit")} className="text-white" onClick={() => os.push(`edit/${entry.path}`)} />}
          {image && <IconButton icon="wallpaper" label={t("setWallpaper")} className="text-white" onClick={setWallpaper} />}
          <IconButton icon="delete" label={t("delete")} className="text-white" onClick={() => setConfirm(true)} />
          <IconButton icon="chevron_right" label={t("next")} className="text-white" disabled={index >= list.length - 1} onClick={() => go(1)} />
        </div>
      </div>
      <Dialog open={confirm} onClose={() => setConfirm(false)} title={t("deleteConfirm")} actions={<><Button variant="text" onClick={() => setConfirm(false)}>{t("cancel")}</Button><Button variant="text" onClick={() => void remove()}>{t("delete")}</Button></>}>
        {basename(entry.path)}
      </Dialog>
    </Scaffold>
  );
}

function Editor({ path, os }: { path: string; os: Os }) {
  const t = useT(S);
  const [rotation, setRotation] = useState(0);
  const [aspect, setAspect] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>("none");
  const [busy, setBusy] = useState(false);
  // Rotating around the centre and drawing centred crops the edges for the chosen aspect ratio.
  const save = async () => {
    setBusy(true);
    const image = new Image();
    image.src = fileUrl(path);
    await image.decode();
    const sideways = rotation % 180 !== 0;
    const width = sideways ? image.naturalHeight : image.naturalWidth;
    const height = sideways ? image.naturalWidth : image.naturalHeight;
    const canvas = document.createElement("canvas");
    canvas.width = aspect && width / height > aspect ? height * aspect : width;
    canvas.height = aspect && width / height <= aspect ? width / aspect : height;
    const context = canvas.getContext("2d");
    if (!context) return setBusy(false);
    context.filter = FILTERS[filter];
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((rotation * Math.PI) / 180);
    context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.92));
    const target = uniquePath(`${dirname(path)}/${basename(path).replace(/\.[^.]+$/, "")}_edit.jpg`, takenPath);
    if (blob) await os.fs.write(target, blob);
    os.replace(`view/${target}`);
  };
  return (
    <Scaffold dark title="" onBack={os.back} actions={<Button className="mr-2" disabled={busy} onClick={() => void save()}>{t("saveCopy")}</Button>}>
      <div className="flex h-full flex-col">
        <div className="grid min-h-0 flex-1 place-items-center overflow-hidden p-6">
          <div className="anim max-h-full max-w-full overflow-hidden" style={{ aspectRatio: aspect ?? undefined, rotate: `${rotation}deg` }}>
            <img src={fileUrl(path)} alt="" className="size-full max-h-[55vh] object-cover" style={{ filter: FILTERS[filter] }} />
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-2 px-3 pb-2">
          <Chip icon="rotate_90_degrees_ccw" label={t("rotate")} onClick={() => setRotation((rotation + 270) % 360)} />
          {ASPECTS.map(([label, ratio]) => <Chip key={label} label={label in S ? t(label as keyof typeof S) : label} selected={aspect === ratio} onClick={() => setAspect(ratio)} />)}
        </div>
        <div className="flex gap-2 overflow-x-auto px-3 pb-4">
          {(Object.keys(FILTERS) as Filter[]).map(name => <Chip key={name} label={t(name)} selected={filter === name} onClick={() => setFilter(name)} />)}
        </div>
      </div>
    </Scaffold>
  );
}

function Gallery({ intent, route, os }: AppProps) {
  const t = useT(S);
  const lang = useLang();
  const storage = usePermission(os.app, "storage");
  const media = useMedia(["image/", "video/"]);
  const [tab, setTab] = useState<"photos" | "albums">("photos");
  const picking = intent.action === "PICK" || intent.action === "GET_CONTENT";
  useEffect(() => {
    if (intent.action === "VIEW" && intent.data) os.replace(`view/${intent.data}`);
  }, [intent, os]);
  const albums = useMemo(() => [...Map.groupBy(media, entry => dirname(entry.path))], [media]);

  if (!storage.granted) return <Scaffold title={t("name")}><PermissionState icon="photo_library" text={t("needStorage")} onGrant={() => void storage.request()} /></Scaffold>;
  if (route.startsWith("edit/")) return <Editor path={route.slice(5)} os={os} />;
  const viewing = route.startsWith("view/") ? media.find(entry => entry.path === route.slice(5)) : undefined;
  const album = route.startsWith("album/") ? route.slice(6) : null;
  const scope = album ? media.filter(entry => dirname(entry.path) === album) : media;
  if (viewing) return <Viewer entry={viewing} list={media} os={os} />;

  const open = (entry: FileEntry) => (picking ? os.finish({ path: entry.path, type: entry.mime }) : os.push(`view/${entry.path}`));
  const dayLabel = (time: number) => {
    const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(time).setHours(0, 0, 0, 0)) / 86400000);
    if (days === 0) return t("today");
    return days === 1 ? t("yesterday") : formatDate(time, { weekday: "short", day: "numeric", month: "long", year: "numeric" }, lang);
  };
  const grid = (list: FileEntry[]) =>
    [...Map.groupBy(list, entry => dayLabel(entry.mtime))].map(([day, entries]) => (
      <section key={day}>
        <h2 className="px-4 pt-4 pb-2 text-title-sm">{day}</h2>
        <div className="grid grid-cols-3 gap-0.5">{entries.map(entry => <Thumb key={entry.path} entry={entry} onOpen={() => open(entry)} />)}</div>
      </section>
    ));
  const empty = <EmptyState icon="photo_library" title={t("noPhotos")} text={t("noPhotosHint")} />;

  if (album) return <Scaffold title={basename(album)} onBack={os.back}>{grid(scope)}</Scaffold>;
  return (
    <Scaffold
      title={picking ? t("pick") : t(tab)}
      onBack={picking ? os.back : undefined}
      bottom={!picking && <BottomNav items={[{ value: "photos", icon: "photo", label: t("photos") }, { value: "albums", icon: "photo_album", label: t("albums") }]} value={tab} onChange={setTab} />}
    >
      {media.length === 0 && empty}
      {(tab === "photos" || picking) && grid(media)}
      {tab === "albums" && !picking && (
        <div className="grid grid-cols-2 gap-4 p-4">
          {albums.map(([dir, entries]) => (
            <button key={dir} type="button" onClick={() => os.push(`album/${dir}`)} className="text-left">
              <img src={fileUrl(entries.find(entry => entry.mime.startsWith("image/"))?.path ?? entries[0].path)} alt="" className="aspect-square w-full rounded-2xl bg-surface-high object-cover" />
              <p className="mt-2 text-title-sm">{basename(dir)}</p>
              <p className="text-body-sm text-on-surface-variant">{t("items", { n: entries.length })}</p>
            </button>
          ))}
        </div>
      )}
    </Scaffold>
  );
}

export default {
  id: "gallery",
  name: S.name,
  icon: "photo_library",
  tint: { hue: 350 },
  description: S.description,
  permissions: ["storage"],
  handles: [{ action: "VIEW", type: "image/*" }, { action: "VIEW", type: "video/*" }, { action: "PICK", type: "image/*" }, { action: "GET_CONTENT", type: "image/*" }],
  Component: Gallery,
} satisfies AppDef;
