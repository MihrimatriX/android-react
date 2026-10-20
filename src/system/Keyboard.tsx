import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { feedback, useBackHandler, useLang, useSettings } from "../kernel";
import { Icon } from "../ui";
import { useUi } from "./store";

type Field = HTMLInputElement | HTMLTextAreaElement;
type Page = "letters" | "symbols" | "more";

const BOTTOM = ["page", "lang", ",", "space", ".", "enter"];
const LETTERS = {
  tr: ["qwertyuıopğü", "asdfghjklşi", "⇧zxcvbnmöç⌫"],
  en: ["qwertyuiop", "asdfghjkl", "⇧zxcvbnm⌫"],
};
const SYMBOLS = ["1234567890", "@#₺_&-+()/", "⇧*\"':;!?⌫"];
const MORE = ["~`|•√π÷×¶∆", "£€$^°={}\\%", "⇧©®™✓[]<>⌫"];
const TEXT_TYPES = ["text", "search", "email", "url", "tel", "password", "number", ""];

const isField = (element: Element | null): element is Field =>
  (element instanceof HTMLTextAreaElement || (element instanceof HTMLInputElement && TEXT_TYPES.includes(element.type))) &&
  !element.readOnly &&
  !element.disabled &&
  !!element.closest(".device");

// React tracks input values itself, so the native setter plus an input event is what makes onChange fire.
function replaceSelection(field: Field, text: string, deleteBefore = 0): void {
  const end = field.selectionEnd ?? field.value.length;
  const selected = (field.selectionStart ?? end) !== end;
  const start = Math.max(0, (field.selectionStart ?? end) - (selected ? 0 : deleteBefore));
  const value = field.value.slice(0, start) + text + field.value.slice(end);
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(field, value);
  try {
    field.setSelectionRange(start + text.length, start + text.length);
  } catch {
    // number/email inputs have no selection API; the caret simply stays at the end
  }
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function pressEnter(field: Field): void {
  if (field instanceof HTMLTextAreaElement) return replaceSelection(field, "\n");
  const event = new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true });
  if (field.dispatchEvent(event)) field.form?.requestSubmit();
}

const sentenceStart = (field: Field) => /(^|[.!?]\s+)$/.test(field.value.slice(0, field.selectionStart ?? field.value.length));

export function Keyboard() {
  const systemLang = useLang();
  const navMode = useSettings(state => state.navMode);
  const [field, setField] = useState<Field | null>(null);
  const [lang, setLang] = useState(systemLang);
  const [page, setPage] = useState<Page>("letters");
  const [shift, setShift] = useState<"off" | "once" | "lock">("off");
  const [pressed, setPressed] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const repeat = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastShift = useRef(0);

  useEffect(() => {
    setLang(systemLang);
  }, [systemLang]);
  useEffect(() => {
    const onFocus = (event: FocusEvent) => {
      const target = event.target as Element;
      if (!isField(target)) return;
      // The original inputMode is kept so numeric fields still open on the number page.
      target.dataset.mode ??= target.inputMode || target.type;
      target.inputMode = "none";
      setField(target);
      setPage(["numeric", "decimal", "tel", "number"].includes(target.dataset.mode) ? "symbols" : "letters");
      setShift(target.value ? "off" : "once");
    };
    const onBlur = () => setTimeout(() => !isField(document.activeElement) && setField(null), 50);
    // A hardware keyboard replaces the on-screen one, as on Android.
    const onKey = (event: KeyboardEvent) => event.isTrusted && event.key.length === 1 && !event.ctrlKey && setField(null);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  useLayoutEffect(() => {
    useUi.setState({ keyboardHeight: field ? (ref.current?.offsetHeight ?? 0) : 0 });
    field?.scrollIntoView({ block: "nearest" });
  }, [field]);
  useBackHandler(() => field?.blur(), !!field);

  if (!field) return null;
  const upper = shift !== "off";
  const caseOf = (key: string) => (upper ? key.toLocaleUpperCase(lang === "tr" ? "tr" : "en") : key);
  const type = (text: string) => {
    replaceSelection(field, text);
    if (shift === "once") setShift(sentenceStart(field) ? "once" : "off");
    else if (shift === "off" && sentenceStart(field) && page === "letters") setShift("once");
  };
  const erase = () => {
    replaceSelection(field, "", 1);
    feedback("click");
  };
  const onKey = (key: string) => {
    feedback("click");
    if (key === "⇧" && page !== "letters") return setPage(page === "symbols" ? "more" : "symbols");
    if (key === "⇧") {
      const now = Date.now();
      if (now - lastShift.current < 300) setShift("lock");
      else setShift(shift === "off" ? "once" : "off");
      lastShift.current = now;
      return;
    }
    if (key === "page") return setPage(page === "letters" ? "symbols" : "letters");
    if (key === "lang") return setLang(lang === "tr" ? "en" : "tr");
    if (key === "space") return type(" ");
    if (key === "enter") return pressEnter(field);
    type(caseOf(key));
  };
  const startPress = (key: string) => (event: PointerEvent) => {
    event.preventDefault();
    setPressed(key);
    if (key !== "⌫") return onKey(key);
    erase();
    const again = () => {
      erase();
      repeat.current = setTimeout(again, 60);
    };
    repeat.current = setTimeout(again, 400);
  };
  const endPress = () => {
    clearTimeout(repeat.current);
    setPressed(null);
  };
  const rows = { letters: LETTERS[lang], symbols: SYMBOLS, more: MORE }[page];
  const label = (key: string): ReactNode => {
    if (key === "⌫") return <Icon name="backspace" size={20} />;
    if (key === "⇧" && page === "letters") return <Icon name={shift === "lock" ? "keyboard_capslock" : "shift"} filled={upper} size={20} />;
    if (key === "⇧") return page === "symbols" ? "=\\<" : "?123";
    if (key === "enter") return <Icon name={field instanceof HTMLTextAreaElement ? "keyboard_return" : "done"} size={20} />;
    if (key === "lang") return <Icon name="language" size={20} />;
    if (key === "page") return page === "letters" ? "?123" : "ABC";
    if (key === "space") return lang.toUpperCase();
    return caseOf(key);
  };
  const special = (key: string) => ["⌫", "⇧", "page", "lang"].includes(key);
  const keyClass = (key: string) => {
    if (key === "space") return "flex-[4] bg-surface-highest";
    if (key === "enter") return "flex-[1.4] bg-primary text-on-primary";
    return special(key) ? "flex-[1.4] bg-secondary-container" : "flex-1 bg-surface-highest";
  };

  return (
    <div
      ref={ref}
      data-no-feedback
      onPointerDown={event => event.preventDefault()}
      className="enter-up absolute inset-x-0 z-[95] flex flex-col gap-2 bg-surface-container px-1.5 pt-2 pb-2 text-on-surface select-none"
      style={{ bottom: navMode === "gesture" ? "1.5rem" : "3rem" }}
    >
      {[...rows, BOTTOM.join("\u0000")].map((row, rowIndex) => (
        <div key={rowIndex} className="flex justify-center gap-1.5">
          {(rowIndex === 3 ? row.split("\u0000") : Array.from(row)).map(key => (
            <button
              key={key}
              type="button"
              onPointerDown={startPress(key)}
              onPointerUp={endPress}
              onPointerLeave={endPress}
              className={`relative grid h-11 min-w-0 place-items-center rounded-lg text-title ${keyClass(key)}`}
            >
              {label(key)}
              {pressed === key && !special(key) && key.length === 1 && (
                <span className="absolute -top-12 grid h-12 w-10 place-items-center rounded-lg bg-surface-highest text-headline-sm shadow-lg">{caseOf(key)}</span>
              )}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
