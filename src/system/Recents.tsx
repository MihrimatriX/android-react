import { useEffect } from "react";
import { useSettings, useT } from "../kernel";
import { goHome, killTask, switchTo, useOs } from "../kernel/os";
import { Button } from "../ui";
import { takeScreenshot } from "./screenshot";
import { S } from "./strings";
import { useUi } from "./store";

/** Backdrop and controls for the overview; the cards themselves are the live task windows (see Tasks). */
export function Recents() {
  const t = useT(S);
  const recents = useOs(state => state.recents);
  const tasks = useOs(state => state.tasks);
  const animScale = useSettings(state => state.animScale);
  const scroll = useUi(state => state.recentsScroll);

  useEffect(() => {
    if (recents) useUi.setState({ recentsScroll: 0 });
  }, [recents]);
  useEffect(() => {
    const last = Math.max(0, tasks.length - 1);
    if (scroll > last || scroll < 0) useUi.setState({ recentsScroll: Math.min(last, Math.max(0, scroll)) });
    if (recents && tasks.length === 0) goHome();
  }, [tasks.length, scroll, recents]);

  if (!recents) return null;
  const ordered = tasks.toSorted((a, b) => b.lastActive - a.lastActive);
  // Pixel's overview screenshot captures the centred app, so it is brought forward first.
  const screenshot = () => {
    const focused = ordered[Math.round(scroll)];
    if (!focused) return;
    switchTo(focused.id);
    setTimeout(() => void takeScreenshot(), 450 * animScale);
  };
  const clearAll = () => {
    for (const task of tasks) killTask(task.id);
    goHome();
  };
  return (
    <>
      <div className="enter absolute inset-0 z-[9] bg-black/45 backdrop-blur-md" onClick={goHome} />
      <div className="enter absolute inset-x-0 z-20 flex justify-center gap-3" style={{ bottom: "calc(var(--inset-bottom) + 1.25rem)" }}>
        <Button variant="tonal" icon="screenshot" onClick={screenshot}>{t("screenshot")}</Button>
        <Button variant="tonal" icon="clear_all" onClick={clearAll}>{t("clearAll")}</Button>
      </div>
    </>
  );
}
