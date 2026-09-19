import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { FileImage, FileText, Link2, MessageSquareText, Paperclip } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useCanvasActions } from "../canvas/canvasActions";
import { formatBytes, plural } from "../lib/format";
import type { CanvasNode, FileRef } from "../types";
import type { PendingImport } from "../ui/uiStore";
import { TYPE_BG, TypeChip, typeLabel } from "./TypeChip";

/** Cards are a fixed size, so layout maths never has to wait for a measurement. */
export const CARD_WIDTH = 236;
export const CARD_HEIGHT = 132;
/** How far one arrow-key press moves a focused card. */
export const NUDGE_PX = 8;

export interface CardData extends Record<string, unknown> {
  node: CanvasNode;
  fileCount: number;
  annotationCount: number;
  edgeCount: number;
  /** Open in the detail panel. */
  highlighted?: boolean;
  /** Picked as the source in connect mode. */
  connectSource?: boolean;
  /** Just connected: flashes once. */
  flashing?: boolean;
  /** Asset nodes: the first attached file, and its bytes if this tab still has them. */
  file?: FileRef | null;
  objectUrl?: string | null;
}

export type CardNode = Node<CardData, "card">;

export interface PendingData extends Record<string, unknown> {
  pending: PendingImport;
}

export type PendingNode = Node<PendingData, "pending">;

const NUDGES: Record<string, [number, number]> = {
  ArrowUp: [0, -NUDGE_PX],
  ArrowDown: [0, NUDGE_PX],
  ArrowLeft: [-NUDGE_PX, 0],
  ArrowRight: [NUDGE_PX, 0],
};

const HANDLES = [
  { id: "t", position: Position.Top },
  { id: "r", position: Position.Right },
  { id: "b", position: Position.Bottom },
  { id: "l", position: Position.Left },
];

/** One node on the canvas: type chip, title, two-line excerpt, count badges. */
export function NodeCard({ id, data, selected }: NodeProps<CardNode>) {
  const actions = useCanvasActions();
  const { node, fileCount, annotationCount, edgeCount, highlighted, connectSource, flashing } = data;
  const title = node.title.trim() || "Untitled";

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter") {
      event.preventDefault();
      actions.open(id);
      return;
    }
    const nudge = NUDGES[event.key];
    if (nudge) {
      event.preventDefault();
      event.stopPropagation();
      actions.nudge(id, nudge[0], nudge[1]);
    }
  }

  const ringed = selected || highlighted || connectSource;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${title}, ${typeLabel(node.type)}`}
      aria-pressed={selected ? true : undefined}
      data-node-card={id}
      data-type={node.type}
      onKeyDown={onKeyDown}
      className="group relative h-full w-full rounded-[9px]"
    >
      {ringed ? (
        <span
          aria-hidden="true"
          data-ring
          className={[
            "pointer-events-none absolute -inset-1 rounded-xl border-2",
            connectSource ? "animate-mc-pulse border-accent" : "border-accent",
          ].join(" ")}
        />
      ) : null}
      <article
        className={[
          "relative flex h-full w-full flex-col gap-[5px] overflow-hidden rounded-[9px] border border-subtle bg-elevated py-[11px] pl-[15px] pr-[13px] text-left",
          selected ? "shadow-[0_10px_26px_-16px_rgba(0,0,0,.5)]" : "shadow-[0_2px_6px_-4px_rgba(0,0,0,.3)]",
          flashing ? "animate-mc-flash" : "",
        ].join(" ")}
      >
        <span aria-hidden="true" data-type-bar className={`absolute inset-y-0 left-0 w-1 ${TYPE_BG[node.type]}`} />
        <TypeChip type={node.type} />
        <h3 className="m-0 line-clamp-2 text-[14.5px] font-semibold leading-[18.5px] tracking-[-0.01em] text-primary">
          {title}
        </h3>
        {node.type === "asset" && data.file ? (
          <AssetDetails file={data.file} objectUrl={data.objectUrl ?? null} />
        ) : node.body ? (
          <p data-excerpt className="m-0 line-clamp-2 text-[12.5px] leading-[17.5px] text-muted">
            {node.body}
          </p>
        ) : null}
        <div className="flex-1" />
        <Badges files={fileCount} annotations={annotationCount} edges={edgeCount} />
      </article>
      {HANDLES.map((handle) => (
        <Handle
          key={handle.id}
          id={handle.id}
          type="source"
          position={handle.position}
          className="!size-2.5 !border-2 !border-elevated !bg-strong opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        />
      ))}
    </div>
  );
}

/** Size and a thumbnail where the type allows. After a reload the bytes are gone; the record is not. */
function AssetDetails({ file, objectUrl }: { file: FileRef; objectUrl: string | null }) {
  const image = file.mime.startsWith("image/");
  const Icon = image ? FileImage : FileText;
  return (
    <div className="flex items-center gap-2.5">
      <span
        data-thumbnail
        className="grid size-10 flex-none place-items-center overflow-hidden rounded-sm border border-subtle bg-panel text-muted"
      >
        {image && objectUrl ? (
          <img src={objectUrl} alt="" className="size-full object-cover" draggable={false} />
        ) : (
          <Icon size={16} aria-hidden="true" />
        )}
      </span>
      <span className="min-w-0 font-mono text-[10px] leading-snug tracking-[0.04em] text-muted">
        <span data-file-size className="block">
          {formatBytes(file.sizeBytes)}
        </span>
        {objectUrl ? null : <span className="block">Not loaded in this tab</span>}
      </span>
    </div>
  );
}

/** A file still being read. It becomes a real asset card once the API has it. */
export function PendingCard({ data }: NodeProps<PendingNode>) {
  const { name, sizeBytes } = data.pending;
  return (
    <div
      data-pending-card
      aria-busy="true"
      className="relative flex h-full w-full flex-col gap-[5px] overflow-hidden rounded-[9px] border border-subtle bg-elevated py-[11px] pl-[15px] pr-[13px] opacity-90"
    >
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${TYPE_BG.asset}`} />
      <TypeChip type="asset" />
      <h3 className="m-0 line-clamp-2 text-[14.5px] font-semibold leading-[18.5px] text-primary">{name}</h3>
      <span className="font-mono text-[10px] text-muted">{formatBytes(sizeBytes)}</span>
      <div className="flex-1" />
      <div
        role="progressbar"
        aria-label={`Reading ${name}`}
        className="relative h-1 w-full overflow-hidden rounded-full bg-panel"
      >
        <span className="absolute inset-y-0 left-0 w-2/5 animate-mc-slide rounded-full bg-accent" />
      </div>
    </div>
  );
}

/** One badge per non-zero count; a zero count renders nothing at all. */
function Badges({ files, annotations, edges }: { files: number; annotations: number; edges: number }) {
  const badges = [
    { count: files, label: plural(files, "file"), Icon: Paperclip },
    { count: annotations, label: plural(annotations, "annotation"), Icon: MessageSquareText },
    { count: edges, label: plural(edges, "connection"), Icon: Link2 },
  ].filter((b) => b.count > 0);
  if (badges.length === 0) return null;

  return (
    <div className="flex items-center gap-[9px] font-mono text-[9.5px] tracking-[0.06em] text-muted">
      {badges.map(({ count, label, Icon }) => (
        <span key={label} data-badge aria-label={label} title={label} className="inline-flex items-center gap-1">
          <Icon size={11} aria-hidden="true" />
          {count}
        </span>
      ))}
    </div>
  );
}
