import type { ReactNode } from "react";
import type { FeeStatusTone } from "../../lib/credit-cards";
import styles from "./StatusBadge.module.css";

type StatusBadgeProps = {
  label: string;
  tone?: FeeStatusTone | "primary" | "inactive" | "active";
  icon?: ReactNode;
  dot?: boolean;
};

export function StatusBadge({
  label,
  tone = "neutral",
  icon,
  dot = true,
}: StatusBadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[tone]}`}>
      {icon ? <span className={styles.icon}>{icon}</span> : null}
      {!icon && dot ? <span className={styles.dot} aria-hidden="true" /> : null}
      <span>{label}</span>
    </span>
  );
}
