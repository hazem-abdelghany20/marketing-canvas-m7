import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { FormError } from "../auth/session";

interface AuthCardProps {
  heading: string;
  subheading: string;
  children: ReactNode;
  footer: ReactNode;
}

/** The shell both auth screens share: a dotted canvas ground and one centered card. */
export function AuthCard({ heading, subheading, children, footer }: AuthCardProps) {
  return (
    <AuthGround>
      <main className="w-full max-w-[400px] rounded-lg border border-subtle bg-panel px-8 py-9 shadow-[0_12px_40px_-20px_color-mix(in_srgb,var(--fg-primary)_35%,transparent)] max-[480px]:px-5">
        <Logo />
        <h1 className="mb-1.5 text-[27px] font-semibold leading-tight tracking-[-0.02em] text-primary">{heading}</h1>
        <p className="mb-[26px] text-sm leading-normal text-muted">{subheading}</p>
        {children}
        <div className="mt-[22px] border-t border-subtle pt-[18px] text-[13.5px] text-muted">{footer}</div>
      </main>
    </AuthGround>
  );
}

/** Shown while the session check runs: the card's shape, never a flash of the form. */
export function AuthSkeleton() {
  const bar = "rounded-md bg-[color-mix(in_srgb,var(--border-subtle)_70%,transparent)] animate-pulse";
  return (
    <AuthGround>
      <div
        role="status"
        aria-label="Loading"
        className="flex w-full max-w-[400px] flex-col gap-4 rounded-lg border border-subtle bg-panel px-8 py-9"
      >
        <div className={`${bar} h-3 w-36`} />
        <div className={`${bar} h-7 w-40`} />
        <div className={`${bar} h-11 w-full`} />
        <div className={`${bar} h-11 w-full`} />
        <div className={`${bar} h-11 w-full`} />
      </div>
    </AuthGround>
  );
}

function AuthGround({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas bg-[radial-gradient(var(--grid-dot)_1px,transparent_1px)] bg-[length:26px_26px] p-4">
      {children}
    </div>
  );
}

function Logo() {
  return (
    <div className="mb-[26px] flex items-center gap-[9px]" aria-hidden="true">
      <span className="size-[11px] rounded-full bg-node-goal" />
      <span className="-ml-1 size-[11px] rounded-full bg-node-strategy" />
      <span className="ml-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Marketing Canvas</span>
    </div>
  );
}

// ------------------------------------------------------------- form pieces

/** The submit button holds its check this long before navigating away. */
export const SUCCESS_BEAT_MS = 200;

export function FormAlert({ error, onRetry }: { error: FormError; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-[color-mix(in_srgb,var(--danger)_25%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2.5 text-[13px] leading-snug text-danger"
    >
      {error.kind === "email-taken" ? (
        <>
          That email is already registered.{" "}
          <Link to="/signin" className="font-semibold underline underline-offset-2">
            Sign in
          </Link>{" "}
          instead, or use a different address.
        </>
      ) : (
        error.message
      )}
      {error.kind === "network" ? (
        <button type="button" onClick={onRetry} className="ml-2 font-semibold underline underline-offset-2">
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function SubmitButton({ status, children }: { status: "idle" | "pending" | "success"; children: ReactNode }) {
  const busy = status !== "idle";
  return (
    <button
      type="submit"
      disabled={busy}
      aria-live="polite"
      className={[
        "mt-1 flex h-[46px] items-center justify-center rounded-md border text-[14.5px] font-semibold text-inverse",
        status === "pending" ? "cursor-default border-strong bg-strong" : "border-accent bg-accent",
        status === "success" ? "border-ok bg-ok" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
