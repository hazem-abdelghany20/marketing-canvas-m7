import type { ReactNode } from "react";
import { Button } from "./Button";

interface ErrorStateProps {
  /** What failed, and what to do about it: every error here says both. */
  message: string;
  title?: string;
  actionLabel: string;
  onAction: () => void;
  /** Further actions beside the main one, such as a way back. */
  children?: ReactNode;
}

/** A failure that blocks a whole screen or panel: said once, as an alert, with the way to try again. */
export function ErrorState({ message, title, actionLabel, onAction, children }: ErrorStateProps) {
  return (
    <div role="alert" data-error-state className="flex max-w-sm flex-col items-center gap-3 text-center">
      {title ? <h1 className="m-0 text-[17px] font-semibold text-primary">{title}</h1> : null}
      <p className="m-0 text-sm text-primary">{message}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button className="px-3 py-1.5 text-sm font-medium" onClick={onAction}>
          {actionLabel}
        </Button>
        {children}
      </div>
    </div>
  );
}
