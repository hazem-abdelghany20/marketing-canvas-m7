import { useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { INK_COLORS, INK_SIZES, inkColorValue } from "./inkPalette";
import { uiStore, useUi } from "../ui/uiStore";

/**
 * The pen's colour and width, beside the dock while the Pen or the Highlighter is in hand. Each row is a
 * radio group: the chosen one is the only tab stop, and the arrow keys move between them.
 */
export function InkOptions() {
  const tool = useUi((s) => s.tool);
  const ink = useUi((s) => s.ink);
  if (tool !== "pen" && tool !== "highlighter") return null;

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
}

function Choice({ label, checked, onChoose, className, checkedClassName, style, children }: ChoiceProps) {
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
        "cursor-pointer shadow-[inset_0_0_0_1px_var(--border-subtle)]",
        className,
        checked ? (checkedClassName ?? "border-primary") : "border-transparent",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
