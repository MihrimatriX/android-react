import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useSettings, useT, type SystemSettings } from "../kernel";
import { play } from "../kernel/sound";
import { Button, IconButton, Slider } from "../ui";
import { S } from "./strings";
import { useUi } from "./store";

type Stream = keyof SystemSettings["volumes"];
export const RINGER: SystemSettings["ringer"][] = ["sound", "vibrate", "silent"];
const RINGER_ICON = { sound: "notifications_active", vibrate: "vibration", silent: "notifications_off" };
const STREAM_ICON: Record<Stream, string> = { media: "music_note", ring: "ring_volume", alarm: "alarm" };

const poke = () => useUi.setState({ volumeAt: Date.now() });

function setVolume(stream: Stream, value: number): void {
  useSettings.setState(state => ({ volumes: { ...state.volumes, [stream]: Math.round(Math.min(1, Math.max(0, value)) * 15) / 15 } }));
  poke();
}

/** Hardware volume keys move the media stream in Android's 15 steps. */
export function stepVolume(direction: 1 | -1): void {
  setVolume("media", useSettings.getState().volumes.media + direction / 15);
  play("tick");
}

export function VolumePanel() {
  const t = useT(S);
  const at = useUi(state => state.volumeAt);
  const { volumes, ringer } = useSettings(useShallow(state => ({ volumes: state.volumes, ringer: state.ringer })));
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!at || expanded) return;
    const timer = setTimeout(() => useUi.setState({ volumeAt: 0 }), 3000);
    return () => clearTimeout(timer);
  }, [at, expanded]);

  if (!at && !expanded) return null;
  const cycleRinger = () => {
    useSettings.setState({ ringer: RINGER[(RINGER.indexOf(ringer) + 1) % RINGER.length] });
    poke();
  };
  const close = () => {
    setExpanded(false);
    useUi.setState({ volumeAt: 0 });
  };

  if (expanded) {
    return (
      <div className="enter absolute inset-0 z-[60] flex items-center bg-black/40 p-4" onClick={close}>
        <div className="pop w-full rounded-4xl bg-surface-high p-6 text-on-surface" onClick={event => event.stopPropagation()}>
          {(Object.keys(STREAM_ICON) as Stream[]).map(stream => (
            <div key={stream} className="mb-4">
              <p className="mb-2 text-label text-on-surface-variant">{t(stream)}</p>
              <Slider label={t(stream)} icon={STREAM_ICON[stream]} value={volumes[stream]} onChange={value => setVolume(stream, value)} />
            </div>
          ))}
          <div className="flex justify-end">
            <Button onClick={close}>{t("done")}</Button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="enter absolute top-1/2 right-3 z-[60] flex -translate-y-1/2 flex-col items-center gap-2 rounded-full bg-surface-high p-2 text-on-surface shadow-xl">
      <IconButton icon={RINGER_ICON[ringer]} label={t("tileRinger")} variant="tonal" onClick={cycleRinger} />
      <div className="h-48">
        <Slider vertical label={t("media")} icon={volumes.media ? "volume_up" : "volume_off"} value={volumes.media} onChange={value => setVolume("media", value)} />
      </div>
      <IconButton icon="more_horiz" label={t("edit")} onClick={() => setExpanded(true)} />
    </div>
  );
}
