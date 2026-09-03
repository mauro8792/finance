import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ApiClientError } from "./api";
import {
  ASSISTANT_FACT_QUESTIONS,
  ASSISTANT_SIMULATION_QUESTIONS,
  ASSISTANT_SUGGESTED_QUESTIONS,
  assistantErrorMessage,
  canAskAssistant,
  parseAssistantAnswer,
  replaceAssistantDraft,
} from "./ai-assistant";

describe("ai-assistant", () => {
  it("does not submit empty or pending questions", () => {
    expect(canAskAssistant("", false)).toBe(false);
    expect(canAskAssistant("   ", false)).toBe(false);
    expect(canAskAssistant("¿Cuánto runway tengo?", true)).toBe(false);
    expect(canAskAssistant("¿Cuánto runway tengo?", false)).toBe(true);
  });

  it("replaces the whole draft with a suggested question", () => {
    const previous = "¿Cuánto dinero tengo disponible para vivir?";
    const suggested = "¿Cuántas cuotas de vivienda tengo cubiertas?";
    expect(replaceAssistantDraft(previous, suggested)).toBe(suggested);
    expect(replaceAssistantDraft(previous, suggested)).not.toContain(
      "¿Cuánto dinero tengo dis"
    );
  });

  it("maps HTTP errors without leaking provider details", () => {
    expect(assistantErrorMessage(new ApiClientError(400, "VALIDATION_ERROR", "sk-secret"))).toBe(
      "Revisá la pregunta e intentá de nuevo."
    );
    expect(assistantErrorMessage(new ApiClientError(429, "RATE_LIMIT", "sk-secret"))).toBe(
      "Demasiadas solicitudes. Probá de nuevo en un momento."
    );
    expect(assistantErrorMessage(new ApiClientError(503, "AI_UNAVAILABLE", "OpenAI stack"))).toBe(
      "El asistente no está disponible temporalmente."
    );
    expect(assistantErrorMessage(new ApiClientError(500, "INTERNAL_ERROR", "stack"))).toBe(
      "No se pudo completar la consulta."
    );
    expect(assistantErrorMessage(new Error("OpenAI timeout"))).toBe(
      "No se pudo completar la consulta."
    );
  });

  it("parses line breaks and simple bold without HTML", () => {
    const parsed = parseAssistantAnswer(
      "Tenés **ARS 20.785.000** disponibles.\nEl runway es de **10,39** meses."
    );
    expect(parsed).toEqual([
      {
        segments: [
          { type: "text", value: "Tenés " },
          { type: "bold", value: "ARS 20.785.000" },
          { type: "text", value: " disponibles." },
        ],
      },
      {
        segments: [
          { type: "text", value: "El runway es de " },
          { type: "bold", value: "10,39" },
          { type: "text", value: " meses." },
        ],
      },
    ]);
  });

  it("suggested questions are prompts, not hardcoded answers", () => {
    expect(ASSISTANT_SUGGESTED_QUESTIONS.length).toBeGreaterThanOrEqual(8);
    expect(ASSISTANT_FACT_QUESTIONS.every((item) => item.includes("?"))).toBe(true);
    expect(ASSISTANT_SIMULATION_QUESTIONS.every((item) => item.includes("?"))).toBe(true);
    expect(ASSISTANT_SIMULATION_QUESTIONS[0]).toMatch(/6 meses/);
    expect(ASSISTANT_SIMULATION_QUESTIONS[1]).toMatch(/3500000\.00/);
    expect(ASSISTANT_SIMULATION_QUESTIONS[1]).toMatch(/12 meses/);
    expect(ASSISTANT_SIMULATION_QUESTIONS[2]).toMatch(/1400/);
  });

  it("frontend assistant helpers do not contain API keys", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = [
      readFileSync(join(here, "ai-assistant.ts"), "utf8"),
      readFileSync(join(here, "api.ts"), "utf8"),
    ].join("\n");
    expect(src).not.toMatch(/OPENAI_API_KEY|NEXT_PUBLIC_OPENAI|sk-/);
    expect(src).toMatch(/\/api\/ai\/chat/);
  });
});
