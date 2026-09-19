import { forwardRef, type ButtonHTMLAttributes, type MouseEvent } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "active";

const VARIANTS: Record<Variant, string> = {
  primary: "border-accent bg-accent font-semibold text-inverse",
  secondary: "border-subtle bg-elevated text-primary",
  ghost: "border-transparent bg-transparent text-primary hover:bg-elevated",
  danger: "border-subtle bg-transparent text-danger",
  active: "border-primary bg-primary text-inverse",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /**
   * Why the control can't be used right now. When set, the button stays
   * focusable and hoverable so the reason can be read, but does nothing.
   */
  disabledReason?: string | null;
  /** Runs instead of onClick while disabled, for controls that explain themselves on use. */
  onDisabledClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}

/**
 * The one button. A disabled control keeps its tooltip (a native `disabled`
 * button swallows hover in some browsers), so every "why not" stays readable.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", disabledReason, onDisabledClick, onClick, title, className = "", ...rest },
  ref,
) {
  const unavailable = Boolean(disabledReason) || rest.disabled === true;
  return (
    <button
      ref={ref}
      type="button"
      aria-disabled={disabledReason ? true : undefined}
      title={disabledReason ?? title}
      onClick={disabledReason ? onDisabledClick : onClick}
      className={[
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-sm border px-[11px] py-1.5 text-[12.5px]",
        VARIANTS[variant],
        unavailable ? "cursor-not-allowed opacity-45" : "cursor-pointer",
        className,
      ].join(" ")}
      {...rest}
    />
  );
});
