import { useEffect, useRef } from "react";
import { appStore } from "../../store";
import type { Autosave } from "./useAutosave";
import { useDebouncedField } from "./useDebouncedField";

const FALLBACK = "Untitled";

/** The node's title as an inline-editable h1. Saves on blur and after 500ms idle. */
export function TitleField({
  nodeId,
  title,
  save,
  hold,
  autoFocus,
}: {
  nodeId: string;
  title: string;
  save: Autosave["save"];
  hold: boolean;
  autoFocus?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const field = useDebouncedField(title, (value) => {
    const next = value.trim() ? value : FALLBACK;
    if (next !== appStore.getState().nodes[nodeId]?.title) void save({ title: next });
  }, hold);

  useEffect(() => {
    if (!autoFocus) return;
    input.current?.focus();
    input.current?.select(); // a fresh node's "Untitled" is replaced by the first keystroke
  }, [autoFocus]);

  return (
    <h1 className="m-0">
      <input
        ref={input}
        aria-label="Title"
        value={field.value}
        placeholder={FALLBACK}
        onChange={(event) => field.onChange(event.target.value)}
        onFocus={field.onFocus}
        onBlur={() => {
          if (!field.value.trim()) field.setValue(FALLBACK);
          field.onBlur();
        }}
        className="w-full rounded-sm border-0 bg-transparent p-0 text-[21px] font-semibold tracking-[-0.018em] text-primary placeholder:text-muted"
      />
    </h1>
  );
}
