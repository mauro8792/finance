import type { ReactNode } from "react";
import { Money } from "./Money";
import styles from "./SummaryCard.module.css";

type SummaryCardProps = {
  label: string;
  amount: string;
  currency?: "ARS" | "USD";
  hint?: ReactNode;
  tone?: "surface" | "hero";
  className?: string;
};

export function SummaryCard({
  label,
  amount,
  currency = "ARS",
  hint,
  tone = "surface",
  className,
}: SummaryCardProps) {
  const classes = [styles.card, tone === "hero" ? styles.hero : styles.surface, className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={classes}>
      <p className={styles.label}>{label}</p>
      <Money amount={amount} currency={currency} className={styles.value} />
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </article>
  );
}
