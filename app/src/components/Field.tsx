import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  error?: string;
  /** Guidance shown under the field while there is no error, e.g. a password rule. */
  hint?: ReactNode;
}

/** A labelled input whose error is announced and tied to it with aria-describedby. */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({ label, error, hint, ...input }, ref) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? hint;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        className={[
          "rounded-md border bg-elevated px-3 py-[11px] text-[14.5px] text-primary placeholder:text-muted",
          "disabled:opacity-60 read-only:cursor-default",
          error ? "border-danger" : "border-subtle",
        ].join(" ")}
        {...input}
      />
      {message ? (
        <span id={messageId} className={error ? "text-[12.5px] text-danger" : "text-xs"}>
          {message}
        </span>
      ) : null}
    </div>
  );
});
