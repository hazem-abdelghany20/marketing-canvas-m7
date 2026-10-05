import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { uiStore, useUi, type Toast as ToastModel, type ToastTone } from "../ui/uiStore";

// The tone is told by shape as well as colour, so it survives a monochrome screen and colour blindness.
const ICON: Record<ToastTone, typeof Info> = {
  info: Info,
  success: CircleCheck,
  warn: TriangleAlert,
  danger: CircleAlert,
};

/**
 * Bottom-centre stack of toasts. Inside the workspace it is `contained` to the canvas, so it never
 * covers the chat rail; on the auth screens it is centred on the window.
 */
export function ToastViewport({ contained = false }: { contained?: boolean }) {
  const toasts = useUi((s) => s.toasts);
  return (
    <div
      className={[
        "pointer-events-none inset-x-0 bottom-[18px] z-[80] flex flex-col items-center gap-2 px-4",
        // Below 900px the floating chat button sits in the bottom-left corner; stay above it.
        contained ? "absolute max-[899px]:bottom-[68px]" : "fixed",
      ].join(" ")}
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

function Toast({ toast }: { toast: ToastModel }) {
  // The clock stops while the pointer is on the toast or focus is inside it, and starts again in full
  // after: a keyboard user needs time to tab to Undo, and a reader needs time to read.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const held = hovered || focused;

  useEffect(() => {
    if (held) return;
    const timer = setTimeout(() => uiStore.getState().dismissToast(toast.id), toast.durationMs);
    return () => clearTimeout(timer);
  }, [toast.id, toast.durationMs, held]);

  const urgent = toast.tone === "warn" || toast.tone === "danger";
  const Icon = ICON[toast.tone];

  return (
    <div
      role={urgent ? "alert" : "status"}
      data-tone={toast.tone}
      data-state="visible"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className="pointer-events-auto flex max-w-[min(560px,92vw)] animate-mc-rise items-center gap-[11px] rounded-full bg-primary py-[9px] pl-3.5 pr-2.5 text-inverse shadow-[0_14px_34px_-18px_rgba(0,0,0,.7)]"
    >
      <Icon data-toast-icon size={15} aria-hidden="true" className="flex-none" />
      <span className="text-[13px] leading-snug">{toast.message}</span>
      {toast.actionLabel ? (
        <button
          type="button"
          onClick={() => {
            uiStore.getState().dismissToast(toast.id);
            toast.onAction?.();
          }}
          className="flex-none rounded-sm border border-[color-mix(in_srgb,var(--fg-inverse)_35%,transparent)] px-2.5 py-[3px] text-xs focus-visible:outline-inverse"
        >
          {toast.actionLabel}
        </button>
      ) : null}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => uiStore.getState().dismissToast(toast.id)}
        className="flex-none rounded-sm p-1.5 opacity-60 hover:opacity-100 focus-visible:outline-inverse"
      >
        <X size={13} aria-hidden="true" />
      </button>
    </div>
  );
}
