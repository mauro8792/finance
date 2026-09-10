"use client";

import { usePrivacy } from "./PrivacyProvider";
import styles from "./PrivacyToggle.module.css";

export function PrivacyToggle({ className }: { className?: string }) {
  const { hidden, toggle } = usePrivacy();
  return (
    <button
      type="button"
      className={`${styles.toggle} ${className ?? ""}`.trim()}
      onClick={toggle}
      aria-pressed={hidden}
      aria-label={hidden ? "Mostrar montos" : "Ocultar montos"}
      title={hidden ? "Mostrar montos" : "Ocultar montos"}
    >
      <EyeIcon hidden={hidden} />
    </button>
  );
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d={
          hidden
            ? "M2.1 3.51 3.51 2.1l18.39 18.39-1.41 1.41-3.2-3.2A11.3 11.3 0 0 1 12 20c-5 0-9.27-3.11-11-8a12.4 12.4 0 0 1 4.02-5.47L2.1 3.51ZM12 7a5 5 0 0 1 5 5c0 .64-.12 1.25-.34 1.81l-6.47-6.47c.56-.22 1.17-.34 1.81-.34Zm0-3c5 0 9.27 3.11 11 8a12.5 12.5 0 0 1-2.53 3.94l-2.9-2.9A5 5 0 0 0 12 7a5 5 0 0 0-.53.03L9.2 4.76A11.4 11.4 0 0 1 12 4Z"
            : "M12 4c5 0 9.27 3.11 11 8-1.73 4.89-6 8-11 8S2.73 16.89 1 12c1.73-4.89 6-8 11-8Zm0 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z"
        }
      />
    </svg>
  );
}
