import type { ReactNode } from "react";
import styles from "./Metric.module.css";

type MetricProps = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  compact?: boolean;
};

export function Metric({ label, value, hint, compact = false }: MetricProps) {
  return (
    <div className={`${styles.metric} ${compact ? styles.compact : ""}`}>
      <p className={styles.label}>{label}</p>
      <p className={styles.value}>{value}</p>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  );
}
