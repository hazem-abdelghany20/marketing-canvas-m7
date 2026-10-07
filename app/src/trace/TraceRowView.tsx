import { useEffect, useId, useRef, type CSSProperties, type KeyboardEvent } from "react";
import { TYPE_BG, TypeChip } from "../components/TypeChip";
import { prefersReducedMotion } from "../lib/motion";
import { plural } from "../lib/format";
import type { NodeType } from "../types";
import { PhoneIcon } from "../phone/icons";
import { COPY, traceAdd } from "../ui/copy";
import { rowLabel, type TraceCard, type TraceRow } from "./traceModel";

/** The next card shows this much beyond the one on screen: how a row says it can be swiped. */
const PEEK = 44;
/** More cards than this and the dots would run off the row: the count says it instead. */
const MAX_DOTS = 8;

const COUNT_OF: Record<NodeType, [string, string]> = {
  goal: ["goal", "goals"],
  strategy: ["strategy", "strategies"],
  campaign: ["campaign", "campaigns"],
  content: ["piece of content", "pieces of content"],
  asset: ["asset", "assets"],
  note: ["note", "notes"],
};

/** What the row's list is called: the layer it holds, in the plural ("Strategies"), or "Served by" for a row of several. */
function listName(row: TraceRow): string {
  if (!row.type) return "Served by";
  const plural = COUNT_OF[row.type][1];
  return plural.charAt(0).toUpperCase() + plural.slice(1);
}

/** "7 under it" for a goal; "1 campaign", "2 pieces of content", "3 serving it" for the rest; nothing if nothing serves it. */
function servingText(card: TraceCard): string | null {
  if (card.node.type === "goal" && card.under > 0) return `${card.under} under it`;
  if (card.serving === 0) return null;
  if (card.servingType) return plural(card.serving, ...COUNT_OF[card.servingType]);
  return `${card.serving} serving it`;
}

/** A layer's colour, as the `--t` the mockup paints a row with: its label's dot, its served-by line, its cards' bars. */
const layerColour = (type: NodeType | null) => (type ? `var(--node-${type})` : "var(--border-strong)");

function Chip({ children, dot, accent }: { children: string; dot?: NodeType; accent?: boolean }) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-[5px] whitespace-nowrap rounded-full border border-strong bg-panel px-2 py-0.5 text-[11px] ${accent ? "text-accent" : "text-primary"}`}
    >
      {dot ? <span aria-hidden="true" className={`size-[7px] flex-none rounded-full ${TYPE_BG[dot]}`} /> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}

interface TraceRowViewProps {
  row: TraceRow;
  /** The title of the card this row hangs from, for the one who cannot see the line that joins them. */
  parentTitle: string | null;
  /** A card is brought on screen: by a swipe, a dot, a tap on one peeking in, or an arrow key. */
  onChoose: (index: number) => void;
  /** The card on screen was tapped. */
  onOpen: (id: string) => void;
  /** An empty row's button: make what it expects, serving the card above. */
  onAdd: () => void;
}

/**
 * One layer of a trace: a row of cards that is swiped sideways, one on screen with the next peeking in. Scrolling
 * snaps to a card and the card it lands on is the one chosen; choosing one any other way scrolls it into place.
 */
export function TraceRowView({ row, parentTitle, onChoose, onOpen, onAdd }: TraceRowViewProps) {
  const label = rowLabel(row);
  const count = row.cards.length;
  const track = useRef<HTMLUListElement>(null);
  const cards = useRef(new Map<string, HTMLButtonElement>());
  const settle = useRef<number | undefined>(undefined);
  /** Set while the row is being scrolled by us, so the scroll's own events are not mistaken for a swipe. */
  const ours = useRef<number | undefined>(undefined);
  const mounted = useRef(false);
  const chipsId = useId();

  /** How far one card is from the next, which is what a swipe snaps to. Zero until the row has been laid out. */
  function step(): number {
    const items = track.current?.querySelectorAll<HTMLElement>(":scope > li[data-card]");
    if (!items || items.length < 2) return 0;
    return items[1]!.offsetLeft - items[0]!.offsetLeft;
  }

  // A card chosen any way but by scrolling is scrolled to: in place at first, then smoothly.
  useEffect(() => {
    const el = track.current;
    const each = step();
    if (!el || each <= 0) return;
    const left = row.selected * each;
    const instant = !mounted.current || prefersReducedMotion();
    mounted.current = true;
    if (Math.abs(el.scrollLeft - left) <= 2) return;
    window.clearTimeout(ours.current);
    ours.current = window.setTimeout(() => (ours.current = undefined), 700);
    el.scrollTo({ left, behavior: instant ? "auto" : "smooth" });
  }, [row.selected]);

  useEffect(
    () => () => {
      window.clearTimeout(settle.current);
      window.clearTimeout(ours.current);
    },
    [],
  );

  function onScroll() {
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      const el = track.current;
      const each = step();
      if (!el || each <= 0) return;
      // Our own scroll lands on the card it was sent to; there is nothing to choose.
      if (ours.current !== undefined) return;
      const index = Math.min(count - 1, Math.max(0, Math.round(el.scrollLeft / each)));
      if (index !== row.selected) onChoose(index);
    }, 90);
  }

  function onKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const next = row.selected + (event.key === "ArrowRight" ? 1 : -1);
    if (next < 0 || next >= count) return;
    event.preventDefault();
    onChoose(next);
    // Focus goes with the card, without a jump that would fight the scroll.
    requestAnimationFrame(() => cards.current.get(row.cards[next]!.node.id)?.focus({ preventScroll: true }));
  }

  const heading = (
    <div className="flex items-center gap-2 px-[18px] pb-1.5">
      <h2 className="m-0 font-mono text-[11px] font-medium uppercase leading-none tracking-[0.06em] text-muted">{label}</h2>
      {count > 0 ? (
        <span className="font-mono text-[11px] font-medium leading-none text-muted">{`${row.selected + 1} of ${count}`}</span>
      ) : null}
      {count > 1 && count <= MAX_DOTS ? (
        <span className="ml-auto flex items-center gap-[5px]">
          {row.cards.map((card, index) => (
            <button
              key={card.node.id}
              type="button"
              aria-label={`${label} ${index + 1}`}
              aria-current={index === row.selected ? "true" : undefined}
              onClick={() => onChoose(index)}
              className="flex h-[7px] border-0 bg-transparent p-0"
            >
              <span
                aria-hidden="true"
                className={`h-[7px] transition-[width,background-color] ${
                  index === row.selected ? "w-4 rounded-[4px] bg-[var(--t)]" : "w-[7px] rounded-full bg-[var(--border-strong)]"
                }`}
              />
            </button>
          ))}
        </span>
      ) : null}
    </div>
  );

  // The line from the row above, in this row's colour, in the gap between them.
  const connector =
    row.depth > 0 ? (
      <p
        data-served-by
        className="absolute left-[30px] top-[3px] m-0 h-4 border-l-2 border-[var(--t)] pl-3 font-mono text-[10px] font-medium leading-4 tracking-[0.04em] text-muted"
      >
        <span aria-hidden="true">{COPY.traceServedBy}</span>
        <span className="sr-only">{parentTitle ? `Serves ${parentTitle}` : COPY.traceServedBy}</span>
      </p>
    ) : null;

  const rowStyle = { "--t": layerColour(row.type) } as CSSProperties;
  const rowClass = row.depth === 0 ? "relative" : "relative pt-[22px]";

  if (count === 0) {
    return (
      <section role="group" aria-label={`${label}, empty`} data-trace-row={row.depth} style={rowStyle} className={rowClass}>
        {connector}
        {heading}
        <div className="mx-4 min-h-[74px] rounded-lg border border-dashed border-subtle py-2.5 pl-[15px] pr-3 text-[13.5px] text-muted">
          {COPY.traceNothingServes}
          {row.addType ? (
            <div className="mt-2">
              <button
                type="button"
                onClick={onAdd}
                className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[10px] border border-strong bg-transparent px-3.5 text-[13.5px] font-medium text-primary"
              >
                <PhoneIcon name="plus" size={16} />
                {traceAdd(row.addType)}
              </button>
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section
      role="group"
      aria-label={`${label}, ${row.selected + 1} of ${count}`}
      data-trace-row={row.depth}
      style={rowStyle}
      className={rowClass}
    >
      {connector}
      {heading}
      <ul
        ref={track}
        role="list"
        aria-label={listName(row)}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        className="m-0 flex snap-x snap-mandatory list-none gap-2.5 overflow-x-auto scroll-px-4 px-4 pb-0.5 [overscroll-behavior-x:contain] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {row.cards.map((card, index) => {
          const current = index === row.selected;
          const title = card.node.title.trim() || "Untitled";
          const serving = servingText(card);
          const joined = card.related;
          const hasChips = Boolean(serving) || joined.length > 0 || card.notes > 0;
          const goal = row.depth === 0;
          return (
            <li
              key={card.node.id}
              data-card
              style={{ width: count === 1 ? "100%" : `calc(100% - ${PEEK}px)` }}
              className="flex flex-none snap-start"
            >
              <button
                ref={(el) => {
                  if (el) cards.current.set(card.node.id, el);
                  else cards.current.delete(card.node.id);
                }}
                type="button"
                data-trace-card={card.node.id}
                aria-current={current ? "true" : undefined}
                aria-label={`${title}, ${card.node.type.charAt(0).toUpperCase() + card.node.type.slice(1)}`}
                aria-describedby={hasChips ? `${chipsId}-${card.node.id}` : undefined}
                onClick={() => (current ? onOpen(card.node.id) : onChoose(index))}
                // Stretched to the row's tallest card. The one on screen takes 55% of its layer's colour into its border;
                // the ones peeking in are faded to half, as the mockup draws them.
                className={[
                  "relative block w-full rounded-lg border bg-elevated text-left [touch-action:manipulation] transition-[opacity,border-color] duration-200",
                  goal ? "min-h-[104px] pb-3 pl-[17px] pr-3.5 pt-3.5" : "min-h-[74px] py-2.5 pl-[15px] pr-3",
                  current ? "border-[color-mix(in_srgb,var(--t)_55%,var(--border-subtle))]" : "border-subtle opacity-50",
                ].join(" ")}
              >
                <span
                  aria-hidden="true"
                  className={`absolute bottom-2.5 left-0 top-2.5 w-[3px] rounded-r-[3px] ${TYPE_BG[card.node.type]}`}
                />
                {row.type === null ? <TypeChip type={card.node.type} className="mb-1" /> : null}
                <span
                  className={`block leading-[1.3] text-primary ${goal ? "text-[18px] font-semibold tracking-[-0.01em]" : "text-[14.5px] font-medium"}`}
                >
                  {title}
                </span>
                {card.node.body ? (
                  // No `block` here: it would beat line-clamp's own display and let the summary run on.
                  <span
                    data-card-body
                    className={`mt-[3px] text-muted ${goal ? "line-clamp-2 text-[13px]" : "line-clamp-1 text-[12.5px]"}`}
                  >
                    {card.node.body}
                  </span>
                ) : null}
                {hasChips ? (
                  <span id={`${chipsId}-${card.node.id}`} className="mt-2 flex flex-wrap gap-[5px]">
                    {serving ? <Chip>{serving}</Chip> : null}
                    {joined.map((other) => (
                      <Chip key={other.id} dot={other.type}>
                        {other.title.trim() || "Untitled"}
                      </Chip>
                    ))}
                    {card.notes > 0 ? <Chip accent>{plural(card.notes, "note")}</Chip> : null}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
        {/* Room for the last card to come all the way to the left, as the others do. */}
        {count > 1 ? <li aria-hidden="true" className="w-[44px] flex-none" /> : null}
      </ul>
    </section>
  );
}
