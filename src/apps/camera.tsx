import { useEffect, useRef, useState } from "react";
import { COMMON, fileStamp, fileUrl, formatDuration, useForeground, useMedia, useT, type AppDef, type AppProps } from "../kernel";
import { Chip, IconButton, PermissionState, Scaffold, Spinner, useFrame } from "../ui";

const S = {
  ...COMMON,
  name: ["Kamera", "Camera"],
  description: ["Fotoğraf ve video çekin", "Take photos and videos"],
  photo: ["Fotoğraf", "Photo"],
  video: ["Video", "Video"],
  shutter: ["Deklanşör", "Shutter"],
  flip: ["Kamerayı çevir", "Switch camera"],
  timer: ["Zamanlayıcı: {n}", "Timer: {n}"],
  off: ["kapalı", "off"],
  lastCapture: ["Son çekim", "Last capture"],
  needCamera: ["Fotoğraf çekmek için kamera izni gerekiyor", "Camera permission is needed to take photos"],
  noCamera: ["Kamera açılamadı", "Couldn't open the camera"],
  saved: ["Kaydedildi: {name}", "Saved: {name}"],
} as const;

const TIMERS = [0, 3, 10];

function Camera({ os }: AppProps) {
  const t = useT(S);
  const foreground = useForeground();
  const video = useRef<HTMLVideoElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "denied" | "failed">("loading");
  const [mode, setMode] = useState<"photo" | "video">("photo");
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [delay, setDelay] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [recordingSince, setRecordingSince] = useState(0);
  const [flash, setFlash] = useState(0);
  const [retry, setRetry] = useState(0);
  const latest = useMedia(["image/", "video/"], "/DCIM/Camera")[0];

  // The camera is held only while the app is on screen, like Android releasing it in the background.
  useEffect(() => {
    if (!foreground) return;
    let active: MediaStream | undefined;
    let cancelled = false;
    setStatus("loading");
    os.media({ video: { facingMode: facing, width: { ideal: 1920 } }, audio: mode === "video" })
      .then(media => {
        if (cancelled) return media.getTracks().forEach(track => track.stop());
        active = media;
        setStream(media);
        setStatus("ready");
      })
      .catch((error: Error) => setStatus(error.name === "NotAllowedError" ? "denied" : "failed"));
    os.keepAwake(true);
    return () => {
      cancelled = true;
      recorder.current?.stop();
      active?.getTracks().forEach(track => track.stop());
      setStream(null);
      os.keepAwake(false);
    };
  }, [foreground, facing, mode, retry, os]);

  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream]);

  const save = async (blob: Blob, extension: string) => {
    const name = `${extension === "jpg" ? "IMG" : "VID"}_${fileStamp()}.${extension}`;
    await os.fs.write(`/DCIM/Camera/${name}`, blob);
    os.toast(t("saved", { name }));
  };

  const takePhoto = () => {
    const source = video.current;
    if (!source?.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = source.videoWidth;
    canvas.height = source.videoHeight;
    const context = canvas.getContext("2d");
    // The front camera preview is mirrored; the saved photo is mirrored the same way, as on Pixel.
    if (facing === "user") context?.setTransform(-1, 0, 0, 1, canvas.width, 0);
    context?.drawImage(source, 0, 0);
    os.sound("shutter");
    os.vibrate(20);
    setFlash(Date.now());
    setTimeout(() => setFlash(0), 300);
    canvas.toBlob(blob => blob && void save(blob, "jpg"), "image/jpeg", 0.92);
  };

  const toggleRecording = () => {
    if (recorder.current) return recorder.current.stop();
    if (!stream) return;
    const chunks: Blob[] = [];
    const media = new MediaRecorder(stream);
    media.ondataavailable = event => chunks.push(event.data);
    media.onstop = () => {
      recorder.current = null;
      setRecordingSince(0);
      os.sound("stop");
      void save(new Blob(chunks, { type: "video/webm" }), "webm");
    };
    media.start(500);
    recorder.current = media;
    setRecordingSince(Date.now());
    os.sound("start");
  };

  const shoot = () => {
    if (mode === "video" && recorder.current) return toggleRecording();
    const action = mode === "photo" ? takePhoto : toggleRecording;
    if (!delay) return action();
    let left = delay;
    setCountdown(left);
    const tick = setInterval(() => {
      left--;
      os.sound("tick");
      setCountdown(left);
      if (left > 0) return;
      clearInterval(tick);
      action();
    }, 1000);
  };

  useFrame(recordingSince > 0);

  if (status === "denied") return <Scaffold dark><PermissionState icon="photo_camera" text={t("needCamera")} onGrant={() => setRetry(retry + 1)} /></Scaffold>;
  return (
    <Scaffold dark>
      <div className="relative flex h-full flex-col">
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-3xl bg-neutral-900">
          <video ref={video} autoPlay playsInline muted className={`size-full object-cover ${facing === "user" ? "-scale-x-100" : ""}`} />
          {status === "loading" && <div className="absolute inset-0 grid place-items-center"><Spinner /></div>}
          {status === "failed" && <p className="absolute inset-0 grid place-items-center text-body text-white/80">{t("noCamera")}</p>}
          {countdown > 0 && <span className="pop absolute inset-0 grid place-items-center text-[6rem] font-light">{countdown}</span>}
          {flash > 0 && <div key={flash} className="pointer-events-none absolute inset-0 bg-white" style={{ animation: "flash 300ms ease-out forwards" }} />}
          {recordingSince > 0 && <span className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-red-600 px-3 py-1 text-label tabular-nums">{formatDuration(Date.now() - recordingSince)}</span>}
          <IconButton icon={delay ? "timer" : "timer_off"} label={t("timer", { n: delay || t("off") })} className="absolute top-3 right-3 bg-black/40 text-white" onClick={() => setDelay(TIMERS[(TIMERS.indexOf(delay) + 1) % TIMERS.length])} />
          {delay > 0 && <span className="absolute top-4 right-14 text-label">{delay}s</span>}
        </div>
        <div className="flex justify-center gap-2 py-3">
          {(["photo", "video"] as const).map(option => (
            <Chip key={option} label={t(option)} selected={mode === option} disabled={recordingSince > 0} onClick={() => setMode(option)} />
          ))}
        </div>
        <div className="flex items-center justify-around pb-6">
          <button type="button" aria-label={t("lastCapture")} disabled={!latest} onClick={() => latest && void os.startActivity({ action: "VIEW", type: latest.mime, data: latest.path })} className="size-14 overflow-hidden rounded-full border-2 border-white/60 bg-neutral-800">
            {latest?.mime.startsWith("image/") && <img src={fileUrl(latest.path)} alt="" className="size-full object-cover" />}
            {latest?.mime.startsWith("video/") && <video src={fileUrl(latest.path)} muted className="size-full object-cover" />}
          </button>
          <button type="button" aria-label={t("shutter")} disabled={status !== "ready"} onClick={shoot} className="grid size-20 place-items-center rounded-full border-4 border-white disabled:opacity-40">
            <span className={`anim block rounded-full ${mode === "video" ? "bg-red-600" : "bg-white"} ${recordingSince ? "size-8 rounded-lg" : "size-16"}`} />
          </button>
          <IconButton icon="cameraswitch" label={t("flip")} variant="tonal" size={56} disabled={recordingSince > 0} onClick={() => setFacing(facing === "user" ? "environment" : "user")} />
        </div>
      </div>
    </Scaffold>
  );
}

export default {
  id: "camera",
  name: S.name,
  icon: "photo_camera",
  tint: { hue: 60, chroma: 0.15 },
  description: S.description,
  permissions: ["camera", "microphone"],
  Component: Camera,
} satisfies AppDef;
