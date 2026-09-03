"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { AiQuickInput } from "./AiQuickInput";
import { QuickAddForm } from "./QuickAddForm";
import styles from "./RegistrarModes.module.css";

type RegisterMode = "text" | "manual";

export function RegistrarModes() {
  const [mode, setMode] = useState<RegisterMode>("text");
  const textId = useId();
  const manualId = useId();
  const textPanel = `${textId}-panel`;
  const manualPanel = `${manualId}-panel`;
  const textTab = `${textId}-tab`;
  const manualTab = `${manualId}-tab`;

  function onTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
      return;
    }
    event.preventDefault();
    const next: RegisterMode = mode === "text" ? "manual" : "text";
    setMode(next);
    const nextTab = document.getElementById(next === "text" ? textTab : manualTab);
    nextTab?.focus();
  }

  return (
    <div className={styles.wrap}>
      <div
        className={styles.tabs}
        role="tablist"
        aria-label="Modo de registro"
        onKeyDown={onTabKeyDown}
      >
        <button
          id={textTab}
          type="button"
          role="tab"
          aria-selected={mode === "text"}
          aria-controls={textPanel}
          tabIndex={mode === "text" ? 0 : -1}
          className={mode === "text" ? styles.tabActive : styles.tab}
          onClick={() => setMode("text")}
        >
          Texto / voz
        </button>
        <button
          id={manualTab}
          type="button"
          role="tab"
          aria-selected={mode === "manual"}
          aria-controls={manualPanel}
          tabIndex={mode === "manual" ? 0 : -1}
          className={mode === "manual" ? styles.tabActive : styles.tab}
          onClick={() => setMode("manual")}
        >
          Manual
        </button>
      </div>

      <div
        id={textPanel}
        role="tabpanel"
        aria-labelledby={textTab}
        hidden={mode !== "text"}
      >
        <AiQuickInput />
      </div>
      <div
        id={manualPanel}
        role="tabpanel"
        aria-labelledby={manualTab}
        hidden={mode !== "manual"}
      >
        <QuickAddForm />
      </div>
    </div>
  );
}
