import { useRef, useState } from "react";
import { create } from "zustand";
import { basename, COMMON, dirname, fileStamp, fileUrl, formatDate, formatDuration, formatSize, join, pick, takenPath, uniquePath, useLang, useMedia, useT, type AppDef, type AppProps, type FileEntry, type Os } from "../kernel";
import { Button, Dialog, EmptyState, IconButton, ListItem, Scaffold, Sheet, TextField, useFrame } from "../ui";

const S = {
  ...COMMON,
  name: ["Ses Kaydedici", "Recorder"],
  description: ["Ses kaydedin, dinleyin ve paylaşın", "Record, play back and share audio"],
  record: ["Kaydet", "Record"],
  recording: ["Kaydediliyor", "Recording"],
  fileName: ["Kayıt", "Recording"],
  noRecordings: ["Kayıt yok", "No recordings"],
  noRecordingsHint: ["Kayda başlamak için düğmeye dokunun", "Tap the button to start recording"],
  needMic: ["Kayıt için mikrofon izni gerekiyor", "Microphone permission is needed to record"],
  channel: ["Kayıt", "Recording"],
} as const;

const BARS = 64;

/* Recording lives outside React so it keeps going while the app is in the background. */
const useRecording = create(() => ({ active: false, startedAt: 0, levels: [] as number[] }));
let stopRecording: (() => void) | undefined;

async function startRecording(os: Os): Promise<boolean> {
  let stream: MediaStream;
  try {
    stream = await os.media({ audio: true });
  } catch {
    return false;
  }
  const audioContext = new AudioContext();
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  audioContext.createMediaStreamSource(stream).connect(analyser);
  const samples = new Uint8Array(analyser.fftSize);
  // RMS of the waveform every 80 ms gives the scrolling level bars.
  const sampler = setInterval(() => {
    analyser.getByteTimeDomainData(samples);
    const rms = Math.sqrt(samples.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / samples.length);
    useRecording.setState(({ levels }) => ({ levels: [...levels.slice(-(BARS - 1)), Math.min(1, rms * 4)] }));
  }, 80);
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream);
  recorder.ondataavailable = event => chunks.push(event.data);
  recorder.onstop = () => {
    clearInterval(sampler);
    stream.getTracks().forEach(track => track.stop());
    void audioContext.close();
    os.keepAwake(false);
    os.cancel("recording");
    os.sound("stop");
    useRecording.setState({ active: false, startedAt: 0, levels: [] });
    void os.fs.write(uniquePath(`/Recordings/${pick(S.fileName)}_${fileStamp()}.webm`, takenPath), new Blob(chunks, { type: recorder.mimeType || "audio/webm" }), "audio/webm");
  };
  recorder.start(250);
  stopRecording = () => {
    if (recorder.state !== "inactive") recorder.stop();
  };
  useRecording.setState({ active: true, startedAt: Date.now(), levels: [] });
  os.sound("start");
  os.keepAwake(true);
  os.notify({
    id: "recording", ongoing: true, channel: "recording", icon: "mic", title: pick(S.recording), intent: { app: "recorder", action: "MAIN" },
    actions: [{ label: pick(S.stop), icon: "stop", intent: { app: "recorder", action: "STOP" } }],
  });
  return true;
}

function Waveform({ levels }: { levels: number[] }) {
  const padded = [...Array.from({ length: BARS - levels.length }, () => 0), ...levels];
  return (
    <div aria-hidden className="flex h-28 items-center gap-0.5 px-4">
      {padded.map((level, index) => (
        <span key={index} className="flex-1 rounded-full bg-primary" style={{ height: `${Math.max(4, level * 100)}%`, opacity: level ? 1 : 0.25 }} />
      ))}
    </div>
  );
}

function Recorder({ os }: AppProps) {
  const t = useT(S);
  const lang = useLang();
  const recording = useRecording();
  const recordings = useMedia(["audio/"], "/Recordings");
  const player = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [selected, setSelected] = useState<FileEntry | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  useFrame(recording.active || playing !== null);

  const toggleRecording = async () => {
    if (recording.active) return stopRecording?.();
    setDenied(!(await startRecording(os)));
  };
  const togglePlayback = (entry: FileEntry) => {
    const element = player.current;
    if (!element) return;
    if (playing === entry.path) {
      element.pause();
      return setPlaying(null);
    }
    element.src = fileUrl(entry.path);
    element.volume = os.settings.get().volumes.media;
    void element.play();
    setPlaying(entry.path);
  };
  const rename = async () => {
    if (!selected || !renaming?.trim()) return;
    await os.fs.move(selected.path, uniquePath(join(dirname(selected.path), `${renaming.trim()}.webm`), takenPath));
    setRenaming(null);
    setSelected(null);
  };
  const remove = async () => {
    if (selected) await os.fs.remove(selected.path);
    setSelected(null);
  };
  const shareSelected = () => {
    if (selected) os.share({ type: "audio/webm", data: selected.path });
    setSelected(null);
  };
  const progress = player.current && playing ? player.current.currentTime / (player.current.duration || 1) : 0;

  return (
    <Scaffold title={t("name")}>
      <div className="flex flex-col items-center gap-4 py-6">
        <Waveform levels={recording.levels} />
        <p className="text-display tabular-nums">{formatDuration(recording.active ? Date.now() - recording.startedAt : 0)}</p>
        {denied && <p className="text-body text-error">{t("needMic")}</p>}
        <button type="button" aria-label={t(recording.active ? "stop" : "record")} onClick={() => void toggleRecording()} className="ripple grid size-20 place-items-center rounded-full bg-error text-on-error shadow-lg">
          <span className={`anim block bg-current ${recording.active ? "size-7 rounded-md" : "size-10 rounded-full"}`} />
        </button>
      </div>
      {recordings.length === 0 && <EmptyState icon="mic" title={t("noRecordings")} text={t("noRecordingsHint")} />}
      {recordings.map(entry => (
        <div key={entry.path}>
          <ListItem
            leading={<IconButton icon={playing === entry.path ? "pause" : "play_arrow"} label={t(playing === entry.path ? "pause" : "play")} variant="tonal" onClick={() => togglePlayback(entry)} />}
            headline={basename(entry.path).replace(/\.webm$/, "")}
            supporting={`${formatDate(entry.mtime, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }, lang)} · ${formatSize(entry.size)}`}
            trailing={<IconButton icon="more_vert" label={t("more")} onClick={() => setSelected(entry)} />}
            onLongPress={() => setSelected(entry)}
          />
          {playing === entry.path && <div className="mx-4 h-1 overflow-hidden rounded-full bg-secondary-container"><div className="h-full bg-primary" style={{ width: `${progress * 100}%` }} /></div>}
        </div>
      ))}
      <audio ref={player} onEnded={() => setPlaying(null)} hidden />
      <Sheet open={!!selected && renaming === null} onClose={() => setSelected(null)} title={selected && basename(selected.path)}>
        <ListItem icon="edit" headline={t("rename")} onClick={() => setRenaming(basename(selected?.path ?? "").replace(/\.webm$/, ""))} />
        <ListItem icon="share" headline={t("share")} onClick={shareSelected} />
        <ListItem icon="delete" headline={t("delete")} onClick={() => void remove()} />
      </Sheet>
      <Dialog open={renaming !== null} onClose={() => setRenaming(null)} title={t("rename")} actions={<><Button variant="text" onClick={() => setRenaming(null)}>{t("cancel")}</Button><Button variant="text" onClick={() => void rename()}>{t("ok")}</Button></>}>
        <TextField label={t("name")} value={renaming ?? ""} autoFocus onChange={setRenaming} onEnter={() => void rename()} />
      </Dialog>
    </Scaffold>
  );
}

export default {
  id: "recorder",
  name: S.name,
  icon: "mic",
  tint: { hue: 25 },
  description: S.description,
  permissions: ["microphone"],
  preinstalled: false,
  channels: { recording: { name: S.channel, importance: "low" } },
  Component: Recorder,
  receivers: { STOP: () => stopRecording?.(), TERMINATE: () => stopRecording?.() },
} satisfies AppDef;
