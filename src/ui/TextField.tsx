import { useId, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import { COMMON, useT } from "../kernel";
import { Icon, IconButton } from "./Button";

type Native = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "size">;

interface TextFieldProps extends Native {
  label: string;
  value: string;
  onChange: (value: string) => void;
  trailing?: ReactNode;
  error?: string;
  onEnter?: () => void;
}

/** M3 filled text field with a floating label. */
export function TextField({ label, value, onChange, trailing, error, onEnter, className = "", ...rest }: TextFieldProps) {
  const id = useId();
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" && onEnter) {
      event.preventDefault();
      onEnter();
    }
  };
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className={`relative flex items-center rounded-t-md border-b bg-surface-highest pl-4 ${error ? "border-error" : "border-on-surface-variant focus-within:border-b-2 focus-within:border-primary"}`}
      >
        <span className="relative flex-1">
          <input
            id={id}
            value={value}
            placeholder=" "
            onChange={event => onChange(event.target.value)}
            onKeyDown={onKeyDown}
            className="peer w-full bg-transparent pt-6 pb-2 text-body-lg text-on-surface outline-none"
            {...rest}
          />
          <span
            className={`anim pointer-events-none absolute top-1.5 left-0 text-body-sm peer-placeholder-shown:top-4 peer-placeholder-shown:text-body-lg peer-focus:top-1.5 peer-focus:text-body-sm ${error ? "text-error" : "text-on-surface-variant peer-focus:text-primary"}`}
          >
            {label}
          </span>
        </span>
        <span className="pr-1">{trailing}</span>
      </label>
      {error && <p className="px-4 pt-1 text-body-sm text-error">{error}</p>}
    </div>
  );
}

export function SearchField({ value, onChange, placeholder, autoFocus }: { value: string; onChange: (value: string) => void; placeholder: string; autoFocus?: boolean }) {
  const t = useT(COMMON);
  return (
    <div className="flex h-14 items-center gap-1 rounded-full bg-surface-high px-1 text-on-surface">
      <Icon name="search" className="mx-3 text-on-surface-variant" />
      <input
        value={value}
        autoFocus={autoFocus}
        aria-label={placeholder}
        placeholder={placeholder}
        onChange={event => onChange(event.target.value)}
        className="min-w-0 flex-1 bg-transparent text-body-lg outline-none placeholder:text-on-surface-variant"
      />
      {value && <IconButton icon="close" label={t("close")} onClick={() => onChange("")} />}
    </div>
  );
}
