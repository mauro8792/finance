export type SpeechRecognitionResultLike = {
  isFinal?: boolean;
  0?: { transcript?: string };
  length?: number;
};

export type SpeechRecognitionResultEventLike = {
  resultIndex?: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

export type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

export type SpeechSessionState = {
  /** Texto que el usuario ya tenía antes de activar el micrófono. */
  prefix: string;
  /** Solo transcripts finales acumulados en esta sesión. */
  finalTranscript: string;
  /** Transcript parcial actual (se reemplaza, no se concatena). */
  interimTranscript: string;
};

type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

export function getSpeechRecognitionConstructor():
  | (new () => SpeechRecognitionLike)
  | null {
  if (typeof window === "undefined") {
    return null;
  }
  const speechWindow = window as SpeechWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionAvailable(): boolean {
  return getSpeechRecognitionConstructor() !== null;
}

export function createSpeechSession(prefix = ""): SpeechSessionState {
  return {
    prefix: prefix.trim(),
    finalTranscript: "",
    interimTranscript: "",
  };
}

/**
 * Aplica un evento SpeechRecognition a la sesión.
 * Recorre desde resultIndex: los finales se acumulan una vez;
 * los interim reemplazan el parcial actual (no se concatenan entre sí).
 */
export function applySpeechResult(
  session: SpeechSessionState,
  event: SpeechRecognitionResultEventLike
): SpeechSessionState {
  const startIndex = Math.max(0, event.resultIndex ?? 0);
  let finalTranscript = session.finalTranscript;
  let interimTranscript = "";

  for (let index = startIndex; index < event.results.length; index += 1) {
    const result = event.results[index];
    const piece = result?.[0]?.transcript ?? "";
    if (!piece) {
      continue;
    }
    if (result?.isFinal) {
      finalTranscript = `${finalTranscript}${piece}`;
    } else {
      interimTranscript += piece;
    }
  }

  return {
    prefix: session.prefix,
    finalTranscript,
    interimTranscript,
  };
}

/** Texto a mostrar en el input: prefix + finales + interim actual. */
export function displaySpeechTranscript(session: SpeechSessionState): string {
  const spoken = `${session.finalTranscript}${session.interimTranscript}`.trim();
  const prefix = session.prefix.trim();
  if (!spoken) {
    return prefix;
  }
  if (!prefix) {
    return spoken;
  }
  return `${prefix} ${spoken}`;
}

/** Al terminar: conservar solo finales consolidados, limpiar interim. */
export function finalizeSpeechSession(session: SpeechSessionState): SpeechSessionState {
  return {
    prefix: session.prefix,
    finalTranscript: session.finalTranscript,
    interimTranscript: "",
  };
}

export function speechErrorMessage(code: string): string | null {
  if (code === "aborted" || code === "no-speech") {
    return null;
  }
  if (code === "not-allowed") {
    return "No se pudo usar el micrófono. Podés seguir escribiendo.";
  }
  return "No se pudo dictar. Podés seguir escribiendo.";
}
