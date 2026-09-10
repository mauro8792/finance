import type { ReactNode } from "react";
import styles from "./FinancialCard.module.css";

type FinancialCardProps = {
  children: ReactNode;
  variant?: "hero" | "surface";
  selected?: boolean;
  onClick?: () => void;
  className?: string;
  ariaLabel?: string;
};

export function FinancialCard({
  children,
  variant = "surface",
  selected = false,
  onClick,
  className,
  ariaLabel,
}: FinancialCardProps) {
  const classes = [
    styles.card,
    variant === "hero" ? styles.hero : styles.surface,
    selected ? styles.selected : "",
    onClick ? styles.interactive : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  if (onClick) {
    return (
      <button
        type="button"
        className={classes}
        onClick={onClick}
        aria-label={ariaLabel}
        aria-pressed={selected}
      >
        {children}
      </button>
    );
  }

  return <article className={classes}>{children}</article>;
}
