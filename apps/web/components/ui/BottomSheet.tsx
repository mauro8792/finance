"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import styles from "./BottomSheet.module.css";

type BottomSheetProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  open?: boolean;
  className?: string;
};

export function BottomSheet({
  title,
  onClose,
  children,
  open = true,
  className,
}: BottomSheetProps) {
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      sheetRef.current?.focus();
    }
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={sheetRef}
        tabIndex={-1}
        className={`${styles.sheet} ${className ?? ""}`.trim()}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button type="button" className={styles.close} onClick={onClose}>
            Cerrar
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
