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

export type SpeechRecognitionResultEventLike = {
  results: ArrayLike<{ 0?: { transcript?: string } }>;
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

export function transcriptFromResults(
  results: SpeechRecognitionResultEventLike["results"]
): string {
  const parts: string[] = [];
  for (let index = 0; index < results.length; index += 1) {
    const piece = results[index]?.[0]?.transcript?.trim();
    if (piece) {
      parts.push(piece);
    }
  }
  return parts.join(" ").trim();
}

export function combineSpeechTranscript(prefix: string, spoken: string): string {
  const start = prefix.trim();
  const next = spoken.trim();
  if (!next) {
    return start;
  }
  if (!start) {
    return next;
  }
  return `${start} ${next}`;
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
