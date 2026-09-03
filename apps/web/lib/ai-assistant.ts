import { ApiClientError } from "./api";

export const ASSISTANT_FACT_QUESTIONS = [
  "¿Cuánto dinero tengo disponible para vivir?",
  "¿Cuánto runway tengo?",
  "¿Cuánto gasté este mes?",
  "¿Cuántas cuotas de vivienda tengo cubiertas?",
  "¿Qué cuentas tengo y qué saldo tienen?",
] as const;

export const ASSISTANT_SIMULATION_QUESTIONS = [
  "¿Qué pasa si no tengo ingresos por 6 meses?",
  "¿Qué pasa si consigo trabajo en 3 meses cobrando 3500000.00 por mes durante 12 meses?",
  "¿Cuánto me quedaría si separo 8 cuotas de vivienda al tipo de cambio 1400?",
] as const;

export const ASSISTANT_SUGGESTED_QUESTIONS = [
  ...ASSISTANT_FACT_QUESTIONS,
  ...ASSISTANT_SIMULATION_QUESTIONS,
];

export type AnswerSegment =
  | { type: "text"; value: string }
  | { type: "bold"; value: string };

export type AnswerParagraph = {
  segments: AnswerSegment[];
};

export function canAskAssistant(message: string, isPending: boolean): boolean {
  return message.trim().length > 0 && !isPending;
}

export function replaceAssistantDraft(_current: string, suggested: string): string {
  return suggested;
}

export function assistantErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 400) {
      return "Revisá la pregunta e intentá de nuevo.";
    }
    if (error.status === 429) {
      return "Demasiadas solicitudes. Probá de nuevo en un momento.";
    }
    if (error.status === 503 || error.code === "AI_UNAVAILABLE") {
      return "El asistente no está disponible temporalmente.";
    }
  }
  return "No se pudo completar la consulta.";
}

export function parseAssistantAnswer(text: string): AnswerParagraph[] {
  return text.split("\n").map((line) => ({ segments: parseInline(line) }));
}

function parseInline(line: string): AnswerSegment[] {
  const segments: AnswerSegment[] = [];
  const pattern = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = pattern.exec(line);

  while (match) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: line.slice(lastIndex, match.index) });
    }
    segments.push({ type: "bold", value: match[1] ?? "" });
    lastIndex = match.index + match[0].length;
    match = pattern.exec(line);
  }

  if (lastIndex < line.length) {
    segments.push({ type: "text", value: line.slice(lastIndex) });
  }

  return segments;
}
