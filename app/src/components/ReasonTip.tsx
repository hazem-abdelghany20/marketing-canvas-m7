import { useEffect, useState } from "react";

interface Tip {
  text: string;
  left: number;
  top?: number;
  bottom?: number;
}

const TIP_WIDTH = 240;
const GAP = 6;

/**
 * A disabled control explains itself in its `title`, which a keyboard never shows. While one has
 * keyboard focus its reason is drawn beside it, at full strength, above or below depending on room.
 * It mirrors the title for sighted keyboard users only; screen readers already read the title.
 */
export function ReasonTip() {
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    // Focus from a pointer is not the keyboard's business: the native title serves the mouse.
    let keyboard = false;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Tab" || event.key.startsWith("Arrow")) keyboard = true;
    };
    const onPointer = () => (keyboard = false);

    function onFocusIn(event: FocusEvent) {
      const el = event.target;
      if (!keyboard || !(el instanceof HTMLElement) || el.getAttribute("aria-disabled") !== "true") return setTip(null);
      const text = el.title;
      if (!text) return setTip(null);
      const box = el.getBoundingClientRect();
      const below = box.bottom + GAP + 48 <= window.innerHeight;
      setTip({
        text,
        left: Math.max(8, Math.min(box.right - TIP_WIDTH, window.innerWidth - TIP_WIDTH - 8)),
        ...(below ? { top: box.bottom + GAP } : { bottom: window.innerHeight - box.top + GAP }),
      });
    }

    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", () => setTip(null));
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, []);

  if (!tip) return null;
  return (
    <div
      aria-hidden="true"
      data-reason-tip
      style={{ left: tip.left, top: tip.top, bottom: tip.bottom, width: TIP_WIDTH }}
      className="pointer-events-none fixed z-[90] rounded-sm bg-primary px-2.5 py-1.5 text-[11.5px] leading-snug text-inverse shadow-[0_8px_24px_-14px_rgba(0,0,0,.6)]"
    >
      {tip.text}
    </div>
  );
}
