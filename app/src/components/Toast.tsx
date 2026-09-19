import { X } from "lucide-react";
import { useEffect } from "react";
import { uiStore, useUi, type Toast as ToastModel, type ToastTone } from "../ui/uiStore";

const DOT: Record<ToastTone, string> = {
  info: "bg-ok",
  success: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
};

/** Bottom-centre stack of toasts. Ticket 015 completes the variants and states. */
export function ToastViewport() {
  const toasts = useUi((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[18px] z-[80] flex flex-col items-center gap-2 px-4">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

function Toast({ toast }: { toast: ToastModel }) {
  useEffect(() => {
    const timer = setTimeout(() => uiStore.getState().dismissToast(toast.id), toast.durationMs);
    return () => clearTimeout(timer);
  }, [toast.id, toast.durationMs]);

  const urgent = toast.tone === "warn" || toast.tone === "danger";

  return (
    <div
      role={urgent ? "alert" : "status"}
      className="pointer-events-auto flex max-w-[min(560px,92vw)] animate-mc-rise items-center gap-[11px] rounded-full bg-primary py-[9px] pl-3.5 pr-2.5 text-inverse shadow-[0_14px_34px_-18px_rgba(0,0,0,.7)]"
    >
      <span aria-hidden="true" className={`size-[7px] flex-none rounded-full ${DOT[toast.tone]}`} />
      <span className="text-[13px] leading-snug">{toast.message}</span>
      {toast.actionLabel ? (
        <button
          type="button"
          onClick={() => {
            uiStore.getState().dismissToast(toast.id);
            toast.onAction?.();
          }}
          className="flex-none rounded-sm border border-[color-mix(in_srgb,var(--fg-inverse)_35%,transparent)] px-2.5 py-[3px] text-xs"
        >
          {toast.actionLabel}
        </button>
      ) : null}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => uiStore.getState().dismissToast(toast.id)}
        className="flex-none p-1 opacity-60 hover:opacity-100"
      >
        <X size={13} aria-hidden="true" />
      </button>
    </div>
  );
}
