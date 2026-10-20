import { useEffect, useState } from "react";
import { appStore, COMMON, formatDate, pick, useLang, useT, type AppDef, type AppProps, type Text } from "../kernel";
import { Checkbox, EmptyState, Fab, Icon, IconButton, Menu, Scaffold, SearchField } from "../ui";

const S = {
  ...COMMON,
  name: ["Notlar", "Notes"],
  description: ["Not ve yapılacaklar listeleri, sabitleme ve renkler", "Notes and checklists with pins and colours"],
  newNote: ["Yeni not", "New note"],
  newList: ["Yeni liste", "New list"],
  title: ["Başlık", "Title"],
  note: ["Not", "Note"],
  item: ["Liste öğesi", "List item"],
  addItem: ["Öğe ekle", "Add item"],
  pinned: ["Sabitlenenler", "Pinned"],
  others: ["Diğerleri", "Others"],
  pin: ["Sabitle", "Pin"],
  unpin: ["Sabitlemeyi kaldır", "Unpin"],
  color: ["Renk", "Colour"],
  noNotes: ["Notlarınız burada görünür", "Notes you add appear here"],
  searchNotes: ["Notlarda ara", "Search your notes"],
  edited: ["Düzenlendi: {date}", "Edited {date}"],
  toList: ["Listeye dönüştür", "Convert to list"],
  welcomeTitle: ["WebDroid'e hoş geldiniz 👋", "Welcome to WebDroid 👋"],
} as const;

interface Note {
  id: string;
  title: string;
  body: string;
  items?: { id: string; text: string; done: boolean }[];
  color: number;
  pinned: boolean;
  updated: number;
}

/** Note colours are M3 container roles, so they follow the wallpaper palette and dark theme. */
const COLORS = ["bg-surface-container", "bg-primary-container text-on-primary-container", "bg-secondary-container text-on-secondary-container", "bg-tertiary-container text-on-tertiary-container", "bg-error-container text-on-error-container"];

const useNotes = appStore("notes", { notes: [] as Note[], welcomed: false });

const WELCOME: Text[] = [
  ["Bildirimler ve hızlı ayarlar için üstten aşağı kaydırın", "Swipe down from the top for notifications and quick settings"],
  ["Tüm uygulamalar için ana ekranda yukarı kaydırın", "Swipe up on the home screen for all apps"],
  ["Son uygulamalar için alttaki çubuğu yukarı kaydırıp bekleyin", "Swipe up from the bottom bar and hold for recent apps"],
  ["Geri gitmek için ekranın kenarından içeri kaydırın", "Swipe in from either edge to go back"],
  ["Simgeyi basılı tutup sürükleyin; başka simgeye bırakınca klasör olur", "Long-press and drag icons; drop one on another to make a folder"],
  ["\"Yeni cihaz aç\" ile ikinci bir telefonu arayın veya mesaj atın", "Use \"Open a new device\" to call or message a second phone"],
];

const update = (id: string, patch: Partial<Note>) =>
  useNotes.setState(({ notes }) => ({ notes: notes.map(note => (note.id === id ? { ...note, ...patch, updated: Date.now() } : note)) }));

function create(patch: Partial<Note> = {}): string {
  const note: Note = { id: crypto.randomUUID(), title: "", body: "", color: 0, pinned: false, updated: Date.now(), ...patch };
  useNotes.setState(({ notes }) => ({ notes: [note, ...notes] }));
  return note.id;
}

const newItem = (text = "") => ({ id: crypto.randomUUID(), text, done: false });

function Editor({ note, os }: { note: Note; os: AppProps["os"] }) {
  const t = useT(S);
  const lang = useLang();
  const [menu, setMenu] = useState(false);
  const items = note.items;
  const setItems = (next: NonNullable<Note["items"]>) => update(note.id, { items: next });
  // Leaving an untouched note behind would litter the list, so empty notes are dropped on exit.
  useEffect(
    () => () => {
      const latest = useNotes.getState().notes.find(item => item.id === note.id);
      if (latest && !latest.title.trim() && !latest.body.trim() && !latest.items?.some(entry => entry.text.trim())) {
        useNotes.setState(({ notes }) => ({ notes: notes.filter(item => item.id !== note.id) }));
      }
    },
    [note.id],
  );
  const remove = () => {
    useNotes.setState(({ notes }) => ({ notes: notes.filter(item => item.id !== note.id) }));
    os.back();
  };
  const text = [note.title, note.body, ...(items ?? []).map(item => `${item.done ? "☑" : "☐"} ${item.text}`)].filter(Boolean).join("\n");
  return (
    <Scaffold
      title=""
      onBack={os.back}
      className={COLORS[note.color]}
      actions={
        <>
          <IconButton icon="push_pin" selected={note.pinned} label={t(note.pinned ? "unpin" : "pin")} onClick={() => update(note.id, { pinned: !note.pinned })} />
          <IconButton icon="share" label={t("share")} onClick={() => os.share({ type: "text/plain", text })} />
          <IconButton icon="more_vert" label={t("more")} onClick={() => setMenu(true)} />
          <Menu
            open={menu}
            onClose={() => setMenu(false)}
            items={[
              ...(items ? [] : [{ label: t("toList"), icon: "checklist", onClick: () => update(note.id, { items: note.body.split("\n").filter(Boolean).map(line => newItem(line)), body: "" }) }]),
              { label: t("delete"), icon: "delete", onClick: remove },
            ]}
          />
        </>
      }
    >
      <div className="flex min-h-full flex-col gap-2 px-5 pb-6">
        <input value={note.title} aria-label={t("title")} placeholder={t("title")} onChange={event => update(note.id, { title: event.target.value })} className="bg-transparent text-headline-sm outline-none placeholder:opacity-50" />
        {items ? (
          <>
            {items.map(item => (
              <div key={item.id} className="flex items-center gap-1">
                <Checkbox checked={item.done} label={item.text} onChange={done => setItems(items.map(entry => (entry.id === item.id ? { ...entry, done } : entry)))} />
                <input
                  value={item.text}
                  aria-label={t("item")}
                  onChange={event => setItems(items.map(entry => (entry.id === item.id ? { ...entry, text: event.target.value } : entry)))}
                  onKeyDown={event => event.key === "Enter" && setItems([...items, newItem()])}
                  className={`min-w-0 flex-1 bg-transparent text-body-lg outline-none ${item.done ? "line-through opacity-60" : ""}`}
                />
                <IconButton icon="close" label={t("delete")} onClick={() => setItems(items.filter(entry => entry.id !== item.id))} />
              </div>
            ))}
            <button type="button" onClick={() => setItems([...items, newItem()])} className="ripple flex h-10 items-center gap-3 rounded-full px-2 text-body-lg opacity-70">
              <Icon name="add" />
              {t("addItem")}
            </button>
          </>
        ) : (
          <textarea value={note.body} aria-label={t("note")} placeholder={t("note")} onChange={event => update(note.id, { body: event.target.value })} className="min-h-64 flex-1 resize-none bg-transparent text-body-lg outline-none placeholder:opacity-50" />
        )}
        <div className="mt-auto flex items-center gap-2 pt-4" role="radiogroup" aria-label={t("color")}>
          {COLORS.map((color, index) => (
            <button key={color} type="button" role="radio" aria-checked={note.color === index} aria-label={`${t("color")} ${index + 1}`} onClick={() => update(note.id, { color: index })} className={`size-8 rounded-full border border-outline ${color} ${note.color === index ? "ring-2 ring-primary ring-offset-2" : ""}`} />
          ))}
          <span className="ml-auto text-label-sm opacity-70">{t("edited", { date: formatDate(note.updated, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }, lang) })}</span>
        </div>
      </div>
    </Scaffold>
  );
}

function NoteCard({ note, onOpen }: { note: Note; onOpen: () => void }) {
  const t = useT(S);
  return (
    <button type="button" onClick={onOpen} className={`ripple mb-3 flex w-full break-inside-avoid flex-col gap-1 rounded-3xl border border-outline-variant p-4 text-left ${COLORS[note.color]}`}>
      {note.title && <span className="text-title">{note.title}</span>}
      {note.body && <span className="line-clamp-6 text-body whitespace-pre-line opacity-80">{note.body}</span>}
      {note.items?.slice(0, 6).map(item => (
        <span key={item.id} className={`truncate text-body ${item.done ? "line-through opacity-60" : ""}`}>{`${item.done ? "☑" : "☐"} ${item.text}`}</span>
      ))}
      {!note.title && !note.body && !note.items?.length && <span className="text-body opacity-60">{t("untitled")}</span>}
    </button>
  );
}

function Notes({ intent, route, os }: AppProps) {
  const t = useT(S);
  const notes = useNotes(state => state.notes);
  const [query, setQuery] = useState("");
  const open = (id: string) => os.push(`note/${id}`);

  // "Share → Notes" from another app lands here as a SEND intent.
  useEffect(() => {
    if (intent.action === "SEND" && (intent.extras?.text || intent.data)) os.replace(`note/${create({ body: String(intent.extras?.text ?? intent.data) })}`);
  }, [intent, os]);

  const current = notes.find(note => `note/${note.id}` === route);
  if (current) return <Editor key={current.id} note={current} os={os} />;

  const needle = query.toLocaleLowerCase();
  const matches = notes
    .filter(note => [note.title, note.body, ...(note.items ?? []).map(item => item.text)].join(" ").toLocaleLowerCase().includes(needle))
    .sort((a, b) => b.updated - a.updated);
  const section = (title: string, list: Note[]) =>
    list.length > 0 && (
      <section>
        <h2 className="px-1 pb-2 text-label-sm text-on-surface-variant">{title}</h2>
        <div className="columns-2 gap-3">
          {list.map(note => (
            <NoteCard key={note.id} note={note} onOpen={() => open(note.id)} />
          ))}
        </div>
      </section>
    );
  return (
    <Scaffold
      fab={
        <div className="flex flex-col items-end gap-3">
          <Fab icon="checklist" label={t("newList")} className="h-12 w-12 bg-secondary-container text-on-secondary-container" onClick={() => open(create({ items: [newItem()] }))} />
          <Fab icon="edit" label={t("newNote")} extended onClick={() => open(create())} />
        </div>
      }
    >
      <div className="flex flex-col gap-4 px-3 pt-3 pb-40">
        <SearchField value={query} onChange={setQuery} placeholder={t("searchNotes")} />
        {notes.length === 0 && <EmptyState icon="lightbulb" title={t("noNotes")} />}
        {section(t("pinned"), matches.filter(note => note.pinned))}
        {section(t("others"), matches.filter(note => !note.pinned))}
      </div>
    </Scaffold>
  );
}

export default {
  id: "notes",
  name: S.name,
  icon: "sticky_note_2",
  tint: { hue: 90 },
  description: S.description,
  handles: [{ action: "SEND", type: "text/*" }],
  Component: Notes,
  receivers: {
    // A first-boot tips checklist, like the welcome note phones ship with.
    BOOT_COMPLETED() {
      if (useNotes.getState().welcomed) return;
      useNotes.setState({ welcomed: true });
      create({ title: pick(S.welcomeTitle), color: 1, pinned: true, items: WELCOME.map(tip => newItem(pick(tip))) });
    },
  },
} satisfies AppDef;
