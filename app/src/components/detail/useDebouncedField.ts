import { useCallback, useEffect, useRef, useState } from "react";

/** Autosave fires after this long without a keystroke. */
export const IDLE_SAVE_MS = 500;

/**
 * A text field that saves after 500ms idle and again on blur, and never loses
 * a pending edit: leaving the panel mid-pause flushes it. While the field is
 * not being edited it follows the stored value (after an undo, say) — unless
 * `hold` is set: a save in flight or failed rolls the store back, and the
 * person's text must survive that.
 */
export function useDebouncedField(stored: string, commit: (value: string) => void, hold = false) {
  const [value, setValue] = useState(stored);
  const editing = useRef(false);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ value, commit });
  latest.current = { value, commit };

  useEffect(() => {
    if (!hold && !editing.current && !dirty.current) setValue(stored);
  }, [stored, hold]);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!dirty.current) return;
    dirty.current = false;
    latest.current.commit(latest.current.value);
  }, []);

  useEffect(() => flush, [flush]);

  const onChange = useCallback(
    (next: string) => {
      setValue(next);
      dirty.current = true;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, IDLE_SAVE_MS);
    },
    [flush],
  );

  return {
    value,
    setValue,
    onChange,
    onFocus: () => void (editing.current = true),
    onBlur: () => {
      editing.current = false;
      flush();
    },
  };
}
