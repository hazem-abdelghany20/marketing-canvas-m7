import { COPY } from "../../ui/copy";
import { Section } from "./Section";
import type { Autosave } from "./useAutosave";
import { useDebouncedField } from "./useDebouncedField";

/** The description. Plain text with light markdown; saves after 500ms idle. */
export function BodyEditor({ body, save, hold }: { body: string; save: Autosave["save"]; hold: boolean }) {
  const field = useDebouncedField(body, (value) => void save({ body: value }), hold);

  return (
    <Section title="Description">
      <textarea
        aria-label="Description"
        value={field.value}
        placeholder={COPY.noBody}
        onChange={(event) => field.onChange(event.target.value)}
        onFocus={field.onFocus}
        onBlur={field.onBlur}
        rows={5}
        className="min-h-[120px] w-full resize-y rounded-sm border border-transparent bg-transparent p-0 text-[13.5px] leading-relaxed text-primary [field-sizing:content] placeholder:text-muted hover:border-subtle focus:border-subtle focus:p-2"
      />
      <p className="mt-2 font-mono text-[9.5px] text-muted opacity-75"># heading · **bold** · - list · [link](url)</p>
    </Section>
  );
}
