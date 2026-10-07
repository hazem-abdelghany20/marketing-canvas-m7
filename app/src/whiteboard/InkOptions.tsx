import { useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { INK_COLORS, INK_SIZES, inkColorValue } from "./inkPalette";
import { uiStore, useUi } from "../ui/uiStore";

/** The phone's ink bar is the mockup's five: Plum stays the desktop's (030). */
const PHONE_INKS = INK_COLORS.filter((color) => color.id !== "ink-5");

/**
 * The pen's colour and width, beside the dock while the Pen or the Highlighter is in hand. Each row is a
 * radio group: the chosen one is the only tab stop, and the arrow keys move between them.
 *
 * On a phone (`layout="bar"`) it is the mockup's one row above the dock: five inks, and the width as a tap that steps.
 */
export function InkOptions({ layout = "column" }: { layout?: "column" | "bar" }) {
  const tool = useUi((s) => s.tool);
  const ink = useUi((s) => s.ink);
  if (tool !== "pen" && tool !== "highlighter") return null;

  if (layout === "bar") {
    const at = Math.max(0, INK_SIZES.findIndex((size) => size.width === ink.size));
    const width = INK_SIZES[at]!;
    const nextWidth = INK_SIZES[(at + 1) % INK_SIZES.length]!;
    return (
      <div
        data-ink-options
        data-layout="bar"
        className="absolute inset-x-0 bottom-[74px] z-40 mx-auto flex w-fit animate-mc-rise items-center gap-2.5 whitespace-nowrap rounded-[14px] border border-subtle bg-panel px-3 py-2 shadow-[0_6px_18px_-8px_rgba(30,20,10,.25)]"
      >
        <Choices label="Ink colour" gap="gap-2.5">
          {PHONE_INKS.map((color) => (
            <Choice
              key={color.id}
              label={color.label}
              checked={ink.color === color.id}
              onChoose={() => uiStore.getState().setInk({ color: color.id })}
              className="size-[22px] rounded-full border-2 border-solid border-[var(--bg-panel)]"
              checkedClassName="shadow-[0_0_0_2px_var(--fg-primary)]"
              style={{ background: inkColorValue(color.id) }}
              plain
              ring="shadow-[0_0_0_1px_var(--border-strong)]"
            />
          ))}
        </Choices>
        <span aria-hidden="true" className="h-5 w-px bg-[var(--border-strong)]" />
        {/* The width is one tap that steps through the three, where the mockup shows it as a label. */}
        <button
          type="button"
          aria-label={`Stroke width: ${width.label}. Tap for ${nextWidth.label.toLowerCase()}`}
          onClick={() => uiStore.getState().setInk({ size: nextWidth.width })}
          className="border-0 bg-transparent p-0 font-mono text-[12px] text-muted [touch-action:manipulation]"
        >
          {`${width.width} px`}
        </button>
      </div>
    );
  }

  return (
    <div
      data-ink-options
      className="absolute left-[66px] top-[66px] z-40 flex animate-mc-rise flex-col items-center gap-2 rounded-lg border border-subtle bg-panel px-[9px] py-2.5 shadow-[0_8px_26px_-18px_rgba(0,0,0,.5)] max-[899px]:top-[100px]"
    >
      <Choices label="Ink colour" columns={2} gap="gap-2">
        {INK_COLORS.map((color) => (
          <Choice
            key={color.id}
            label={color.label}
            checked={ink.color === color.id}
            onChoose={() => uiStore.getState().setInk({ color: color.id })}
            className="size-[18px] rounded-full border-2"
            style={{ background: inkColorValue(color.id) }}
          />
        ))}
      </Choices>
      <span aria-hidden="true" className="h-px w-full bg-[var(--border-subtle)]" />
      <Choices label="Stroke width" gap="gap-0.5">
        {INK_SIZES.map((size) => (
          <Choice
            key={size.label}
            label={size.label}
            checked={ink.size === size.width}
            onChoose={() => uiStore.getState().setInk({ size: size.width })}
            className="grid size-[26px] place-items-center rounded-md border"
            checkedClassName="border-strong bg-rail"
          >
            <span
              aria-hidden="true"
              className="rounded-full"
              style={{ width: size.width + 4, height: size.width + 4, background: inkColorValue(ink.color) }}
            />
          </Choice>
        ))}
      </Choices>
    </div>
  );
}

function Choices({ label, columns, gap, children }: { label: string; columns?: number; gap: string; children: ReactNode }) {
  const group = useRef<HTMLDivElement>(null);

  // The arrow keys move the choice, and focus with it.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    const radios = Array.from(group.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []);
    const at = radios.findIndex((r) => r === document.activeElement);
    if (at === -1) return;
    event.preventDefault();
    const next = radios[(at + step + radios.length) % radios.length]!;
    next.focus();
    next.click();
  }

  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={columns ? `grid gap-2 ${gap}` : `flex ${gap}`}
      style={columns ? { gridTemplateColumns: `repeat(${columns}, 18px)` } : undefined}
    >
      {children}
    </div>
  );
}

interface ChoiceProps {
  label: string;
  checked: boolean;
  onChoose: () => void;
  className: string;
  checkedClassName?: string;
  style?: CSSProperties;
  children?: ReactNode;
  /** No hairline or border of its own: the choice is drawn by what is inside it (the phone's bar). */
  plain?: boolean;
  /** For a plain choice: its ring while not chosen. */
  ring?: string;
}

function Choice({ label, checked, onChoose, className, checkedClassName, style, children, plain = false, ring }: ChoiceProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={label}
      title={label}
      tabIndex={checked ? 0 : -1}
      onClick={onChoose}
      style={style}
      className={[
        "cursor-pointer",
        plain ? "p-0" : "shadow-[inset_0_0_0_1px_var(--border-subtle)]",
        plain && !className.includes("border-") ? "border-0" : "",
        className,
        checked ? (checkedClassName ?? "border-primary") : plain ? (ring ?? "bg-transparent") : "border-transparent",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
