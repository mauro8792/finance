import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AssistantRoute from "../app/assistant/page";
import { ASSISTANT_SUGGESTED_QUESTIONS } from "../lib/ai-assistant";
import type { ChatRequest } from "../lib/types";
import { SiteHeader } from "./SiteHeader";

const { askAssistant, ApiClientError } = vi.hoisted(() => {
  class ApiClientError extends Error {
    constructor(
      public readonly status: number,
      public readonly code: string,
      message: string
    ) {
      super(message);
      this.name = "ApiClientError";
    }
  }
  return {
    ApiClientError,
    askAssistant: vi.fn(),
  };
});

vi.mock("../lib/api", () => ({
  ApiClientError,
  askAssistant: (payload: ChatRequest) => askAssistant(payload),
}));

function renderAssistant() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  render(
    <QueryClientProvider client={client}>
      <AssistantRoute />
    </QueryClientProvider>
  );
}

describe("Assistant", () => {
  beforeEach(() => {
    askAssistant.mockReset();
  });

  it("renders the assistant UI", () => {
    renderAssistant();
    expect(screen.getByRole("heading", { name: "Asistente financiero" })).toBeTruthy();
    expect(screen.getByText("Preguntá sobre tus números. La app calcula; la IA te los explica.")).toBeTruthy();
    expect(screen.getByLabelText("Pregunta")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Preguntar" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Preguntas sugeridas" })).toBeTruthy();
  });

  it("does not request the chat endpoint on mount", () => {
    renderAssistant();
    expect(askAssistant).not.toHaveBeenCalled();
  });

  it("does not submit an empty question", async () => {
    const user = userEvent.setup();
    renderAssistant();
    expect(screen.getByRole("button", { name: "Preguntar" })).toHaveProperty("disabled", true);
    await user.click(screen.getByRole("button", { name: "Preguntar" }));
    expect(askAssistant).not.toHaveBeenCalled();
  });

  it("submits only { message } and shows the answer", async () => {
    askAssistant.mockResolvedValue({
      answer: "Tenés **ARS 20.785.000** disponibles.\nEl runway es de 10,39 meses.",
    });
    const user = userEvent.setup();
    renderAssistant();
    await user.type(screen.getByLabelText("Pregunta"), "¿Cuánto runway tengo?");
    await user.click(screen.getByRole("button", { name: "Preguntar" }));
    expect(await screen.findByText("Respuesta")).toBeTruthy();
    expect(screen.getByText("ARS 20.785.000").tagName).toBe("STRONG");
    expect(screen.getByText("El runway es de 10,39 meses.")).toBeTruthy();
    expect(screen.getByText("Pregunta: ¿Cuánto runway tengo?")).toBeTruthy();
    expect(askAssistant).toHaveBeenCalledTimes(1);
    expect(askAssistant.mock.calls[0]?.[0]).toEqual({ message: "¿Cuánto runway tengo?" });
    expect(Object.keys(askAssistant.mock.calls[0]?.[0] ?? {})).toEqual(["message"]);
  });

  it("blocks double submit while pending", async () => {
    let resolveAsk: ((value: { answer: string }) => void) | undefined;
    askAssistant.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAsk = resolve;
        })
    );
    const user = userEvent.setup();
    renderAssistant();
    await user.type(screen.getByLabelText("Pregunta"), "¿Cuánto gasté este mes?");
    await user.click(screen.getByRole("button", { name: "Preguntar" }));
    await screen.findByText("Analizando tus datos...");
    expect(screen.getByRole("button", { name: "Preguntar" })).toHaveProperty("disabled", true);
    await user.click(screen.getByRole("button", { name: "Preguntar" }));
    expect(askAssistant).toHaveBeenCalledTimes(1);
    resolveAsk?.({ answer: "Gastaste ARS 15.000." });
    expect(await screen.findByText("Gastaste ARS 15.000.")).toBeTruthy();
  });

  it("fills a suggested question without sending it", async () => {
    const user = userEvent.setup();
    renderAssistant();
    const suggestion = ASSISTANT_SUGGESTED_QUESTIONS[0];
    await user.click(screen.getByRole("button", { name: suggestion }));
    expect((screen.getByLabelText("Pregunta") as HTMLTextAreaElement).value).toBe(suggestion);
    expect(askAssistant).not.toHaveBeenCalled();
  });

  it("replaces the entire textarea when a suggested question is clicked with the cursor in the middle", async () => {
    askAssistant.mockResolvedValue({ answer: "Tenés 9,40 cuotas cubiertas." });
    const user = userEvent.setup();
    renderAssistant();
    const previous = "¿Cuánto dinero tengo disponible para vivir?";
    const suggestion =
      ASSISTANT_SUGGESTED_QUESTIONS.find((item) => item.includes("cuotas de vivienda")) ??
      "¿Cuántas cuotas de vivienda tengo cubiertas?";
    const textarea = screen.getByLabelText("Pregunta") as HTMLTextAreaElement;
    await user.type(textarea, previous);
    expect(textarea.value).toBe(previous);
    textarea.focus();
    textarea.setSelectionRange(12, 12);
    expect(textarea.selectionStart).toBe(12);
    await user.click(screen.getByRole("button", { name: suggestion }));
    const replaced = screen.getByLabelText("Pregunta") as HTMLTextAreaElement;
    expect(replaced.value).toBe(suggestion);
    expect(replaced.value).not.toContain("¿Cuánto dinero tengo dis");
    expect(replaced.value).not.toMatch(/dis¿Cuántas/);
    expect(askAssistant).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Preguntar" }));
    await waitFor(() => expect(askAssistant).toHaveBeenCalledTimes(1));
    expect(askAssistant.mock.calls[0]?.[0]).toEqual({ message: suggestion });
  });

  it("keeps the last answer while replacing only the draft from a suggestion", async () => {
    askAssistant.mockResolvedValue({ answer: "Tenés ARS 20.785.000 disponibles." });
    const user = userEvent.setup();
    renderAssistant();
    const previous = "¿Cuánto dinero tengo disponible para vivir?";
    const suggestion =
      ASSISTANT_SUGGESTED_QUESTIONS.find((item) => item.includes("cuotas de vivienda")) ??
      "¿Cuántas cuotas de vivienda tengo cubiertas?";
    await user.type(screen.getByLabelText("Pregunta"), previous);
    await user.click(screen.getByRole("button", { name: "Preguntar" }));
    expect(await screen.findByText("Tenés ARS 20.785.000 disponibles.")).toBeTruthy();
    expect(screen.getByText(`Pregunta: ${previous}`)).toBeTruthy();
    const textarea = screen.getByLabelText("Pregunta") as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(10, 10);
    await user.click(screen.getByRole("button", { name: suggestion }));
    expect((screen.getByLabelText("Pregunta") as HTMLTextAreaElement).value).toBe(suggestion);
    expect(screen.getByText("Tenés ARS 20.785.000 disponibles.")).toBeTruthy();
    expect(screen.getByText(`Pregunta: ${previous}`)).toBeTruthy();
    expect(askAssistant).toHaveBeenCalledTimes(1);
  });

  it("shows a friendly 400", async () => {
    askAssistant.mockRejectedValue(new ApiClientError(400, "VALIDATION_ERROR", "message es obligatorio."));
    const user = userEvent.setup();
    renderAssistant();
    await user.type(screen.getByLabelText("Pregunta"), "x");
    await user.click(screen.getByRole("button", { name: "Preguntar" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Revisá la pregunta e intentá de nuevo."
    );
  });

  it("submits with Ctrl+Enter", async () => {
    askAssistant.mockResolvedValue({ answer: "Ok." });
    const user = userEvent.setup();
    renderAssistant();
    await user.type(screen.getByLabelText("Pregunta"), "¿Cuánto runway tengo?");
    await user.keyboard("{Control>}{Enter}{/Control}");
    await waitFor(() => expect(askAssistant).toHaveBeenCalledTimes(1));
    expect(askAssistant.mock.calls[0]?.[0]).toEqual({ message: "¿Cuánto runway tengo?" });
  });

  it("shows a friendly 429 without leaking internals", async () => {
    askAssistant.mockRejectedValue(new ApiClientError(429, "RATE_LIMIT", "sk-secret OpenAI"));
    const user = userEvent.setup();
    renderAssistant();
    await user.type(screen.getByLabelText("Pregunta"), "¿Cuánto runway tengo?");
    await user.click(screen.getByRole("button", { name: "Preguntar" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Demasiadas solicitudes. Probá de nuevo en un momento."
    );
    expect(document.body.textContent).not.toMatch(/sk-|OpenAI|stack/i);
  });

  it("shows a friendly 503", async () => {
    askAssistant.mockRejectedValue(new ApiClientError(503, "AI_UNAVAILABLE", "provider down"));
    const user = userEvent.setup();
    renderAssistant();
    await user.type(screen.getByLabelText("Pregunta"), "¿Cuánto runway tengo?");
    await user.click(screen.getByRole("button", { name: "Preguntar" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "El asistente no está disponible temporalmente."
    );
  });

  it("shows a friendly 500", async () => {
    askAssistant.mockRejectedValue(new ApiClientError(500, "INTERNAL_ERROR", "stack"));
    const user = userEvent.setup();
    renderAssistant();
    await user.type(screen.getByLabelText("Pregunta"), "¿Cuánto runway tengo?");
    await user.click(screen.getByRole("button", { name: "Preguntar" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "No se pudo completar la consulta."
    );
  });

  it("does not send chat history or API keys", async () => {
    askAssistant.mockResolvedValue({ answer: "Ok." });
    const user = userEvent.setup();
    renderAssistant();
    await user.type(screen.getByLabelText("Pregunta"), "primera");
    await user.click(screen.getByRole("button", { name: "Preguntar" }));
    await screen.findByText("Ok.");
    await user.clear(screen.getByLabelText("Pregunta"));
    await user.type(screen.getByLabelText("Pregunta"), "segunda");
    await user.click(screen.getByRole("button", { name: "Preguntar" }));
    await waitFor(() => expect(askAssistant).toHaveBeenCalledTimes(2));
    expect(askAssistant.mock.calls[1]?.[0]).toEqual({ message: "segunda" });
    expect(JSON.stringify(askAssistant.mock.calls)).not.toMatch(
      /history|conversation|userId|OPENAI|apiKey|sk-/i
    );
  });

  it("renders without a chat history sidebar", () => {
    renderAssistant();
    expect(document.querySelector("aside")).toBeNull();
    expect(screen.queryByText(/historial/i)).toBeNull();
    expect(screen.getByLabelText("Pregunta")).toBeTruthy();
  });

  it("does not contain an OpenAI API key in the assistant frontend", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = [
      readFileSync(join(here, "Assistant.tsx"), "utf8"),
      readFileSync(join(here, "../lib/ai-assistant.ts"), "utf8"),
      readFileSync(join(here, "../app/assistant/page.tsx"), "utf8"),
    ].join("\n");
    expect(src).not.toMatch(/OPENAI_API_KEY|NEXT_PUBLIC_OPENAI|sk-/);
    expect(src).not.toMatch(/dangerouslySetInnerHTML/);
    expect(src).not.toMatch(/selectionStart|selectionEnd|setRangeText/);
  });
});

describe("SiteHeader assistant navigation", () => {
  it("links Asistente to /assistant", () => {
    render(<SiteHeader />);
    const links = screen.getAllByRole("link", { name: "Asistente" });
    expect(links.length).toBeGreaterThan(0);
    expect(links.every((link) => link.getAttribute("href") === "/assistant")).toBe(true);
  });
});
