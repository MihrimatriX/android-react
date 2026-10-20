import { useEffect, useState } from "react";
import {
  answer, callerName, COMMON, decline, pick, dial, fileUrl, formatDate, formatDuration, formatNumber, hangup, toggleHold, toggleMute, toggleSpeaker,
  useCall, useCallLog, useLang, useNow, usePhone, useProvider, useT, type AppDef, type AppProps, type Os,
} from "../kernel";
import { Avatar, BottomNav, EmptyState, Fab, Icon, IconButton, ListItem, Scaffold } from "../ui";

const S = {
  ...COMMON,
  name: ["Telefon", "Phone"],
  description: ["Diğer WebDroid cihazlarını sesli arayın", "Voice-call other WebDroid devices"],
  favorites: ["Favoriler", "Favourites"],
  recents: ["Son aramalar", "Recents"],
  contacts: ["Kişiler", "Contacts"],
  keypad: ["Tuş takımı", "Keypad"],
  call: ["Ara", "Call"],
  yourNumber: ["Numaranız: {number}", "Your number: {number}"],
  noFavorites: ["Favori yok", "No favourites"],
  noRecents: ["Arama geçmişi boş", "Your call history is empty"],
  noContacts: ["Kişi yok", "No contacts"],
  addContact: ["Kişilere ekle", "Add to contacts"],
  clearLog: ["Geçmişi temizle", "Clear history"],
  incoming: ["Gelen", "Incoming"],
  outgoing: ["Giden", "Outgoing"],
  missed: ["Cevapsız", "Missed"],
  dialing: ["Aranıyor…", "Calling…"],
  ringing: ["Çalıyor…", "Ringing…"],
  incomingCall: ["Gelen arama", "Incoming call"],
  onHold: ["Beklemede", "On hold"],
  remoteHold: ["Karşı taraf sizi beklemeye aldı", "The other side put you on hold"],
  mute: ["Sessiz", "Mute"],
  speaker: ["Hoparlör", "Speaker"],
  hold: ["Beklet", "Hold"],
  answer: ["Cevapla", "Answer"],
  decline: ["Reddet", "Decline"],
  hangUp: ["Kapat", "End call"],
  ongoing: ["Devam eden arama", "Ongoing call"],
  busy: ["Hat meşgul", "Line busy"],
  unreachable: ["Numaraya ulaşılamıyor", "Number unreachable"],
  declined: ["Arama reddedildi", "Call declined"],
  noAnswer: ["Cevap yok", "No answer"],
  ended: ["Arama sona erdi", "Call ended"],
  needMic: ["Arama için mikrofon izni gerekiyor", "Microphone permission is needed to call"],
  callsChannel: ["Devam eden aramalar", "Ongoing calls"],
  missedChannel: ["Cevapsız aramalar", "Missed calls"],
} as const;

const KEYS = [["1", ""], ["2", "ABC"], ["3", "DEF"], ["4", "GHI"], ["5", "JKL"], ["6", "MNO"], ["7", "PQRS"], ["8", "TUV"], ["9", "WXYZ"], ["*", ""], ["0", "+"], ["#", ""]];
const numberFrom = (data?: string) => decodeURIComponent(data?.replace(/^tel:/, "") ?? "");

async function placeCall(os: Os, number: string): Promise<void> {
  if (!number.replace(/\D/g, "")) return;
  try {
    const stream = await os.media({ audio: true });
    os.push("call");
    await dial(number, stream);
  } catch {
    os.toast(pick(S.needMic));
  }
}

function InCall({ os, autoAnswer }: { os: Os; autoAnswer: boolean }) {
  const t = useT(S);
  const call = useCall();
  const now = useNow("second");
  useEffect(() => {
    if (!autoAnswer || call.status !== "incoming") return;
    os.media({ audio: true }).then(answer).catch(() => decline());
  }, [autoAnswer]);
  useEffect(() => {
    if (call.status !== "idle") return;
    const timer = setTimeout(os.back, 300);
    return () => clearTimeout(timer);
  }, [call.status]);
  const statusText = () => {
    if (call.status === "ended") return t(call.reason === "missed" || !call.reason ? "ended" : call.reason);
    if (call.status === "active") return call.held ? t("onHold") : formatDuration(now - call.startedAt);
    if (call.status === "incoming") return t("incomingCall");
    return t(call.status === "ringing" ? "ringing" : "dialing");
  };
  const control = (icon: string, label: string, selected: boolean, onClick: () => void) => (
    <div className="flex flex-col items-center gap-2 text-label-sm">
      <IconButton icon={icon} label={label} selected={selected} variant="tonal" size={64} disabled={call.status !== "active"} onClick={onClick} />
      {label}
    </div>
  );
  return (
    <Scaffold className="bg-surface-container">
      <div className="flex h-full flex-col items-center px-8 pt-16 pb-10">
        <p className="text-body text-on-surface-variant">{statusText()}</p>
        <h1 className="mt-3 text-center text-headline-lg">{callerName(call.number)}</h1>
        <p className="text-title text-on-surface-variant">{formatNumber(call.number)}</p>
        {call.remoteHeld && <p className="mt-2 text-body text-tertiary">{t("remoteHold")}</p>}
        <div className="mt-10"><Avatar name={callerName(call.number)} size={120} /></div>
        {call.status === "incoming" ? (
          <div className="mt-auto flex w-full justify-around">
            <IconButton icon="call_end" label={t("decline")} size={72} className="bg-red-600 text-white" onClick={decline} />
            <IconButton icon="call" label={t("answer")} size={72} className="bg-green-600 text-white" onClick={() => void os.media({ audio: true }).then(answer).catch(decline)} />
          </div>
        ) : (
          <>
            <div className="mt-auto grid grid-cols-3 gap-6">
              {control(call.muted ? "mic_off" : "mic", t("mute"), call.muted, toggleMute)}
              {control("volume_up", t("speaker"), call.speaker, toggleSpeaker)}
              {control("pause", t("hold"), call.held, toggleHold)}
            </div>
            <IconButton icon="call_end" label={t("hangUp")} size={72} className="mt-8 bg-red-600 text-white" disabled={call.status === "ended"} onClick={hangup} />
          </>
        )}
      </div>
    </Scaffold>
  );
}

function Dialpad({ os, initial }: { os: Os; initial: string }) {
  const t = useT(S);
  const own = usePhone(state => state.number);
  const [number, setNumber] = useState(initial);
  const press = (key: string) => {
    os.sound("click");
    setNumber(current => current + key);
  };
  return (
    <Scaffold title={t("keypad")} onBack={os.back}>
      <div className="flex h-full flex-col items-center justify-end gap-4 pb-6">
        <p className="text-body text-on-surface-variant">{t("yourNumber", { number: formatNumber(own) })}</p>
        <p aria-live="polite" className="h-12 text-headline-lg tabular-nums">{formatNumber(number)}</p>
        {number && <button type="button" className="ripple rounded-full px-4 py-1 text-label text-primary" onClick={() => void os.startActivity({ action: "INSERT", type: "vnd.android.cursor.item/contact", extras: { number } })}>{t("addContact")}</button>}
        <div className="grid grid-cols-3 gap-x-6 gap-y-3">
          {KEYS.map(([digit, letters]) => (
            <button key={digit} type="button" aria-label={digit} onClick={() => press(digit)} className="ripple flex size-18 flex-col items-center justify-center rounded-full bg-surface-high">
              <span className="text-headline-sm">{digit}</span>
              <span className="h-3 text-[0.625rem] text-on-surface-variant">{letters}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-8">
          <span className="size-12" />
          <IconButton icon="call" label={t("call")} size={64} className="bg-green-600 text-white" onClick={() => void placeCall(os, number)} />
          <IconButton icon="backspace" label={t("delete")} size={48} disabled={!number} onClick={() => setNumber(number.slice(0, -1))} />
        </div>
      </div>
    </Scaffold>
  );
}

function Phone({ intent, route, os }: AppProps) {
  const t = useT(S);
  const lang = useLang();
  const contacts = useProvider("contacts", state => state.contacts);
  const calls = useCallLog(state => state.calls);
  const status = useCall(state => state.status);
  const [tab, setTab] = useState<"favorites" | "recents" | "contacts">("recents");

  // tel: intents from Contacts/Browser: DIAL opens the keypad, CALL rings straight away.
  useEffect(() => {
    if (intent.action === "DIAL") os.replace("dial");
    if (intent.action === "CALL") void placeCall(os, numberFrom(intent.data));
    if (intent.action === "IN_CALL") os.replace("call");
  }, [intent, os]);

  if (route === "call" || (intent.action === "IN_CALL" && status !== "idle")) return <InCall os={os} autoAnswer={!!intent.extras?.answer} />;
  if (route === "dial") return <Dialpad os={os} initial={numberFrom(intent.data)} />;

  const call = (number: string) => void placeCall(os, number);
  const photo = (number: string) => contacts.find(contact => contact.number.replace(/\D/g, "") === number.replace(/\D/g, ""))?.photo;
  const directionIcon = { in: "call_received", out: "call_made", missed: "call_missed" } as const;
  const directionLabel = { in: "incoming", out: "outgoing", missed: "missed" } as const;
  const lists = {
    favorites: contacts.filter(contact => contact.starred).map(contact => (
      <ListItem key={contact.id} leading={<Avatar name={contact.name} src={contact.photo && fileUrl(contact.photo)} />} headline={contact.name} supporting={formatNumber(contact.number)} trailing={<IconButton icon="call" label={t("call")} onClick={() => call(contact.number)} />} onClick={() => call(contact.number)} />
    )),
    recents: calls.map(entry => (
      <ListItem
        key={entry.id}
        leading={<Avatar name={callerName(entry.number)} src={photo(entry.number) && fileUrl(photo(entry.number) ?? "")} />}
        headline={<span className={entry.direction === "missed" ? "text-error" : ""}>{callerName(entry.number)}</span>}
        supporting={<span className="flex items-center gap-1"><Icon name={directionIcon[entry.direction]} size={16} />{`${t(directionLabel[entry.direction])} · ${formatDate(entry.time, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }, lang)}${entry.duration ? ` · ${formatDuration(entry.duration)}` : ""}`}</span>}
        trailing={<IconButton icon="call" label={t("call")} onClick={() => call(entry.number)} />}
        onClick={() => call(entry.number)}
      />
    )),
    contacts: contacts.toSorted((a, b) => a.name.localeCompare(b.name, lang)).map(contact => (
      <ListItem key={contact.id} leading={<Avatar name={contact.name} src={contact.photo && fileUrl(contact.photo)} />} headline={contact.name} supporting={formatNumber(contact.number)} onClick={() => call(contact.number)} />
    )),
  };
  const empty = { favorites: t("noFavorites"), recents: t("noRecents"), contacts: t("noContacts") };
  return (
    <Scaffold
      title={t(tab)}
      actions={tab === "recents" && calls.length > 0 && <IconButton icon="delete_sweep" label={t("clearLog")} onClick={() => useCallLog.setState({ calls: [] })} />}
      fab={<Fab icon="dialpad" label={t("keypad")} onClick={() => os.push("dial")} />}
      bottom={<BottomNav items={[{ value: "favorites", icon: "star", label: t("favorites") }, { value: "recents", icon: "schedule", label: t("recents") }, { value: "contacts", icon: "contacts", label: t("contacts") }]} value={tab} onChange={setTab} />}
    >
      {status !== "idle" && <ListItem icon="call" headline={callerName(useCall.getState().number)} supporting={t("ongoing")} onClick={() => os.push("call")} />}
      {lists[tab].length ? lists[tab] : <EmptyState icon={{ favorites: "star", recents: "history", contacts: "contacts" }[tab]} title={empty[tab]} />}
    </Scaffold>
  );
}

export default {
  id: "phone",
  name: S.name,
  icon: "call",
  tint: { hue: 150 },
  description: S.description,
  system: true,
  permissions: ["microphone", "notifications"],
  channels: { calls: { name: S.callsChannel, importance: "default" }, missed: { name: S.missedChannel, importance: "high" } },
  handles: [{ action: "DIAL", scheme: "tel" }, { action: "CALL", scheme: "tel" }],
  Component: Phone,
  receivers: { DECLINE: () => decline(), HANGUP: () => hangup() },
} satisfies AppDef;
