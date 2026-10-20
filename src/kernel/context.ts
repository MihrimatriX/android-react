import { cancelAlarm, keepAwake, setAlarm, vibrate } from "./device";
import { copyFile, mkdir, moveFile, readFile, removeFile, writeFile } from "./fs";
import { COMMON, pick } from "./i18n";
import { cancel, notify } from "./notifications";
import { back, finishActivity, share, startActivity, updateRoutes, useOs } from "./os";
import { requestPermission } from "./permissions";
import { send } from "./push";
import { getSettings, isOnline, setSettings } from "./settings";
import { play } from "./sound";
import { toast } from "./system";
import { setWallpaper } from "./theme";
import type { Os } from "./types";

/** The `os` object an app receives: Android's Context, bound to one app (and activity, when it has UI). */

// Camera/microphone use is tracked so the status bar can show the privacy dot.
const liveTracks: Array<{ app: string; track: MediaStreamTrack }> = [];
function refreshSensing(): void {
  const live = liveTracks.filter(item => item.track.readyState === "live");
  liveTracks.splice(0, liveTracks.length, ...live);
  useOs.setState({ sensing: [...new Set(live.map(item => item.app))] });
}

/** Named like the DOM error so apps handle a kernel refusal and a browser refusal the same way. */
class PermissionDenied extends Error {
  name = "NotAllowedError";
}

export function makeOs(app: string, activity?: number): Os {
  const guarded = <A extends unknown[]>(run: (...args: A) => Promise<void>) => async (...args: A) => {
    if (!(await requestPermission(app, "storage"))) throw new PermissionDenied("storage");
    await run(...args);
  };
  return {
    app,
    startActivity: intent => startActivity(intent, activity),
    finish: result => activity !== undefined && finishActivity(activity, result),
    push: route => activity !== undefined && updateRoutes(activity, routes => [...routes, route]),
    replace: route => activity !== undefined && updateRoutes(activity, routes => [...routes.slice(0, -1), route]),
    back,
    notify: notification => notify(app, notification),
    cancel,
    toast,
    share: content => void share(content, activity),
    async media(constraints) {
      if (constraints.video && !(await requestPermission(app, "camera"))) throw new PermissionDenied("camera");
      if (constraints.audio && !(await requestPermission(app, "microphone"))) throw new PermissionDenied("microphone");
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      for (const track of stream.getTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => {
          stop();
          refreshSensing();
        };
        track.addEventListener("ended", refreshSensing);
        liveTracks.push({ app, track });
      }
      refreshSensing();
      return stream;
    },
    async locate() {
      if (!(await requestPermission(app, "location"))) throw new PermissionDenied("location");
      return new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude }), reject, { timeout: 10000 }),
      );
    },
    fetch: (url, init) => (isOnline() ? fetch(url, init) : Promise.reject(new Error(pick(COMMON.offline)))),
    send: (to, intent, queue) => send(to, { ...intent, app }, queue),
    setAlarm: (id, at, intent) => setAlarm({ id, app, at, intent: { ...intent, app: intent.app ?? app }, clock: intent.action === "ALARM" }),
    cancelAlarm: id => cancelAlarm(app, id),
    vibrate,
    sound: play,
    keepAwake: on => keepAwake(`${app}:${activity ?? 0}`, on),
    fs: { write: writeFile, read: readFile, mkdir, remove: guarded(removeFile), move: guarded(moveFile), copy: guarded(copyFile) },
    settings: {
      get: getSettings,
      set: ({ wallpaper, ...patch }) => {
        setSettings(patch);
        if (wallpaper) void setWallpaper(wallpaper);
      },
    },
  };
}
