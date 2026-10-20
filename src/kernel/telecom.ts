import { create } from "zustand";
import { queryProvider } from "./apps";
import { pick } from "./i18n";
import { cancel, notify } from "./notifications";
import { formatNumber, send } from "./push";
import { persisted } from "./storage";
import type { Intent } from "./types";

/** The Telecom service: WebRTC voice calls between devices, signalled over the push channel. */
type CallStatus = "idle" | "dialing" | "ringing" | "incoming" | "active" | "ended";
type EndReason = "busy" | "unreachable" | "declined" | "noAnswer" | "ended" | "missed";

interface CallRecord {
  id: string;
  number: string;
  direction: "in" | "out" | "missed";
  time: number;
  duration: number;
}

const IDLE = { status: "idle" as CallStatus, number: "", outgoing: false, muted: false, speaker: false, held: false, remoteHeld: false, startedAt: 0, reason: undefined as EndReason | undefined };

export const useCall = create(() => IDLE);
export const useCallLog = persisted("system/calllog", { calls: [] as CallRecord[] });

const DIALER = "phone";
const S = {
  incoming: ["Gelen arama", "Incoming call"],
  ongoing: ["Devam eden arama", "Ongoing call"],
  missed: ["Cevapsız arama", "Missed call"],
  answer: ["Cevapla", "Answer"],
  decline: ["Reddet", "Decline"],
  hangup: ["Kapat", "Hang up"],
} as const;

let peer: RTCPeerConnection | undefined;
let local: MediaStream | undefined;
let pendingOffer = "";
let timer: ReturnType<typeof setTimeout> | undefined;
const remoteAudio = typeof Audio === "undefined" ? undefined : new Audio();

export const callerName = (number: string) =>
  queryProvider("contacts").contacts.find(contact => contact.number.replace(/\D/g, "") === number.replace(/\D/g, ""))?.name ?? formatNumber(number);

const signal = (action: string, extras?: Intent["extras"]) => send(useCall.getState().number, { app: "telecom", action, extras });
const inCall: Intent = { app: DIALER, action: "IN_CALL", showWhenLocked: true };

function createPeer(stream: MediaStream): RTCPeerConnection {
  const connection = new RTCPeerConnection();
  for (const track of stream.getTracks()) connection.addTrack(track, stream);
  connection.ontrack = event => {
    if (!remoteAudio) return;
    remoteAudio.srcObject = event.streams[0];
    void remoteAudio.play().catch(() => undefined);
  };
  connection.onconnectionstatechange = () => connection.connectionState === "failed" && end("ended");
  return connection;
}

// Signalling sends one complete SDP instead of trickling candidates; host candidates gather in milliseconds.
async function describe(connection: RTCPeerConnection, description: RTCSessionDescriptionInit): Promise<string> {
  await connection.setLocalDescription(description);
  if (connection.iceGatheringState !== "complete") {
    await new Promise<void>(resolve => {
      connection.addEventListener("icegatheringstatechange", () => connection.iceGatheringState === "complete" && resolve());
      setTimeout(resolve, 1500);
    });
  }
  return connection.localDescription?.sdp ?? "";
}

function ongoingNotification(): void {
  const { number } = useCall.getState();
  notify(DIALER, {
    id: "call", ongoing: true, channel: "calls", icon: "call", title: callerName(number), text: pick(S.ongoing), intent: inCall,
    actions: [{ label: pick(S.hangup), intent: { app: DIALER, action: "HANGUP" } }],
  });
}

export async function dial(number: string, stream: MediaStream): Promise<void> {
  if (useCall.getState().status !== "idle" && useCall.getState().status !== "ended") return;
  local = stream;
  peer = createPeer(stream);
  useCall.setState({ ...IDLE, status: "dialing", number: number.replace(/\D/g, ""), outgoing: true });
  const sdp = await describe(peer, await peer.createOffer());
  if (!(await signal("OFFER", { sdp }))) return end("unreachable");
  ongoingNotification();
  timer = setTimeout(() => {
    void signal("CANCEL");
    end("noAnswer");
  }, 30000);
}

export async function answer(stream: MediaStream): Promise<void> {
  if (useCall.getState().status !== "incoming") return stream.getTracks().forEach(track => track.stop());
  clearTimeout(timer);
  local = stream;
  peer = createPeer(stream);
  await peer.setRemoteDescription({ type: "offer", sdp: pendingOffer });
  const sdp = await describe(peer, await peer.createAnswer());
  void signal("ANSWER", { sdp });
  cancel("call");
  useCall.setState({ status: "active", startedAt: Date.now() });
  ongoingNotification();
}

export function decline(): void {
  void signal("DECLINE");
  end("declined");
}

export function hangup(): void {
  const { status } = useCall.getState();
  void signal(status === "active" ? "END" : "CANCEL");
  end("ended");
}

function applyTracks(): void {
  const { muted, held } = useCall.getState();
  for (const track of local?.getAudioTracks() ?? []) track.enabled = !muted && !held;
}

export function toggleMute(): void {
  useCall.setState(state => ({ muted: !state.muted }));
  applyTracks();
}

export function toggleHold(): void {
  useCall.setState(state => ({ held: !state.held }));
  applyTracks();
  if (remoteAudio) remoteAudio.muted = useCall.getState().held;
  void signal("HOLD", { held: useCall.getState().held });
}

// Desktops have one output; "speaker" is approximated by volume.
export function toggleSpeaker(): void {
  useCall.setState(state => ({ speaker: !state.speaker }));
  if (remoteAudio) remoteAudio.volume = useCall.getState().speaker ? 1 : 0.4;
}

function end(reason: EndReason): void {
  const { number, outgoing, startedAt, status } = useCall.getState();
  if (status === "idle" || status === "ended") return;
  clearTimeout(timer);
  peer?.close();
  for (const track of local?.getTracks() ?? []) track.stop();
  peer = local = undefined;
  if (remoteAudio) remoteAudio.srcObject = null;
  cancel("call");
  const answered = startedAt > 0;
  let direction: CallRecord["direction"] = answered ? "in" : "missed";
  if (outgoing) direction = "out";
  const record: CallRecord = { id: crypto.randomUUID(), number, direction, time: Date.now(), duration: answered ? Date.now() - startedAt : 0 };
  useCallLog.setState(({ calls }) => ({ calls: [record, ...calls].slice(0, 200) }));
  if (direction === "missed" && reason === "missed") {
    notify(DIALER, { channel: "missed", icon: "phone_missed", title: pick(S.missed), text: callerName(number), intent: { app: DIALER, action: "MAIN" } });
  }
  useCall.setState({ status: "ended", reason });
  setTimeout(() => useCall.getState().status === "ended" && useCall.setState(IDLE), 2500);
}

export function handleSignal(from: string, intent: Intent): void {
  const { status, number } = useCall.getState();
  if (intent.action === "OFFER") {
    if (status !== "idle" && status !== "ended") return void send(from, { app: "telecom", action: "BUSY" });
    pendingOffer = String(intent.extras?.sdp ?? "");
    useCall.setState({ ...IDLE, status: "incoming", number: from });
    void signal("RINGING");
    notify(DIALER, {
      id: "call", fullScreen: "call", icon: "call", title: callerName(from), text: pick(S.incoming), intent: inCall,
      actions: [
        { label: pick(S.decline), icon: "call_end", intent: { app: DIALER, action: "DECLINE" } },
        { label: pick(S.answer), icon: "call", intent: { ...inCall, extras: { answer: true } } },
      ],
    });
    timer = setTimeout(() => end("missed"), 30000);
    return;
  }
  if (from !== number) return;
  if (intent.action === "RINGING" && status === "dialing") useCall.setState({ status: "ringing" });
  if (intent.action === "ANSWER" && peer) {
    clearTimeout(timer);
    void peer.setRemoteDescription({ type: "answer", sdp: String(intent.extras?.sdp ?? "") });
    useCall.setState({ status: "active", startedAt: Date.now() });
  }
  if (intent.action === "HOLD") useCall.setState({ remoteHeld: !!intent.extras?.held });
  const endings: Record<string, EndReason> = { BUSY: "busy", DECLINE: "declined", CANCEL: "missed", END: "ended" };
  if (endings[intent.action]) end(endings[intent.action]);
}
