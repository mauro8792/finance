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
  /** Contenido del input ANTES de activar el micrófono. */
  baseText: string;
  /** Mejor transcripción consolidada de ESTA sesión (reemplazable). */
  sessionTranscript: string;
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

export function createSpeechSession(baseText = ""): SpeechSessionState {
  return {
    baseText: baseText.trim(),
    sessionTranscript: "",
  };
}

/**
 * Fusiona dos fragmentos finales.
 * Si el nuevo es una revisión/acumulación de la misma frase (Chrome Android),
 * reemplaza. Si son piernas aditivas (desktop), concatena.
 */
export function mergeUtterance(current: string, next: string): string {
  if (!current) {
    return next;
  }
  if (!next) {
    return current;
  }
  const previous = current.trim();
  const incoming = next.trim();
  if (!previous) {
    return next;
  }
  if (!incoming) {
    return current;
  }
  // Misma frase revisada/extendida: quedarse con la versión más completa.
  if (incoming.startsWith(previous) || previous.startsWith(incoming)) {
    return incoming.length >= previous.length ? next : current;
  }
  return current + next;
}

/**
 * Reconstruye el transcript de la sesión desde event.results completo.
 * No acumula “final + final” a ciegas: cada evento redefine sessionTranscript.
 */
export function rebuildSessionTranscript(
  results: SpeechRecognitionResultEventLike["results"]
): string {
  let finalPart = "";
  let interimPart = "";

  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const piece = result?.[0]?.transcript ?? "";
    if (!piece) {
      continue;
    }
    if (result?.isFinal) {
      finalPart = mergeUtterance(finalPart, piece);
    } else {
      interimPart += piece;
    }
  }

  return `${finalPart}${interimPart}`;
}

export function applySpeechResult(
  session: SpeechSessionState,
  event: SpeechRecognitionResultEventLike
): SpeechSessionState {
  return {
    baseText: session.baseText,
    sessionTranscript: rebuildSessionTranscript(event.results),
  };
}

export function displaySpeechTranscript(session: SpeechSessionState): string {
  const spoken = session.sessionTranscript.trim();
  const base = session.baseText.trim();
  if (!spoken) {
    return base;
  }
  if (!base) {
    return spoken;
  }
  return `${base} ${spoken}`;
}

export function finalizeSpeechSession(session: SpeechSessionState): SpeechSessionState {
  return {
    baseText: session.baseText,
    sessionTranscript: session.sessionTranscript.trim(),
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
