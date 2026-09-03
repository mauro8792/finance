import Link from "next/link";
import styles from "./QueryStatus.module.css";

export function LoadingState({ label }: { label: string }) {
  return (
    <p className={styles.loading} role="status" aria-busy="true" aria-live="polite">
      {label}
    </p>
  );
}

export function ErrorState({
  message,
  onRetry,
  compact = false,
}: {
  message: string;
  onRetry: () => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? `${styles.error} ${styles.compact}` : styles.error} role="alert">
      <p>{message}</p>
      <button type="button" className={styles.retry} onClick={onRetry}>
        Reintentar
      </button>
    </div>
  );
}

export function EmptyState({
  message,
  action,
}: {
  message: string;
  action?: { label: string; href?: string; onClick?: () => void };
}) {
  return (
    <div className={styles.empty}>
      <p>{message}</p>
      {action?.href ? (
        <Link href={action.href} className={styles.action}>
          {action.label}
        </Link>
      ) : null}
      {action?.onClick && !action.href ? (
        <button type="button" className={styles.action} onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
