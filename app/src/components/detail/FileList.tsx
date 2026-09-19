import { FileImage, FileText } from "lucide-react";
import { useRef, useState } from "react";
import { useStore } from "zustand";
import { reportSaveFailure, undoLast } from "../../canvas/actions";
import { FILE_ACCEPT, partitionFiles, registerFile, rejectionMessages } from "../../files/importFiles";
import { formatBytes } from "../../lib/format";
import { appStore } from "../../store";
import type { CanvasNode, FileRef } from "../../types";
import { COPY } from "../../ui/copy";
import { uiStore } from "../../ui/uiStore";
import { Button } from "../Button";
import { ConfirmRemove } from "./ConfirmRemove";
import { Section } from "./Section";
import type { Autosave } from "./useAutosave";

/** S4 — the node's files. Same accept and size rules as a drop on the canvas. */
export function FileList({ node, save }: { node: CanvasNode; save: Autosave["save"] }) {
  const files = useStore(appStore, (s) => s.files);
  const objectUrls = useStore(appStore, (s) => s.objectUrls);
  const picker = useRef<HTMLInputElement>(null);
  const rows = node.fileIds.map((id) => files[id]).filter((f): f is FileRef => Boolean(f));

  async function attach(picked: File[]) {
    const { accepted, rejected } = partitionFiles(picked);
    const messages = rejectionMessages(rejected, accepted.length);
    const ids: string[] = [];
    for (const item of accepted) {
      try {
        ids.push((await registerFile(item, { store: appStore, ui: uiStore })).id);
      } catch (error) {
        messages.push((error as Error).message);
      }
    }
    const current = appStore.getState().nodes[node.id];
    if (current && ids.length > 0) await save({ fileIds: [...current.fileIds, ...ids] });
    if (messages.length > 0) uiStore.getState().toast({ message: messages.join(" "), tone: "warn", durationMs: 9000 });
  }

  function detach(file: FileRef) {
    const fileIds = (appStore.getState().nodes[node.id]?.fileIds ?? []).filter((id) => id !== file.id);
    appStore
      .getState()
      .updateNode(node.id, { fileIds })
      .then(() =>
        uiStore
          .getState()
          .toast({
            message: `Removed ${file.name}.`,
            tone: "success",
            actionLabel: "Undo",
            onAction: () => undoLast(),
          }),
      )
      .catch(() => reportSaveFailure(() => detach(file)));
  }

  return (
    <Section
      title="Files"
      action={
        <Button className="!px-2 !py-1 text-xs" onClick={() => picker.current?.click()}>
          + Attach
        </Button>
      }
    >
      <input
        ref={picker}
        type="file"
        multiple
        hidden
        accept={FILE_ACCEPT}
        data-attach-input
        onChange={(event) => {
          const picked = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (picked.length > 0) void attach(picked);
        }}
      />
      {rows.length === 0 ? (
        <p className="m-0 text-[13px] text-muted">{COPY.noFiles}</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {rows.map((file) => (
            <FileRow key={file.id} file={file} url={objectUrls[file.id] ?? null} onRemove={() => detach(file)} />
          ))}
        </ul>
      )}
    </Section>
  );
}

function FileRow({ file, url, onRemove }: { file: FileRef; url: string | null; onRemove: () => void }) {
  const [previewing, setPreviewing] = useState(false);
  const reattach = useRef<HTMLInputElement>(null);
  const image = file.mime.startsWith("image/");
  const Icon = image ? FileImage : FileText;

  function giveBytes(picked: File | undefined) {
    if (!picked) return;
    const { accepted, rejected } = partitionFiles([picked]);
    if (accepted.length === 0) {
      uiStore.getState().toast({ message: rejectionMessages(rejected, 0).join(" "), tone: "warn" });
      return;
    }
    // The record already exists; only the bytes were lost with the reload.
    appStore.getState().setObjectUrl(file.id, URL.createObjectURL(picked));
  }

  return (
    <li data-file-row={file.id} className="border-b border-subtle py-2 last:border-b-0">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 flex-none place-items-center overflow-hidden rounded-sm border border-subtle bg-elevated text-muted">
          {image && url ? (
            <img src={url} alt="" className="size-full object-cover" />
          ) : (
            <Icon size={15} aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] text-primary">{file.name}</div>
          <div className={`font-mono text-[10px] ${url ? "text-muted" : "text-warn"}`}>
            {url ? formatBytes(file.sizeBytes) : COPY.fileMissing}
          </div>
        </div>
        {url ? (
          <Button
            className="!px-2 !py-1 text-[11.5px]"
            aria-label={`${image ? "Preview" : "Open"} ${file.name}`}
            aria-expanded={image ? previewing : undefined}
            onClick={() => (image ? setPreviewing((p) => !p) : window.open(url, "_blank", "noopener,noreferrer"))}
          >
            {image ? (previewing ? "Hide" : "Preview") : "Open"}
          </Button>
        ) : (
          <>
            <input
              ref={reattach}
              type="file"
              hidden
              accept={FILE_ACCEPT}
              onChange={(event) => {
                giveBytes(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <Button
              className="!px-2 !py-1 text-[11.5px]"
              aria-label={`Re-attach ${file.name}`}
              onClick={() => reattach.current?.click()}
            >
              Re-attach
            </Button>
          </>
        )}
        <ConfirmRemove label={`Remove ${file.name}`} onConfirm={onRemove} />
      </div>
      {previewing && url ? (
        <img src={url} alt={file.name} className="mt-2 max-h-64 w-full rounded-sm object-contain" />
      ) : null}
    </li>
  );
}
