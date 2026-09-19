import { useEffect, useState, type DragEvent, type ReactNode } from "react";

function carriesFiles(data: DataTransfer | null): boolean {
  return Boolean(data && Array.from(data.types).includes("Files"));
}

interface FileDropZoneProps {
  /** Off while connect mode is on: two gestures can't share the canvas. */
  enabled: boolean;
  onFiles: (files: File[], at: { clientX: number; clientY: number }) => void;
  children: ReactNode;
}

/**
 * O2 — the canvas as a drop target. Shows an outline while files are dragged
 * over it, and hands them over with the screen point they were dropped at.
 */
export function FileDropZone({ enabled, onFiles, children }: FileDropZoneProps) {
  const [over, setOver] = useState(false);

  // A file dropped anywhere else, or while the zone is off, must not make the
  // browser navigate away to show it.
  useEffect(() => {
    const swallow = (event: globalThis.DragEvent) => {
      if (carriesFiles(event.dataTransfer)) event.preventDefault();
    };
    window.addEventListener("dragover", swallow);
    window.addEventListener("drop", swallow);
    return () => {
      window.removeEventListener("dragover", swallow);
      window.removeEventListener("drop", swallow);
    };
  }, []);

  useEffect(() => {
    if (!enabled) setOver(false);
  }, [enabled]);

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (!enabled || !carriesFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setOver(true);
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    const next = event.relatedTarget;
    if (!(next instanceof Node) || !event.currentTarget.contains(next)) setOver(false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    setOver(false);
    if (!enabled || !carriesFiles(event.dataTransfer)) return;
    event.preventDefault();
    onFiles(Array.from(event.dataTransfer.files), { clientX: event.clientX, clientY: event.clientY });
  }

  return (
    <div data-drop-zone className="absolute inset-0" onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      {children}
      {over && enabled ? (
        <div
          data-drop-outline
          className="pointer-events-none absolute inset-2.5 z-10 grid place-items-center rounded-lg border-2 border-dashed border-accent bg-[color-mix(in_srgb,var(--accent)_5%,transparent)]"
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.13em] text-accent">Drop to add asset nodes</span>
        </div>
      ) : null}
    </div>
  );
}
