import { useMemo, useState } from "react";
import { appStore, COMMON, locale, useLang, useT, type AppDef, type AppProps } from "../kernel";
import { Chip, EmptyState, Icon, IconButton, ListItem, Scaffold } from "../ui";

const S = {
  ...COMMON,
  name: ["Hesap Makinesi", "Calculator"],
  description: ["Bilimsel işlevli hesap makinesi ve geçmiş", "Scientific calculator with history"],
  history: ["Geçmiş", "History"],
  clearHistory: ["Geçmişi temizle", "Clear history"],
  noHistory: ["Henüz hesap yok", "No calculations yet"],
  scientific: ["Bilimsel", "Scientific"],
  badExpression: ["Hatalı ifade", "Bad expression"],
  divideByZero: ["Sıfıra bölünemez", "Can't divide by 0"],
  degrees: ["DER", "DEG"], radians: ["RAD", "RAD"],
} as const;

export class CalcError extends Error {}

type Operand = { value: number; percent: boolean };
type Token = { kind: "num"; value: number } | { kind: "op"; value: string } | { kind: "name"; value: string };

const FUNCTIONS = ["sin", "cos", "tan", "ln", "log", "√"];
const CONSTANTS: Record<string, number> = { π: Math.PI, e: Math.E };

function tokenize(source: string): Token[] {
  const text = source.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/,/g, ".");
  const tokens: Token[] = [];
  for (let index = 0; index < text.length; ) {
    const rest = text.slice(index);
    const number = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/.exec(rest);
    const name = /^(sin|cos|tan|ln|log|√|π|e)/.exec(rest);
    if (/^\s/.test(rest)) index++;
    else if (number) {
      tokens.push({ kind: "num", value: Number(number[0]) });
      index += number[0].length;
    } else if (name) {
      tokens.push({ kind: "name", value: name[0] });
      index += name[0].length;
    } else if ("+-*/^()!%".includes(rest[0])) tokens.push({ kind: "op", value: text[index++] });
    else throw new CalcError(`unexpected ${rest[0]}`);
  }
  return tokens;
}

function factorial(value: number): number {
  if (value < 0 || !Number.isInteger(value) || value > 170) throw new CalcError("factorial");
  let result = 1;
  for (let step = 2; step <= value; step++) result *= step;
  return result;
}

/**
 * Precedence, loosest first: + −, × ÷ (and implicit 2π), unary −, ^ (right-assoc), postfix ! %.
 * So −2^2 = −4 and 2^3^2 = 512. "a + b%" means a plus b percent of a, as on Pixel.
 */
export function evaluate(source: string, degrees = true): number {
  const tokens = tokenize(source);
  let position = 0;
  const peek = () => tokens[position];
  const isOp = (value: string) => peek()?.kind === "op" && peek()?.value === value;
  const startsOperand = () => {
    const token = peek();
    return !!token && (token.kind !== "op" || token.value === "(");
  };
  const toRadians = (value: number) => (degrees ? (value * Math.PI) / 180 : value);
  const apply: Record<string, (value: number) => number> = {
    sin: value => Math.sin(toRadians(value)),
    cos: value => Math.cos(toRadians(value)),
    tan: value => Math.tan(toRadians(value)),
    ln: Math.log,
    log: Math.log10,
    "√": Math.sqrt,
  };

  function primary(): number {
    const token = peek();
    if (!token) throw new CalcError("missing operand");
    position++;
    if (token.kind === "num") return token.value;
    if (token.kind === "name" && token.value in CONSTANTS) return CONSTANTS[token.value];
    if (token.kind === "name" && FUNCTIONS.includes(token.value)) return apply[token.value](power().value);
    if (token.kind === "op" && token.value === "(") {
      const value = sum();
      if (isOp(")")) position++;
      return value;
    }
    throw new CalcError(`unexpected ${token.value}`);
  }
  function postfix(): Operand {
    let value = primary();
    let percent = false;
    while (isOp("!") || isOp("%")) {
      percent = peek()?.value === "%";
      value = percent ? value / 100 : factorial(value);
      position++;
    }
    return { value, percent };
  }
  function power(): Operand {
    const base = postfix();
    if (!isOp("^")) return base;
    position++;
    return { value: base.value ** unary().value, percent: false };
  }
  function unary(): Operand {
    if (!isOp("-") && !isOp("+")) return power();
    const negative = tokens[position++].value === "-";
    const inner = unary();
    return { value: negative ? -inner.value : inner.value, percent: inner.percent };
  }
  function product(): Operand {
    let left = unary();
    while (isOp("*") || isOp("/") || startsOperand()) {
      const op = isOp("*") || isOp("/") ? tokens[position++].value : "*";
      const right = unary().value;
      if (op === "/" && right === 0) throw new CalcError("divide by zero");
      left = { value: op === "*" ? left.value * right : left.value / right, percent: false };
    }
    return left;
  }
  function sum(): number {
    let value = product().value;
    while (isOp("+") || isOp("-")) {
      const op = tokens[position++].value;
      const right = product();
      const amount = right.percent ? value * right.value : right.value;
      value = op === "+" ? value + amount : value - amount;
    }
    return value;
  }

  const result = sum();
  if (position < tokens.length) throw new CalcError("trailing input");
  if (!Number.isFinite(result)) throw new CalcError("not finite");
  return result;
}

const useCalc = appStore("calculator", { history: [] as { expression: string; result: string }[], scientific: false, degrees: true });

const KEYS = ["AC", "(", ")", "÷", "7", "8", "9", "×", "4", "5", "6", "−", "1", "2", "3", "+", "0", ".", "⌫", "="];
const TONES: Record<string, string> = { "=": "bg-primary text-on-primary", AC: "bg-tertiary-container text-on-tertiary-container" };
const SCIENTIFIC = ["sin", "cos", "tan", "^", "ln", "log", "√", "!", "π", "e", "%", "DEG"];

function Calculator({ route, os }: AppProps) {
  const t = useT(S);
  const lang = useLang();
  const { history, scientific, degrees } = useCalc();
  const [expression, setExpression] = useState("");
  const [error, setError] = useState("");
  const format = (value: number) => new Intl.NumberFormat(locale(lang), { maximumSignificantDigits: 12 }).format(value);
  const shown = (text: string) => (lang === "tr" ? text.replace(/\./g, ",") : text);

  const preview = useMemo(() => {
    try {
      return /[+\-−×÷*/^!%(a-zπ√]/.test(expression) ? format(evaluate(expression, degrees)) : "";
    } catch {
      return "";
    }
  }, [expression, degrees, lang]);

  const press = (key: string) => {
    setError("");
    if (key === "AC") return setExpression("");
    if (key === "⌫") return setExpression(expression.slice(0, -1));
    if (key === "DEG") return useCalc.setState({ degrees: !degrees });
    if (key === "=") {
      try {
        const value = evaluate(expression, degrees);
        const result = String(Number(value.toPrecision(12)));
        useCalc.setState({ history: [{ expression, result }, ...history].slice(0, 100) });
        setExpression(result);
      } catch (failure) {
        setError(t(failure instanceof CalcError && failure.message === "divide by zero" ? "divideByZero" : "badExpression"));
        os.vibrate(40);
      }
      return;
    }
    setExpression(expression + (FUNCTIONS.includes(key) ? `${key}(` : key));
  };

  const reuse = (value: string) => {
    setExpression(value);
    os.back();
  };

  if (route === "history") {
    return (
      <Scaffold title={t("history")} onBack={os.back} actions={<IconButton icon="delete_sweep" label={t("clearHistory")} onClick={() => useCalc.setState({ history: [] })} />}>
        {history.length === 0 ? (
          <EmptyState icon="history" title={t("noHistory")} />
        ) : (
          history.map((entry, index) => (
            <ListItem
              key={index}
              headline={shown(entry.expression)}
              supporting={`= ${format(Number(entry.result))}`}
              onClick={() => reuse(entry.result)}
            />
          ))
        )}
      </Scaffold>
    );
  }

  const tone = (key: string) => TONES[key] ?? (/[\d.⌫]/.test(key) ? "bg-surface-high" : "bg-secondary-container text-on-secondary-container");
  return (
    <Scaffold
      title=""
      actions={
        <>
          <Chip label={t("scientific")} selected={scientific} onClick={() => useCalc.setState({ scientific: !scientific })} />
          <IconButton icon="history" label={t("history")} onClick={() => os.push("history")} />
        </>
      }
    >
      <div className="flex h-full flex-col">
        <div className="flex flex-1 flex-col items-end justify-end gap-2 overflow-hidden px-6 pb-4">
          <p aria-live="polite" className="w-full text-right text-[2.75rem] leading-tight break-all text-on-surface">{shown(expression) || "0"}</p>
          <p className="h-8 text-headline-sm text-on-surface-variant">{error || (preview && `= ${preview}`)}</p>
        </div>
        {scientific && (
          <div className="grid grid-cols-6 gap-2 px-4 pb-2">
            {SCIENTIFIC.map(key => (
              <button key={key} type="button" onClick={() => press(key)} className="ripple h-10 rounded-full text-label text-on-surface-variant">
                {key === "DEG" ? t(degrees ? "degrees" : "radians") : key}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-4 gap-3 px-4 pb-4">
          {KEYS.map(key => (
            <button key={key} type="button" aria-label={key === "⌫" ? t("delete") : key} onClick={() => press(key)} className={`ripple grid aspect-square place-items-center rounded-[2rem] text-headline-sm active:rounded-2xl ${tone(key)}`}>
              {key === "⌫" ? <Icon name="backspace" /> : shown(key)}
            </button>
          ))}
        </div>
      </div>
    </Scaffold>
  );
}

export default {
  id: "calculator",
  name: S.name,
  icon: "calculate",
  tint: { hue: 55 },
  description: S.description,
  Component: Calculator,
} satisfies AppDef;
