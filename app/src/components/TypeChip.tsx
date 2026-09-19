import type { NodeType } from "../types";

export const NODE_TYPES: NodeType[] = ["goal", "strategy", "campaign", "content", "asset", "note"];

/** What each type means, from docs/spec.md § Data model — shown wherever a type is picked. */
export const TYPE_MEANS: Record<NodeType, string> = {
  goal: "Outcome with a number and a horizon",
  strategy: "Positioning, ICP, messaging",
  campaign: "A time-boxed push",
  content: "One produced piece",
  asset: "A raw uploaded file",
  note: "Freeform annotation",
};

// Written out in full so Tailwind can see every class. Color comes only from --node-{type}.
export const TYPE_BG: Record<NodeType, string> = {
  goal: "bg-node-goal",
  strategy: "bg-node-strategy",
  campaign: "bg-node-campaign",
  content: "bg-node-content",
  asset: "bg-node-asset",
  note: "bg-node-note",
};

export function typeLabel(type: NodeType): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

interface TypeChipProps {
  type: NodeType;
  /** `plain` is the mono caption used on cards; `pill` is the bordered chip used in panels. */
  look?: "plain" | "pill";
  className?: string;
}

/** Color dot + label. The label is always there: type is never signalled by color alone. */
export function TypeChip({ type, look = "plain", className = "" }: TypeChipProps) {
  return (
    <span
      data-type-chip={type}
      className={[
        "inline-flex items-center gap-1.5",
        look === "pill"
          ? "rounded-full border border-subtle bg-elevated px-2.5 py-1 text-xs font-medium"
          : "font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted",
        className,
      ].join(" ")}
    >
      <span aria-hidden="true" data-type-dot className={`size-[7px] flex-none rounded-full ${TYPE_BG[type]}`} />
      <span>{typeLabel(type)}</span>
    </span>
  );
}
