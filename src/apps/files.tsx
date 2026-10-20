import { useEffect, useRef, useState } from "react";
import { basename, COMMON, DIR, dirname, fileUrl, formatDate, formatSize, join, takenPath, uniquePath, useDir, useLang, usePermission, useT, type AppDef, type AppProps, type FileEntry } from "../kernel";
import { Button, Checkbox, Dialog, EmptyState, Fab, Icon, IconButton, ListItem, Menu, PermissionState, Scaffold, TextField } from "../ui";

const S = {
  ...COMMON,
  name: ["Dosyalar", "Files"],
  description: ["Dosyalarınıza göz atın, düzenleyin ve paylaşın", "Browse, organise and share your files"],
  storage: ["Dahili depolama", "Internal storage"],
  empty: ["Bu klasör boş", "This folder is empty"],
  upload: ["Bilgisayardan yükle", "Upload from computer"],
  download: ["Bilgisayara indir", "Download to computer"],
  newFolder: ["Yeni klasör", "New folder"],
  copy: ["Kopyala", "Copy"],
  move: ["Taşı", "Move"],
  pasteHere: ["Buraya yapıştır", "Paste here"],
  selected: ["{n} seçildi", "{n} selected"],
  needStorage: ["Dosyaları göstermek için depolama izni gerekiyor", "Storage permission is needed to show files"],
  pick: ["Dosya seçin", "Choose a file"],
  failed: ["İşlem başarısız oldu", "The operation failed"],
} as const;

const ICONS: Array<[string, string]> = [["image/", "image"], ["video/", "movie"], ["audio/", "music_note"], ["text/", "description"], ["application/pdf", "picture_as_pdf"]];
const iconFor = (entry: FileEntry) => (entry.mime === DIR ? "folder" : (ICONS.find(([prefix]) => entry.mime.startsWith(prefix))?.[1] ?? "draft"));

type Clipboard = { mode: "copy" | "move"; paths: string[] } | null;

function Files({ intent, route, os }: AppProps) {
  const t = useT(S);
  const lang = useLang();
  const storage = usePermission(os.app, "storage");
  const dir = route === "main" ? "/" : route;
  const entries = useDir(dir);
  const [selected, setSelected] = useState<string[]>([]);
  const [clipboard, setClipboard] = useState<Clipboard>(null);
  const [dialog, setDialog] = useState<{ kind: "rename" | "folder" | "delete"; value: string } | null>(null);
  const [menu, setMenu] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
  const picking = intent.action === "GET_CONTENT";
  // Other apps can open Files at a folder (e.g. Music → /Music).
  useEffect(() => {
    if (typeof intent.extras?.dir === "string") os.push(intent.extras.dir);
  }, [intent, os]);

  const run = async (work: () => Promise<unknown>) => {
    try {
      await work();
    } catch {
      os.toast(t("failed"));
    }
  };
  const open = (entry: FileEntry) => {
    if (selected.length) return setSelected(current => (current.includes(entry.path) ? current.filter(path => path !== entry.path) : [...current, entry.path]));
    if (entry.mime === DIR) return os.push(entry.path);
    if (picking) return os.finish({ path: entry.path, type: entry.mime });
    void os.startActivity({ action: "VIEW", type: entry.mime, data: entry.path });
  };
  const paste = () =>
    run(async () => {
      for (const path of clipboard?.paths ?? []) {
        const target = uniquePath(join(dir, basename(path)), takenPath);
        await (clipboard?.mode === "move" ? os.fs.move(path, target) : os.fs.copy(path, target));
      }
      setClipboard(null);
    });
  const confirm = () =>
    run(async () => {
      if (!dialog) return;
      if (dialog.kind === "delete") for (const path of selected) await os.fs.remove(path);
      if (dialog.kind === "folder" && dialog.value.trim()) await os.fs.mkdir(uniquePath(join(dir, dialog.value.trim()), takenPath));
      if (dialog.kind === "rename" && dialog.value.trim()) await os.fs.move(selected[0], uniquePath(join(dirname(selected[0]), dialog.value.trim()), takenPath));
      setDialog(null);
      setSelected([]);
    });
  const onUpload = (input: HTMLInputElement) =>
    run(async () => {
      for (const file of Array.from(input.files ?? [])) await os.fs.write(uniquePath(join(dir, file.name), takenPath), file, file.type || undefined);
      input.value = "";
    });
  const clip = (mode: "copy" | "move") => {
    setClipboard({ mode, paths: selected });
    setSelected([]);
  };
  const downloadSelected = () => {
    const link = Object.assign(document.createElement("a"), { href: fileUrl(selected[0]), download: basename(selected[0]) });
    link.click();
    setSelected([]);
  };

  if (!storage.granted) return <Scaffold title={t("name")} onBack={os.back}><PermissionState icon="folder" text={t("needStorage")} onGrant={() => void storage.request()} /></Scaffold>;

  const single = selected.length === 1 && entries.find(entry => entry.path === selected[0]);
  const selectionActions = (
    <>
      <IconButton icon="content_copy" label={t("copy")} onClick={() => clip("copy")} />
      <IconButton icon="drive_file_move" label={t("move")} onClick={() => clip("move")} />
      <IconButton icon="delete" label={t("delete")} onClick={() => setDialog({ kind: "delete", value: "" })} />
      <IconButton icon="more_vert" label={t("more")} onClick={() => setMenu(true)} />
      <Menu
        open={menu}
        onClose={() => setMenu(false)}
        items={[
          ...(single ? [{ label: t("rename"), icon: "edit", onClick: () => setDialog({ kind: "rename", value: basename(selected[0]) }) }] : []),
          ...(single && single.mime !== DIR
            ? [
                { label: t("share"), icon: "share", onClick: () => os.share({ type: single.mime, data: single.path }) },
                { label: t("download"), icon: "download", onClick: downloadSelected },
              ]
            : []),
        ]}
      />
    </>
  );
  let title = dir === "/" ? t("storage") : basename(dir);
  if (picking) title = t("pick");
  if (selected.length) title = t("selected", { n: selected.length });
  let onBack: (() => void) | undefined = dir === "/" && !picking ? undefined : os.back;
  if (selected.length) onBack = () => setSelected([]);

  return (
    <Scaffold
      title={title}
      onBack={onBack}
      actions={selected.length ? selectionActions : <IconButton icon="create_new_folder" label={t("newFolder")} onClick={() => setDialog({ kind: "folder", value: "" })} />}
      fab={!picking && !clipboard && !selected.length && <Fab icon="upload" label={t("upload")} extended onClick={() => upload.current?.click()} />}
      bottom={
        clipboard && (
          <div className="flex justify-end gap-2 p-3">
            <Button variant="text" onClick={() => setClipboard(null)}>{t("cancel")}</Button>
            <Button icon="content_paste" onClick={() => void paste()}>{t("pasteHere")}</Button>
          </div>
        )
      }
    >
      {dir !== "/" && <p className="truncate px-4 pb-2 text-label-sm text-on-surface-variant">{dir}</p>}
      {entries.length === 0 && <EmptyState icon="folder_open" title={t("empty")} />}
      {entries.map(entry => (
        <ListItem
          key={entry.path}
          selected={selected.includes(entry.path)}
          leading={selected.length ? <Checkbox checked={selected.includes(entry.path)} onChange={() => open(entry)} /> : <Icon name={iconFor(entry)} filled className="text-primary" />}
          headline={basename(entry.path)}
          supporting={entry.mime === DIR ? undefined : `${formatSize(entry.size)} · ${formatDate(entry.mtime, { day: "numeric", month: "short", year: "numeric" }, lang)}`}
          onClick={() => open(entry)}
          onLongPress={() => !picking && setSelected(current => [...new Set([...current, entry.path])])}
        />
      ))}
      <div className="h-24" />
      <input ref={upload} type="file" multiple hidden onChange={event => void onUpload(event.target)} />
      <Dialog
        open={!!dialog}
        onClose={() => setDialog(null)}
        title={dialog && { delete: t("deleteConfirm"), folder: t("newFolder"), rename: t("rename") }[dialog.kind]}
        actions={
          <>
            <Button variant="text" onClick={() => setDialog(null)}>{t("cancel")}</Button>
            <Button variant="text" onClick={() => void confirm()}>{t(dialog?.kind === "delete" ? "delete" : "ok")}</Button>
          </>
        }
      >
        {dialog?.kind === "delete" ? selected.map(basename).join(", ") : <TextField label={t("name")} value={dialog?.value ?? ""} autoFocus onChange={value => dialog && setDialog({ ...dialog, value })} onEnter={() => void confirm()} />}
      </Dialog>
    </Scaffold>
  );
}

export default {
  id: "files",
  name: S.name,
  icon: "folder",
  tint: { hue: 180 },
  description: S.description,
  permissions: ["storage"],
  handles: [{ action: "GET_CONTENT", type: "*/*" }],
  Component: Files,
} satisfies AppDef;
