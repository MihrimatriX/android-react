import type { ButtonHTMLAttributes, CSSProperties } from "react";
import { useT } from "../kernel";
import { back, showRecents, useOs } from "../kernel/os";
import { Icon } from "../ui";
import { hold } from "./effects";
import { home } from "./NavBar";
import { takeScreenshot } from "./screenshot";
import { S } from "./strings";

const TOOL =
  "grid size-10 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white active:bg-white/15 focus-visible:outline-2 focus-visible:outline-white/40";

function Tool({ icon, label, shortcut, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; label: string; shortcut?: string }) {
  return (
    <button type="button" aria-label={label} title={shortcut ? `${label} (${shortcut})` : label} className={TOOL} {...rest}>
      <Icon name={icon} size={20} />
    </button>
  );
}

const Divider = () => <span aria-hidden className="my-1 h-px w-6 bg-white/10" />;

/** Emulator-style toolbar beside the phone: hardware keys and nav buttons, each with its keyboard shortcut in the tooltip. */
export function DeviceToolbar({ nextDevice }: { nextDevice: string }) {
  const t = useT(S);
  return (
    <nav
      className="desktop-only absolute top-0 left-full ml-8 flex flex-col items-center gap-1 rounded-[1.75rem] border border-white/10 bg-[#15161b]/85 p-2 shadow-lg backdrop-blur-xl"
      style={{ "--icon-grade": -25 } as CSSProperties}
    >
      <Tool icon="power_settings_new" label={t("power")} shortcut="F7" {...hold("power")} />
      <Tool icon="volume_up" label={t("volumeUp")} shortcut="F9" {...hold("up")} />
      <Tool icon="volume_down" label={t("volumeDown")} shortcut="F8" {...hold("down")} />
      <Divider />
      <Tool icon="arrow_back" label={t("back")} shortcut="Esc" onClick={back} />
      <Tool icon="radio_button_unchecked" label={t("home")} onClick={home} />
      <Tool icon="crop_square" label={t("recents")} onClick={() => showRecents(!useOs.getState().recents)} />
      <Divider />
      <Tool icon="screenshot" label={t("screenshot")} shortcut="F7+F8" onClick={() => void takeScreenshot()} />
      <a aria-label={t("newDevice")} title={t("newDevice")} className={TOOL} href={`?device=${nextDevice}`} target="_blank" rel="noreferrer">
        <Icon name="open_in_new" size={20} />
      </a>
    </nav>
  );
}
