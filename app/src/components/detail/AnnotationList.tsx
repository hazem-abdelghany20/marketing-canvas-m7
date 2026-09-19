import { useState, type FormEvent } from "react";
import { useStore } from "zustand";
import { reportSaveFailure } from "../../canvas/actions";
import { formatTimestamp } from "../../lib/format";
import { appStore } from "../../store";
import { COPY } from "../../ui/copy";
import { Button } from "../Button";
import { ConfirmRemove } from "./ConfirmRemove";
import { Section } from "./Section";

/** S4 — timestamped notes on the node. An empty or whitespace-only note is never sent. */
export function AnnotationList({ nodeId }: { nodeId: string }) {
  const all = useStore(appStore, (s) => s.annotations);
  const annotations = Object.values(all)
    .filter((a) => a.nodeId === nodeId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const empty = !draft.trim();

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (empty || posting) return;
    setPosting(true);
    try {
      await appStore.getState().createAnnotation(nodeId, draft.trim());
      setDraft("");
    } catch {
      // The draft stays in the box, so Retry has something to send.
      reportSaveFailure(() => void submit());
    } finally {
      setPosting(false);
    }
  }

  function remove(id: string) {
    appStore
      .getState()
      .deleteAnnotation(id)
      .catch(() => reportSaveFailure(() => remove(id)));
  }

  return (
    <Section title="Annotations">
      {annotations.length === 0 ? (
        <p className="m-0 mb-3 text-[13px] text-muted">{COPY.noAnnotations}</p>
      ) : (
        <ol className="m-0 mb-3 list-none p-0">
          {annotations.map((a) => (
            <li key={a.id} data-annotation={a.id} className="mb-2.5 flex gap-2">
              <div className="min-w-0 flex-1">
                <time dateTime={a.createdAt} className="font-mono text-[9.5px] text-muted">
                  {formatTimestamp(a.createdAt)}
                </time>
                <p className="m-0 mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-primary">{a.body}</p>
              </div>
              <ConfirmRemove label="Delete annotation" onConfirm={() => remove(a.id)} />
            </li>
          ))}
        </ol>
      )}
      <form onSubmit={submit} className="flex items-end gap-2">
        <textarea
          aria-label="New annotation"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void submit();
          }}
          rows={2}
          placeholder="Add a note…  ⌘↵ to save"
          className="min-w-0 flex-1 resize-none rounded-sm border border-subtle bg-elevated px-2.5 py-2 text-[13px] leading-normal text-primary placeholder:text-muted"
        />
        <Button
          type="submit"
          variant="primary"
          disabledReason={empty ? COPY.emptyAnnotation : null}
          aria-busy={posting}
        >
          Add note
        </Button>
      </form>
    </Section>
  );
}
