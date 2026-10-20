import { useEffect, useMemo, useRef, useState } from "react";
import { appStore, COMMON, fileUrl, formatNumber, useLang, useT, type AppDef, type AppProps, type Contact, type Os } from "../kernel";
import { Avatar, Button, Dialog, EmptyState, Fab, IconButton, ListItem, Scaffold, SearchField, Subheader, TextField } from "../ui";

const S = {
  ...COMMON,
  name: ["Rehber", "Contacts"],
  description: ["Kişileriniz, favorileriniz ve fotoğrafları", "Your contacts, favourites and their photos"],
  newContact: ["Kişi oluştur", "Create contact"],
  editContact: ["Kişiyi düzenle", "Edit contact"],
  firstLast: ["Ad soyad", "Name"],
  phone: ["Telefon", "Phone"],
  email: ["E-posta", "Email"],
  photo: ["Fotoğraf ekle", "Add photo"],
  favorites: ["Favoriler", "Favourites"],
  favorite: ["Favori", "Favourite"],
  call: ["Ara", "Call"],
  message: ["Mesaj", "Message"],
  searchContacts: ["Kişilerde ara", "Search contacts"],
  noContacts: ["Kişi yok", "No contacts"],
  noContactsHint: ["Başka bir cihazın numarasını ekleyip onu arayabilirsiniz", "Add another device's number to call or message it"],
  pick: ["Kişi seçin", "Choose a contact"],
  invalid: ["Ad ve numara gerekli", "Name and number are required"],
} as const;

/** Also exposed to other apps as the "contacts" content provider. */
const useContacts = appStore("contacts", { contacts: [] as Contact[] });

function Editor({ contact, os }: { contact: Contact; os: Os }) {
  const t = useT(S);
  const [draft, setDraft] = useState(contact);
  const [error, setError] = useState(false);
  const existing = useContacts.getState().contacts.some(item => item.id === contact.id);
  const choosePhoto = async () => {
    const result = await os.startActivity({ action: "GET_CONTENT", type: "image/*" });
    if (result?.path) setDraft({ ...draft, photo: String(result.path) });
  };
  const save = () => {
    if (!draft.name.trim() || !draft.number.replace(/\D/g, "")) return setError(true);
    const clean = { ...draft, name: draft.name.trim(), number: draft.number.replace(/[^\d+]/g, "") };
    useContacts.setState(({ contacts }) => ({ contacts: [...contacts.filter(item => item.id !== clean.id), clean] }));
    os.replace(`contact/${clean.id}`);
  };
  return (
    <Scaffold title={t(existing ? "editContact" : "newContact")} onBack={os.back} actions={<Button className="mr-2" onClick={save}>{t("save")}</Button>}>
      <div className="flex flex-col gap-4 p-4">
        <button type="button" aria-label={t("photo")} onClick={() => void choosePhoto()} className="mx-auto">
          <Avatar name={draft.name} src={draft.photo && fileUrl(draft.photo)} size={112} icon="add_a_photo" />
        </button>
        <TextField label={t("firstLast")} value={draft.name} autoFocus onChange={name => setDraft({ ...draft, name })} error={error && !draft.name.trim() ? t("invalid") : undefined} />
        <TextField label={t("phone")} type="tel" inputMode="tel" value={draft.number} onChange={number => setDraft({ ...draft, number })} error={error && !draft.number.trim() ? t("invalid") : undefined} />
        <TextField label={t("email")} type="email" value={draft.email ?? ""} onChange={email => setDraft({ ...draft, email })} />
      </div>
    </Scaffold>
  );
}

function Details({ contact, os }: { contact: Contact; os: Os }) {
  const t = useT(S);
  const [confirm, setConfirm] = useState(false);
  const update = (patch: Partial<Contact>) => useContacts.setState(({ contacts }) => ({ contacts: contacts.map(item => (item.id === contact.id ? { ...item, ...patch } : item)) }));
  const remove = () => {
    useContacts.setState(({ contacts }) => ({ contacts: contacts.filter(item => item.id !== contact.id) }));
    os.back();
  };
  const tel = `tel:${contact.number}`;
  const share = [contact.name, formatNumber(contact.number), contact.email].filter(Boolean).join("\n");
  return (
    <Scaffold
      title=""
      onBack={os.back}
      actions={
        <>
          <IconButton icon="star" selected={contact.starred} label={t("favorite")} onClick={() => update({ starred: !contact.starred })} />
          <IconButton icon="edit" label={t("edit")} onClick={() => os.push(`edit/${contact.id}`)} />
          <IconButton icon="share" label={t("share")} onClick={() => os.share({ type: "text/plain", text: share })} />
          <IconButton icon="delete" label={t("delete")} onClick={() => setConfirm(true)} />
        </>
      }
    >
      <div className="flex flex-col items-center gap-3 py-6">
        <Avatar name={contact.name} src={contact.photo && fileUrl(contact.photo)} size={120} />
        <h1 className="text-headline">{contact.name}</h1>
        <div className="flex gap-6 pt-2">
          <IconButton icon="call" label={t("call")} variant="tonal" size={56} onClick={() => void os.startActivity({ action: "CALL", data: tel })} />
          <IconButton icon="chat" label={t("message")} variant="tonal" size={56} onClick={() => void os.startActivity({ action: "SENDTO", data: `sms:${contact.number}` })} />
        </div>
      </div>
      <div className="mx-4 rounded-3xl bg-surface-container py-2">
        <ListItem icon="call" headline={formatNumber(contact.number)} supporting={t("phone")} onClick={() => void os.startActivity({ action: "DIAL", data: tel })} />
        {contact.email && <ListItem icon="mail" headline={contact.email} supporting={t("email")} />}
      </div>
      <Dialog open={confirm} onClose={() => setConfirm(false)} title={t("deleteConfirm")} actions={<><Button variant="text" onClick={() => setConfirm(false)}>{t("cancel")}</Button><Button variant="text" onClick={remove}>{t("delete")}</Button></>}>
        {contact.name}
      </Dialog>
    </Scaffold>
  );
}

function Contacts({ intent, route, os }: AppProps) {
  const t = useT(S);
  const lang = useLang();
  const contacts = useContacts(state => state.contacts);
  const [query, setQuery] = useState("");
  const sections = useRef<Record<string, HTMLDivElement | null>>({});
  const picking = intent.action === "PICK";

  // "Add to contacts" from the dialer arrives as INSERT with the number prefilled.
  useEffect(() => {
    if (intent.action === "INSERT") os.replace(`edit/${crypto.randomUUID()}`);
  }, [intent, os]);
  const sorted = useMemo(() => contacts.toSorted((a, b) => a.name.localeCompare(b.name, lang)), [contacts, lang]);
  const id = route.split("/")[1];
  if (route.startsWith("edit/")) return <Editor key={id} contact={contacts.find(item => item.id === id) ?? { id, name: "", number: String(intent.extras?.number ?? "") }} os={os} />;
  const current = route.startsWith("contact/") ? contacts.find(item => item.id === id) : undefined;
  if (current) return <Details contact={current} os={os} />;

  const needle = query.toLocaleLowerCase(lang).trim();
  const matches = sorted.filter(item => item.name.toLocaleLowerCase(lang).includes(needle) || item.number.includes(needle.replace(/\D/g, "") || "\u0000"));
  const letterOf = (contact: Contact) => contact.name[0]?.toLocaleUpperCase(lang) ?? "#";
  const groups = [...Map.groupBy(matches, letterOf)];
  const open = (contact: Contact) => (picking ? os.finish({ id: contact.id, name: contact.name, number: contact.number }) : os.push(`contact/${contact.id}`));
  const row = (contact: Contact) => (
    <ListItem key={contact.id} leading={<Avatar name={contact.name} src={contact.photo && fileUrl(contact.photo)} />} headline={contact.name} supporting={formatNumber(contact.number)} onClick={() => open(contact)} />
  );
  const starred = matches.filter(item => item.starred);

  return (
    <Scaffold
      title={picking ? t("pick") : t("name")}
      onBack={picking ? os.back : undefined}
      fab={!picking && <Fab icon="person_add" label={t("newContact")} onClick={() => os.push(`edit/${crypto.randomUUID()}`)} />}
    >
      <div className="px-4 pb-2"><SearchField value={query} onChange={setQuery} placeholder={t("searchContacts")} /></div>
      {contacts.length === 0 && <EmptyState icon="contacts" title={t("noContacts")} text={t("noContactsHint")} />}
      {starred.length > 0 && !needle && <Subheader>{t("favorites")}</Subheader>}
      {!needle && starred.map(row)}
      <div className="flex">
        <div className="min-w-0 flex-1 pb-24">
          {groups.map(([letter, items]) => (
            <div key={letter} ref={element => {
              sections.current[letter] = element;
            }}>
              <Subheader>{letter}</Subheader>
              {items.map(row)}
            </div>
          ))}
        </div>
        {/* Letter index: tap a letter to jump to its section. */}
        <nav className="sticky top-0 flex h-fit flex-col py-2 pr-1">
          {groups.map(([letter]) => (
            <button key={letter} type="button" onClick={() => sections.current[letter]?.scrollIntoView({ behavior: "smooth" })} className="px-1.5 text-label-sm text-primary">
              {letter}
            </button>
          ))}
        </nav>
      </div>
    </Scaffold>
  );
}

export default {
  id: "contacts",
  name: S.name,
  icon: "contacts",
  tint: { hue: 290 },
  description: S.description,
  system: true,
  handles: [{ action: "PICK", type: "vnd.android.cursor.item/contact" }, { action: "INSERT", type: "vnd.android.cursor.item/contact" }],
  Component: Contacts,
  providers: { contacts: useContacts },
} satisfies AppDef;
