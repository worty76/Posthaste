import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "danger" | "quiet";
  /** Shows the busy state and blocks repeat clicks. */
  busy?: boolean;
}

export function Button({ variant = "default", busy, className, children, ...rest }: ButtonProps) {
  const classes = ["btn", variant !== "default" && `btn--${variant}`, className]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      {...rest}
      className={classes}
      aria-busy={busy || undefined}
      disabled={rest.disabled || busy}
    >
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  /** Accessible name; also the tooltip. */
  label: string;
  danger?: boolean;
  children?: ReactNode;
}

export function IconButton({ icon, label, danger, className, ...rest }: IconButtonProps) {
  const classes = ["icon-btn", danger && "icon-btn--danger", className].filter(Boolean).join(" ");
  return (
    <button type="button" {...rest} className={classes} aria-label={label} title={label}>
      <Icon name={icon} />
    </button>
  );
}
