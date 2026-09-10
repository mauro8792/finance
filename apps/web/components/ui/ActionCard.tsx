import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./ActionCard.module.css";

type ActionCardProps = {
  label: string;
  icon?: ReactNode;
  hint?: string;
  href?: string;
  onClick?: () => void;
  className?: string;
};

export function ActionCard({
  label,
  icon,
  hint,
  href,
  onClick,
  className,
}: ActionCardProps) {
  const classes = [styles.card, className ?? ""].filter(Boolean).join(" ");

  const content = (
    <>
      {icon ? (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className={styles.label}>{label}</span>
      {hint ? <span className={styles.hint}>{hint}</span> : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" className={classes} onClick={onClick}>
      {content}
    </button>
  );
}
