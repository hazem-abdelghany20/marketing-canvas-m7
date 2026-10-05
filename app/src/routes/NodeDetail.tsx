import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useStore } from "zustand";
import { isTypingTarget } from "../canvas/useWorkspaceShortcuts";
import { Button } from "../components/Button";
import { ErrorState } from "../components/ErrorState";
import { AnnotationList } from "../components/detail/AnnotationList";
import { BodyEditor } from "../components/detail/BodyEditor";
import { ConnectionList } from "../components/detail/ConnectionList";
import { FileList } from "../components/detail/FileList";
import { TitleField } from "../components/detail/TitleField";
import { TypePicker } from "../components/detail/TypePicker";
import { useAutosave, type SaveStatus } from "../components/detail/useAutosave";
import { appStore } from "../store";
import type { CanvasNode } from "../types";
import { COPY } from "../ui/copy";
import { uiStore } from "../ui/uiStore";

/**
 * S4 — a right-hand panel over the canvas, deep-linkable at /node/:id. The
 * canvas stays mounted and visible behind it; below 900px it becomes a sheet.
 */
export default function NodeDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const status = useStore(appStore, (s) => s.boardStatus);
  const node = useStore(appStore, (s) => s.nodes[id]);
  const location = useLocation();
  const aside = useRef<HTMLElement>(null);
  const focusTitle = (location.state as { focusTitle?: boolean } | null)?.focusTitle === true;
  const close = () => navigate("/");

  // Opening the panel moves focus into it (a fresh node's title claims it instead), so the next Tab
  // is on its contents rather than behind every card; closing gives focus back to the node's card.
  useEffect(() => {
    if (!focusTitle) aside.current?.focus({ preventScroll: true });
  }, [id, focusTitle]);
  const latestId = useRef(id);
  latestId.current = id;
  useEffect(
    () => () => {
      requestAnimationFrame(() => {
        // Only when nothing else has taken focus in the meantime.
        if (document.activeElement && document.activeElement !== document.body) return;
        const target =
          document.querySelector<HTMLElement>(`[data-node-card="${CSS.escape(latestId.current)}"]`) ??
          document.getElementById("toolbar-add");
        target?.focus({ preventScroll: true });
      });
    },
    [],
  );

  // A node seen in this panel and then gone was deleted while open: close and say so.
  // One that was never there is a bad link, and gets its own not-found state instead.
  const seen = useRef(false);
  if (node) seen.current = true;
  useEffect(() => {
    if (status !== "ready" || node || !seen.current) return;
    seen.current = false;
    uiStore.getState().toast({ message: COPY.nodeDeletedElsewhere, tone: "warn" });
    navigate("/", { replace: true });
  }, [status, node, navigate]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (uiStore.getState().connect.active || uiStore.getState().searchOpen) return;
      // Escape in a field leaves the field first; a second Escape closes the panel.
      if (isTypingTarget(event.target)) {
        (event.target as HTMLElement).blur();
        return;
      }
      navigate("/");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  return (
    <aside
      ref={aside}
      tabIndex={-1}
      aria-label="Node detail"
      data-node-detail={id}
      className="absolute inset-y-0 right-0 z-40 flex w-[480px] max-w-full animate-mc-rise flex-col border-l border-subtle bg-panel shadow-[0_0_60px_-20px_rgba(0,0,0,.45)] max-[899px]:w-full max-[899px]:border-l-0"
    >
      {node ? (
        <NodePanel key={node.id} node={node} onClose={close} />
      ) : status === "ready" ? (
        <NotFound onClose={close} />
      ) : status === "error" ? (
        <div className="p-[26px]">
          <ErrorState
            title={COPY.nodeLoadFailed}
            message={COPY.nodeLoadFailedBody}
            actionLabel="Reload"
            onAction={() => void appStore.getState().loadBoard()}
          >
            <Button onClick={close} className="px-3 py-1.5 text-sm font-medium">
              Back to canvas
            </Button>
          </ErrorState>
        </div>
      ) : (
        <Skeleton />
      )}
    </aside>
  );
}

function NodePanel({ node, onClose }: { node: CanvasNode; onClose: () => void }) {
  const location = useLocation();
  const autosave = useAutosave(node.id);
  const focusTitle = (location.state as { focusTitle?: boolean } | null)?.focusTitle === true;

  return (
    <>
      <header className="flex flex-none flex-col gap-2.5 border-b border-subtle px-4 py-3.5">
        <div className="flex items-center justify-between gap-2.5">
          <TypePicker type={node.type} saving={autosave.saving} onChange={(type) => void autosave.save({ type })} />
          <Button
            variant="ghost"
            aria-label="Close"
            title="Close — Esc"
            onClick={onClose}
            className="!p-1.5 text-muted"
          >
            <X size={15} aria-hidden="true" />
          </Button>
        </div>
        <TitleField
          nodeId={node.id}
          title={node.title}
          save={autosave.save}
          hold={autosave.hold}
          autoFocus={focusTitle}
        />
        <SaveState status={autosave.status} />
      </header>
      {autosave.status === "error" ? (
        <p
          role="alert"
          className="m-0 flex-none border-b border-subtle bg-elevated px-4 py-2.5 text-[12.5px] text-danger"
        >
          {COPY.autosaveFailed}
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <BodyEditor body={node.body} save={autosave.save} hold={autosave.hold} />
        <FileList node={node} save={autosave.save} />
        <ConnectionList nodeId={node.id} />
        <AnnotationList nodeId={node.id} />
      </div>
    </>
  );
}

function SaveState({ status }: { status: SaveStatus }) {
  // The label stays mounted while it fades, so "Saved" eases out instead of vanishing.
  const last = useRef("");
  const label = status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "";
  if (label) last.current = label;
  return (
    <p
      role="status"
      aria-live="polite"
      data-save-state={status}
      className={`m-0 h-3.5 font-mono text-[9.5px] tracking-[0.1em] text-muted transition-opacity duration-300 ${
        label ? "opacity-100" : "opacity-0"
      }`}
    >
      {label || last.current}
    </p>
  );
}

function NotFound({ onClose }: { onClose: () => void }) {
  return <PanelMessage title={COPY.nodeMissingTitle} body={COPY.nodeMissingBody} onClose={onClose} />;
}

function PanelMessage({ title, body, onClose }: { title: string; body: string; onClose: () => void }) {
  return (
    <div className="p-[26px]">
      <h1 className="m-0 mb-2 text-[17px] font-semibold text-primary">{title}</h1>
      <p className="m-0 mb-4 text-[13.5px] leading-normal text-muted">{body}</p>
      <Button variant="primary" onClick={onClose} className="px-3.5 py-2 text-[13px]">
        Back to canvas
      </Button>
    </div>
  );
}

/** Deep-linked before the board has arrived: the panel's shape, without content. */
function Skeleton() {
  return (
    <div role="status" aria-label="Loading node" aria-busy="true" className="flex flex-col gap-4 p-4">
      <span className="h-6 w-24 animate-pulse rounded-full bg-elevated" />
      <span className="h-7 w-3/4 animate-pulse rounded-sm bg-elevated" />
      <span className="h-24 w-full animate-pulse rounded-sm bg-elevated" />
      {["w-16", "w-24", "w-20"].map((w) => (
        <span key={w} className={`h-3 ${w} animate-pulse rounded-sm bg-elevated`} />
      ))}
    </div>
  );
}
