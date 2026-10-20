import { useEffect, useRef, useState } from "react";
import { appStore, callerName, COMMON, fileUrl, formatNumber, formatTime, isOnline, pick, useForeground, useLang, usePhone, useProvider, useT, type AppDef, type AppProps, type Os } from "../kernel";
import { Avatar, Button, EmptyState, Fab, Icon, IconButton, ListItem, Scaffold, TextField } from "../ui";

const S = {
  ...COMMON,
  name: ["Mesajlar", "Messages"],
  description: ["Diğer WebDroid cihazlarıyla mesajlaşın", "Message other WebDroid devices"],
  startChat: ["Sohbet başlat", "Start chat"],
  to: ["Alıcı numarası", "Recipient number"],
  pickContact: ["Kişilerden seç", "Choose from contacts"],
  noChats: ["Henüz sohbet yok", "No conversations yet"],
  noChatsHint: ["Başka bir cihazın numarasına mesaj gönderin", "Send a message to another device's number"],
  typeMessage: ["Mesaj yazın", "Text message"],
  send: ["Gönder", "Send"],
  you: ["Siz: {text}", "You: {text}"],
  reply: ["Yanıtla", "Reply"], markRead: ["Okundu olarak işaretle", "Mark as read"],
  call: ["Ara", "Call"],
  pending: ["Bekliyor", "Waiting"],
  sent: ["Gönderildi", "Sent"],
  delivered: ["İletildi", "Delivered"],
  read: ["Okundu", "Read"],
  failed: ["Gönderilemedi · tekrar denemek için dokunun", "Not sent · tap to retry"],
  channel: ["Gelen mesajlar", "Incoming messages"],
} as const;

type Status = "pending" | "sent" | "delivered" | "read" | "failed";
type Message = { id: string; mine: boolean; text: string; time: number; status: Status };

const useMessages = appStore("messages", { threads: {} as Record<string, Message[]>, unread: {} as Record<string, number> });
const RANK: Record<Status, number> = { failed: 0, pending: 1, sent: 2, delivered: 3, read: 4 };
const digits = (number: string) => number.replace(/\D/g, "");
/** The conversation currently on screen gets read receipts instead of notifications. */
let viewing: string | null = null;
let context: Os | undefined;

function append(number: string, message: Message): void {
  useMessages.setState(({ threads }) => ({ threads: { ...threads, [number]: [...(threads[number] ?? []), message] } }));
}

// Receipts can arrive out of order, so a status only ever moves forward (except retries).
function setStatus(number: string, ids: string[], status: Status): void {
  useMessages.setState(({ threads }) => ({
    threads: { ...threads, [number]: (threads[number] ?? []).map(item => (ids.includes(item.id) && (RANK[status] > RANK[item.status] || status === "failed") ? { ...item, status } : item)) },
  }));
}

async function deliver(os: Os, number: string, message: Message): Promise<void> {
  const ok = await os.send(number, { action: "SMS", extras: { id: message.id, text: message.text } }, true);
  if (ok) setStatus(number, [message.id], "sent");
  else setStatus(number, [message.id], isOnline() ? "failed" : "pending");
}

function sendText(os: Os, number: string, text: string): void {
  const message: Message = { id: crypto.randomUUID(), mine: true, text, time: Date.now(), status: "pending" };
  append(number, message);
  void deliver(os, number, message);
}

function markRead(os: Os, number: string): void {
  const thread = useMessages.getState().threads[number] ?? [];
  const ids = thread.filter(item => !item.mine && item.status !== "read").map(item => item.id);
  if (ids.length) {
    setStatus(number, ids, "read");
    void os.send(number, { action: "SMS_READ", extras: { ids: ids.join(",") } });
  }
  useMessages.setState(({ unread }) => ({ unread: { ...unread, [number]: 0 } }));
  os.cancel(`sms-${number}`);
}

// Messages written in airplane mode go out as soon as the device is reachable again.
usePhone.subscribe((state, previous) => {
  if (!state.connected || previous.connected || !context) return;
  for (const [number, thread] of Object.entries(useMessages.getState().threads)) {
    for (const message of thread.filter(item => item.mine && item.status === "pending")) void deliver(context, number, message);
  }
});

function Thread({ number, os }: { number: string; os: Os }) {
  const t = useT(S);
  const lang = useLang();
  const foreground = useForeground();
  const thread = useMessages(state => state.threads[number]) ?? [];
  const contacts = useProvider("contacts", state => state.contacts);
  const [draft, setDraft] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const photo = contacts.find(contact => digits(contact.number) === number)?.photo;

  useEffect(() => {
    viewing = foreground ? number : null;
    if (foreground) markRead(os, number);
    return () => {
      viewing = null;
    };
  }, [foreground, number, thread.length, os]);
  // Block body on purpose: scrollIntoView returns a Promise in newer browsers, which React would treat as a cleanup.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [thread.length]);

  const send = () => {
    if (!draft.trim()) return;
    sendText(os, number, draft.trim());
    setDraft("");
  };
  const lastMine = thread.findLast(item => item.mine);
  return (
    <Scaffold
      title={<span className="flex items-center gap-3"><Avatar name={callerName(number)} src={photo && fileUrl(photo)} size={32} />{callerName(number)}</span>}
      onBack={os.back}
      actions={<IconButton icon="call" label={t("call")} onClick={() => void os.startActivity({ action: "CALL", data: `tel:${number}` })} />}
    >
      <div className="flex min-h-full flex-col justify-end">
        <div className="flex flex-col gap-1 px-3 py-2">
          {thread.map(message => (
            <div key={message.id} className={`flex flex-col ${message.mine ? "items-end" : "items-start"}`}>
              <button
                type="button"
                disabled={message.status !== "failed"}
                onClick={() => void deliver(os, number, message)}
                className={`max-w-[80%] rounded-3xl px-4 py-2 text-left text-body-lg whitespace-pre-wrap ${message.mine ? "rounded-br-md bg-primary text-on-primary" : "rounded-bl-md bg-surface-highest"} ${message.status === "failed" ? "opacity-60" : ""}`}
              >
                {message.text}
              </button>
              {(message === lastMine || message.status === "failed") && (
                <span className={`flex items-center gap-1 px-2 text-label-sm ${message.status === "failed" ? "text-error" : "text-on-surface-variant"}`}>
                  {formatTime(message.time, lang)} · {t(message.status)}
                  {message.status === "read" && <Icon name="done_all" size={14} className="text-primary" />}
                </span>
              )}
            </div>
          ))}
          <div ref={end} />
        </div>
        <div className="sticky bottom-0 flex items-end gap-2 bg-surface p-2">
          <TextField className="flex-1" label={t("typeMessage")} value={draft} onChange={setDraft} onEnter={send} />
          <IconButton icon="send" label={t("send")} variant="filled" size={48} disabled={!draft.trim()} onClick={send} />
        </div>
      </div>
    </Scaffold>
  );
}

function NewChat({ os, text }: { os: Os; text: string }) {
  const t = useT(S);
  const [number, setNumber] = useState("");
  const contacts = useProvider("contacts", state => state.contacts);
  const start = (target: string) => {
    if (!digits(target)) return;
    if (text) sendText(os, digits(target), text);
    os.replace(`thread/${digits(target)}`);
  };
  const pickContact = async () => {
    const result = await os.startActivity({ action: "PICK", type: "vnd.android.cursor.item/contact" });
    if (result?.number) start(String(result.number));
  };
  return (
    <Scaffold title={t("startChat")} onBack={os.back}>
      <div className="flex flex-col gap-3 p-4">
        {text && <p className="rounded-2xl bg-surface-container p-3 text-body">{text}</p>}
        <TextField label={t("to")} type="tel" inputMode="tel" value={number} autoFocus onChange={setNumber} onEnter={() => start(number)} trailing={<IconButton icon="arrow_forward" label={t("send")} onClick={() => start(number)} />} />
        <Button variant="tonal" icon="contacts" onClick={() => void pickContact()}>{t("pickContact")}</Button>
      </div>
      {contacts.map(contact => <ListItem key={contact.id} leading={<Avatar name={contact.name} src={contact.photo && fileUrl(contact.photo)} />} headline={contact.name} supporting={formatNumber(contact.number)} onClick={() => start(contact.number)} />)}
    </Scaffold>
  );
}

function Messages({ intent, route, os }: AppProps) {
  const t = useT(S);
  const lang = useLang();
  const { threads, unread } = useMessages();
  const contacts = useProvider("contacts", state => state.contacts);
  context = os;

  // sms: links, notification taps and "Share → Messages" all land on the right screen.
  useEffect(() => {
    const target = intent.data?.startsWith("sms:") ? digits(intent.data) : String(intent.extras?.number ?? "");
    if (target) os.replace(`thread/${digits(target)}`);
    else if (intent.action === "SEND") os.replace("new");
  }, [intent, os]);

  if (route.startsWith("thread/")) return <Thread key={route} number={route.slice(7)} os={os} />;
  if (route === "new") return <NewChat os={os} text={intent.action === "SEND" ? String(intent.extras?.text ?? intent.data ?? "") : ""} />;

  const conversations = Object.entries(threads)
    .filter(([, thread]) => thread.length)
    .sort(([, a], [, b]) => (b.at(-1)?.time ?? 0) - (a.at(-1)?.time ?? 0));
  return (
    <Scaffold title={t("name")} fab={<Fab icon="chat" label={t("startChat")} extended onClick={() => os.push("new")} />}>
      {conversations.length === 0 && <EmptyState icon="forum" title={t("noChats")} text={t("noChatsHint")} />}
      {conversations.map(([number, thread]) => {
        const last = thread[thread.length - 1];
        const photo = contacts.find(contact => digits(contact.number) === number)?.photo;
        const count = unread[number] ?? 0;
        return (
          <ListItem
            key={number}
            leading={<Avatar name={callerName(number)} src={photo && fileUrl(photo)} />}
            headline={<span className={count ? "font-bold" : ""}>{callerName(number)}</span>}
            supporting={last.mine ? t("you", { text: last.text }) : last.text}
            trailing={<span className="flex flex-col items-end gap-1">{formatTime(last.time, lang)}{count > 0 && <span className="grid size-5 place-items-center rounded-full bg-primary text-[0.625rem] text-on-primary">{count}</span>}</span>}
            onClick={() => os.push(`thread/${number}`)}
          />
        );
      })}
    </Scaffold>
  );
}

export default {
  id: "messages",
  name: S.name,
  icon: "chat",
  tint: { hue: 262 },
  description: S.description,
  system: true,
  permissions: ["notifications"],
  channels: { messages: { name: S.channel, importance: "high" } },
  handles: [{ action: "SENDTO", scheme: "sms" }, { action: "SEND", type: "text/plain" }],
  Component: Messages,
  receivers: {
    SMS(intent, os) {
      const from = digits(String(intent.extras?.from ?? ""));
      const text = String(intent.extras?.text ?? "");
      const id = String(intent.extras?.id ?? crypto.randomUUID());
      context ??= os;
      append(from, { id, mine: false, text, time: Date.now(), status: "delivered" });
      void os.send(from, { action: "SMS_DELIVERED", extras: { id } });
      if (viewing === from) return markRead(os, from);
      useMessages.setState(({ unread }) => ({ unread: { ...unread, [from]: (unread[from] ?? 0) + 1 } }));
      const recent = useMessages.getState().threads[from].filter(item => !item.mine).slice(-3).map(item => item.text).join("\n");
      os.notify({
        id: `sms-${from}`, channel: "messages", icon: "chat", title: callerName(from), text: recent, intent: { app: "messages", action: "VIEW", extras: { number: from } },
        actions: [
          { label: pick(S.reply), intent: { app: "messages", action: "REPLY", extras: { number: from } }, reply: true },
          { label: pick(S.markRead), intent: { app: "messages", action: "MARK_READ", extras: { number: from } } },
        ],
      });
    },
    SMS_DELIVERED: intent => setStatus(digits(String(intent.extras?.from)), [String(intent.extras?.id)], "delivered"),
    SMS_READ: intent => setStatus(digits(String(intent.extras?.from)), String(intent.extras?.ids ?? "").split(","), "read"),
    REPLY(intent, os) {
      const number = String(intent.extras?.number ?? "");
      if (intent.extras?.reply) sendText(os, number, String(intent.extras.reply));
      markRead(os, number);
    },
    MARK_READ: (intent, os) => markRead(os, String(intent.extras?.number ?? "")),
  },
} satisfies AppDef;
