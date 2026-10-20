import { useEffect, useState } from "react";
import { create } from "zustand";
import { appStore, basename, COMMON, fileUrl, formatDuration, pick, useMedia, usePermission, useSettings, useT, type AppDef, type AppProps, type Os } from "../kernel";
import { BottomNav, Button, EmptyState, Fab, Icon, IconButton, ListItem, PermissionState, Scaffold, Sheet, Slider, TextField, useFrame } from "../ui";

const S = {
  ...COMMON,
  name: ["Müzik", "Music"],
  description: ["/Music klasöründeki şarkıları çalın", "Play the songs in your /Music folder"],
  songs: ["Şarkılar", "Songs"],
  playlists: ["Çalma listeleri", "Playlists"],
  noSongs: ["Müzik yok", "No music"],
  noSongsHint: ["Bilgisayarınızdan /Music klasörüne şarkı yükleyin", "Upload songs from your computer into /Music"],
  openFiles: ["Dosyalar'ı aç", "Open Files"],
  newPlaylist: ["Yeni çalma listesi", "New playlist"],
  addTo: ["Çalma listesine ekle", "Add to playlist"],
  emptyPlaylist: ["Bu listede şarkı yok", "No songs in this playlist"],
  playAll: ["Tümünü çal", "Play all"],
  previous: ["Önceki", "Previous"],
  next: ["Sonraki", "Next"],
  shuffle: ["Karıştır", "Shuffle"],
  repeat: ["Tekrarla", "Repeat"],
  nowPlaying: ["Şimdi çalıyor", "Now playing"],
  channel: ["Oynatma", "Playback"],
  tracks: ["{n} şarkı", "{n} songs"],
} as const;

/* The player lives outside React so playback continues while the app is closed. */
const audio = typeof Audio === "undefined" ? undefined : new Audio();
const usePlayer = create(() => ({ queue: [] as string[], index: -1, playing: false, shuffle: false, repeat: "off" as "off" | "all" | "one" }));
const useLibrary = appStore("music", { playlists: [] as { id: string; name: string; tracks: string[] }[] });
let context: Os | undefined;
const titleOf = (path: string) => basename(path).replace(/\.[^.]+$/, "");
const current = () => usePlayer.getState().queue[usePlayer.getState().index];

function publish(): void {
  const path = current();
  if (!context || !path) return;
  const { playing } = usePlayer.getState();
  const intent = (action: string) => ({ app: "music", action });
  context.notify({
    id: "music", channel: "playback", media: { playing }, ongoing: playing, icon: "music_note", title: titleOf(path), text: pick(S.name), intent: { app: "music", action: "MAIN", extras: { player: true } },
    actions: [
      { label: pick(S.previous), icon: "skip_previous", intent: intent("PREV") },
      { label: pick(playing ? S.pause : S.play), icon: playing ? "pause" : "play_arrow", intent: intent("TOGGLE") },
      { label: pick(S.next), icon: "skip_next", intent: intent("NEXT") },
    ],
  });
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: titleOf(path), artist: pick(S.name) });
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
  }
}

function play(queue: string[], index: number, os?: Os): void {
  if (!audio || !queue[index]) return;
  context = os ?? context;
  usePlayer.setState({ queue, index });
  audio.src = fileUrl(queue[index]);
  void audio.play().catch(() => undefined);
}

function toggle(): void {
  if (!audio?.src) return;
  if (audio.paused) void audio.play().catch(() => undefined);
  else audio.pause();
}

function seek(seconds: number): void {
  if (audio) audio.currentTime = seconds;
}

function setPlaying(playing: boolean): void {
  usePlayer.setState({ playing });
  publish();
}

function skip(delta: number): void {
  const { queue, index, shuffle, repeat } = usePlayer.getState();
  if (!queue.length) return;
  let next = shuffle ? Math.floor(Math.random() * queue.length) : index + delta;
  if (next >= queue.length || next < 0) next = repeat === "all" ? (next + queue.length) % queue.length : -1;
  if (next >= 0) play(queue, next);
  else audio?.pause();
}

function stop(): void {
  audio?.pause();
  usePlayer.setState({ queue: [], index: -1, playing: false });
  context?.cancel("music");
}

if (audio) {
  audio.volume = useSettings.getState().volumes.media;
  useSettings.subscribe(settings => {
    audio.volume = settings.volumes.media;
  });
  audio.onplay = () => setPlaying(true);
  audio.onpause = () => setPlaying(false);
  audio.onended = () => {
    if (usePlayer.getState().repeat === "one") void audio.play();
    else skip(1);
  };
  if ("mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("play", toggle);
    navigator.mediaSession.setActionHandler("pause", toggle);
    navigator.mediaSession.setActionHandler("previoustrack", () => skip(-1));
    navigator.mediaSession.setActionHandler("nexttrack", () => skip(1));
  }
}

function Player({ os }: { os: Os }) {
  const t = useT(S);
  const { playing, shuffle, repeat } = usePlayer();
  const path = current();
  useFrame(playing);
  const duration = audio && Number.isFinite(audio.duration) ? audio.duration : 0;
  const position = audio?.currentTime ?? 0;
  const nextRepeat = { off: "all", all: "one", one: "off" } as const;
  return (
    <Scaffold title={t("nowPlaying")} onBack={os.back}>
      <div className="flex h-full flex-col items-center gap-6 px-8 pt-4">
        <div className="grid aspect-square w-full max-w-72 place-items-center rounded-4xl bg-gradient-to-br from-primary-container to-tertiary-container text-on-primary-container">
          <Icon name="music_note" size={112} className={playing ? "animate-pulse" : ""} />
        </div>
        <p className="w-full truncate text-center text-headline-sm">{path ? titleOf(path) : "—"}</p>
        <div className="w-full">
          <Slider label={t("nowPlaying")} value={position} max={duration || 1} onChange={seek} />
          <div className="flex justify-between text-label-sm text-on-surface-variant tabular-nums">
            <span>{formatDuration(position * 1000)}</span>
            <span>{formatDuration(duration * 1000)}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <IconButton icon="shuffle" label={t("shuffle")} selected={shuffle} onClick={() => usePlayer.setState({ shuffle: !shuffle })} />
          <IconButton icon="skip_previous" label={t("previous")} size={56} onClick={() => skip(-1)} />
          <IconButton icon={playing ? "pause" : "play_arrow"} label={t(playing ? "pause" : "play")} variant="filled" size={80} onClick={toggle} />
          <IconButton icon="skip_next" label={t("next")} size={56} onClick={() => skip(1)} />
          <IconButton icon={repeat === "one" ? "repeat_one" : "repeat"} label={t("repeat")} selected={repeat !== "off"} onClick={() => usePlayer.setState({ repeat: nextRepeat[repeat] })} />
        </div>
      </div>
    </Scaffold>
  );
}

function Music({ intent, route, os }: AppProps) {
  const t = useT(S);
  const storage = usePermission(os.app, "storage");
  const songs = useMedia(["audio/"], "/Music");
  const { playlists } = useLibrary();
  const player = usePlayer();
  const [tab, setTab] = useState<"songs" | "playlists">("songs");
  const [adding, setAdding] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const paths = songs.map(song => song.path);
  // Opening an audio file from Files plays it straight away.
  useEffect(() => {
    if (intent.action === "VIEW" && intent.data) {
      play([intent.data], 0, os);
      os.replace("player");
    }
  }, [intent, os]);

  if (route === "player" || (intent.extras?.player && route === "main" && player.index >= 0)) return <Player os={os} />;
  if (!storage.granted) return <Scaffold title={t("name")}><PermissionState icon="library_music" text={t("noSongsHint")} onGrant={() => void storage.request()} /></Scaffold>;

  const createPlaylist = () => {
    if (!newName.trim()) return;
    useLibrary.setState({ playlists: [...playlists, { id: crypto.randomUUID(), name: newName.trim(), tracks: adding ? [adding] : [] }] });
    setNewName("");
    setAdding(null);
  };
  const addTo = (id: string) => {
    useLibrary.setState({ playlists: playlists.map(list => (list.id === id && adding ? { ...list, tracks: [...new Set([...list.tracks, adding])] } : list)) });
    setAdding(null);
  };
  const removePlaylist = (id: string) => {
    useLibrary.setState({ playlists: playlists.filter(list => list.id !== id) });
    os.back();
  };
  const playlist = route.startsWith("playlist/") ? playlists.find(list => list.id === route.slice(9)) : undefined;
  const songList = (list: string[]) =>
    list.map((path, index) => (
      <ListItem key={path} icon={player.queue[player.index] === path ? "graphic_eq" : "music_note"} headline={titleOf(path)} supporting={path.split(".").pop()?.toUpperCase()} onClick={() => play(list, index, os)} onLongPress={() => setAdding(path)} />
    ));
  const miniPlayer = player.index >= 0 && (
    <div className="flex items-center gap-2 px-4 py-2">
      <button type="button" className="min-w-0 flex-1 truncate text-left text-title-sm" onClick={() => os.push("player")}>{titleOf(current() ?? "")}</button>
      <IconButton icon={player.playing ? "pause" : "play_arrow"} label={t(player.playing ? "pause" : "play")} variant="tonal" onClick={toggle} />
      <IconButton icon="skip_next" label={t("next")} onClick={() => skip(1)} />
    </div>
  );

  if (playlist) {
    return (
      <Scaffold title={playlist.name} onBack={os.back} bottom={miniPlayer} actions={<IconButton icon="delete" label={t("delete")} onClick={() => removePlaylist(playlist.id)} />}
        fab={playlist.tracks.length > 0 && <Fab icon="play_arrow" label={t("playAll")} extended onClick={() => play(playlist.tracks, 0, os)} />}>
        {playlist.tracks.length ? songList(playlist.tracks) : <EmptyState icon="queue_music" title={t("emptyPlaylist")} />}
      </Scaffold>
    );
  }
  return (
    <Scaffold
      title={t(tab)}
      bottom={<>{miniPlayer}<BottomNav items={[{ value: "songs", icon: "music_note", label: t("songs") }, { value: "playlists", icon: "queue_music", label: t("playlists") }]} value={tab} onChange={setTab} /></>}
      fab={tab === "playlists" && <Fab icon="playlist_add" label={t("newPlaylist")} onClick={() => setAdding("")} />}
    >
      {tab === "songs" && (songs.length ? songList(paths) : <EmptyState icon="library_music" title={t("noSongs")} text={t("noSongsHint")} action={<Button variant="tonal" icon="folder_open" onClick={() => void os.startActivity({ app: "files", action: "MAIN", extras: { dir: "/Music" } })}>{t("openFiles")}</Button>} />)}
      {tab === "playlists" && playlists.map(list => <ListItem key={list.id} icon="queue_music" headline={list.name} supporting={t("tracks", { n: list.tracks.length })} onClick={() => os.push(`playlist/${list.id}`)} />)}
      <Sheet open={adding !== null} onClose={() => setAdding(null)} title={t(adding ? "addTo" : "newPlaylist")}>
        {adding && playlists.map(list => <ListItem key={list.id} icon="queue_music" headline={list.name} onClick={() => addTo(list.id)} />)}
        <div className="flex items-center gap-2 p-4">
          <TextField className="flex-1" label={t("newPlaylist")} value={newName} onChange={setNewName} onEnter={createPlaylist} />
          <IconButton icon="add" label={t("add")} variant="filled" onClick={createPlaylist} />
        </div>
      </Sheet>
    </Scaffold>
  );
}

export default {
  id: "music",
  name: S.name,
  icon: "library_music",
  tint: { hue: 325 },
  description: S.description,
  permissions: ["storage"],
  channels: { playback: { name: S.channel, importance: "low" } },
  handles: [{ action: "VIEW", type: "audio/*" }],
  Component: Music,
  receivers: { PREV: () => skip(-1), NEXT: () => skip(1), TOGGLE: toggle, TERMINATE: stop },
} satisfies AppDef;
