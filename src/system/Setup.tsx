import { useState } from "react";
import { formatNumber, hashSecret, useSettings, useT, usePhone, WALLPAPERS, wallpaperCss, type Lang } from "../kernel";
import { finishSetup } from "../kernel/power";
import { setWallpaper } from "../kernel/theme";
import { Button, Icon, PinPad, TextField } from "../ui";
import { S } from "./strings";

const BOOT_DOTS = [
  { color: "#a78bfa", place: "top-0 left-0" },
  { color: "#f472b6", place: "top-0 right-0" },
  { color: "#fbbf24", place: "right-0 bottom-0" },
  { color: "#34d399", place: "bottom-0 left-0" },
];

/** Four dots orbit and breathe while the kernel hydrates, then the wordmark fades in. */
export function Boot() {
  const t = useT(S);
  return (
    <div className="absolute inset-0 z-[90] flex flex-col items-center justify-center gap-12 bg-black">
      <div className="relative size-20" style={{ animation: "orbit 1.6s cubic-bezier(0.6, 0, 0.4, 1) infinite" }}>
        {BOOT_DOTS.map(({ color, place }, index) => (
          <span key={color} className={`absolute size-7 rounded-full ${place}`} style={{ background: color, animation: `breathe 1.6s ${index * 0.1}s ease-in-out infinite` }} />
        ))}
      </div>
      <p className="enter text-headline-sm font-light tracking-[0.35em] text-white/90" style={{ animationDelay: "600ms" }}>
        {t("brand")}
      </p>
    </div>
  );
}

type Step = "welcome" | "name" | "pin" | "confirm" | "wallpaper" | "done";

/** First-boot wizard: language, name, screen lock and wallpaper. */
export function Setup() {
  const t = useT(S);
  const { lang, userName, wallpaper } = useSettings();
  const number = usePhone(state => state.number);
  const [step, setStep] = useState<Step>("welcome");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState(false);

  const savePin = async () => {
    if (confirm !== pin) {
      setMismatch(true);
      setConfirm("");
      return;
    }
    useSettings.setState({ lock: { kind: "pin", hash: await hashSecret(pin) } });
    setStep("wallpaper");
  };
  const submitPin = () => {
    if (step === "confirm") void savePin();
    else if (pin.length >= 4) setStep("confirm");
  };
  const header = (icon: string, title: string, text?: string) => (
    <div className="px-8 pt-16">
      <Icon name={icon} size={36} className="text-primary" />
      <h1 className="mt-6 text-headline-lg">{title}</h1>
      {text && <p className="mt-3 text-body-lg text-on-surface-variant">{text}</p>}
    </div>
  );
  const footer = (next: () => void, disabled = false, skip?: () => void) => (
    <div className="mt-auto flex justify-between px-6 pt-4" style={{ paddingBottom: "calc(var(--inset-bottom) + 1.5rem)" }}>
      {skip ? <Button variant="text" onClick={skip}>{t("skip")}</Button> : <span />}
      <Button onClick={next} disabled={disabled}>{t("next")}</Button>
    </div>
  );

  return (
    <div className="enter absolute inset-0 z-[90] flex flex-col overflow-y-auto bg-surface text-on-surface" style={{ paddingTop: "var(--inset-top)" }}>
      {step === "welcome" && (
        <>
          {header("waving_hand", t("welcome"), t("welcomeText"))}
          <div className="mt-10 flex flex-col gap-2 px-8">
            <p className="text-title-sm text-primary">{t("language")}</p>
            {(["tr", "en"] as Lang[]).map(code => (
              <Button key={code} variant={lang === code ? "filled" : "outlined"} onClick={() => useSettings.setState({ lang: code })}>
                {t(code === "tr" ? "langTr" : "langEn")}
              </Button>
            ))}
          </div>
          {footer(() => setStep("name"))}
        </>
      )}
      {step === "name" && (
        <>
          {header("badge", t("yourName"), t("nameHint"))}
          <TextField className="mx-8 mt-8" label={t("name")} value={userName} autoFocus onChange={value => useSettings.setState({ userName: value })} onEnter={() => setStep("pin")} />
          {footer(() => setStep("pin"), !userName.trim())}
        </>
      )}
      {(step === "pin" || step === "confirm") && (
        <>
          {header("lock", t(step === "pin" ? "setPin" : "confirmPin"), mismatch ? t("pinMismatch") : t("pinHint"))}
          <div className="mt-8 flex justify-center">
            <PinPad
              value={step === "pin" ? pin : confirm}
              onChange={step === "pin" ? setPin : setConfirm}
              onSubmit={submitPin}
              labels={{ delete: t("deleteKey"), enter: t("enter") }}
            />
          </div>
          {footer(submitPin, (step === "pin" ? pin : confirm).length < 4, () => setStep("wallpaper"))}
        </>
      )}
      {step === "wallpaper" && (
        <>
          {header("palette", t("pickWallpaper"), t("wallpaperHint"))}
          <div className="mt-8 grid grid-cols-3 gap-3 px-8">
            {Object.keys(WALLPAPERS).map((id, index) => (
              <button
                key={id}
                type="button"
                aria-label={`${t("pickWallpaper")} ${index + 1}`}
                aria-pressed={wallpaper === id}
                onClick={() => void setWallpaper(id)}
                className={`aspect-[9/16] rounded-2xl ${wallpaper === id ? "ring-4 ring-primary ring-offset-2 ring-offset-surface" : ""}`}
                style={{ background: wallpaperCss(id) }}
              />
            ))}
          </div>
          {footer(() => setStep("done"))}
        </>
      )}
      {step === "done" && (
        <>
          {header("check_circle", t("allSet"), t("allSetText", { number: formatNumber(number) || "…" }))}
          <div className="mt-auto flex justify-end px-6" style={{ paddingBottom: "calc(var(--inset-bottom) + 1.5rem)" }}>
            <Button icon="arrow_forward" onClick={finishSetup}>{t("start")}</Button>
          </div>
        </>
      )}
    </div>
  );
}
