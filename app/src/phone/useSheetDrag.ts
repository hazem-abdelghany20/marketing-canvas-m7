import { useRef, useState, type CSSProperties, type PointerEvent } from "react";

/** A sheet let go this far down closes; short of it, it comes back. */
export const SHEET_CLOSE_DISTANCE = 90;

/**
 * Pulling a bottom sheet down by its handle. The sheet follows the finger (and no further up than it started), and on release
 * it either goes, past {@link SHEET_CLOSE_DISTANCE}, or returns. Spread `handleProps` on the handle, which should be
 * `touch-none` so the browser does not take the drag for a scroll, and `style` on the sheet.
 */
export function useSheetDrag(onClose: () => void) {
  const [offset, setOffset] = useState(0);
  const press = useRef<{ id: number; y: number } | null>(null);

  const finish = (event: PointerEvent<HTMLElement>, release: boolean) => {
    const held = press.current;
    if (!held || event.pointerId !== held.id) return;
    press.current = null;
    setOffset(0);
    if (release && event.clientY - held.y > SHEET_CLOSE_DISTANCE) onClose();
  };

  const handleProps = {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      press.current = { id: event.pointerId, y: event.clientY };
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
        /* a synthetic pointer has nothing to capture; the drag still works while it stays over the handle */
      }
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const held = press.current;
      if (!held || event.pointerId !== held.id) return;
      setOffset(Math.max(0, event.clientY - held.y));
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => finish(event, true),
    onPointerCancel: (event: PointerEvent<HTMLElement>) => finish(event, false),
  };

  const style: CSSProperties | undefined = offset > 0 ? { transform: `translateY(${offset}px)`, transition: "none" } : undefined;
  return { handleProps, style };
}
