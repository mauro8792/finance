import OpenAI, {
  APIConnectionTimeoutError,
  AuthenticationError,
  InternalServerError,
  RateLimitError,
} from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  getOpenAIApiKey,
  getOpenAIMaxRetries,
  getOpenAIModel,
  getOpenAITimeoutMs,
} from "./openai.config.js";
import { OpenAIClientError, sanitizeOpenAIMessage } from "./openai.errors.js";
import type {
  OpenAICreateParams,
  OpenAIFunctionCall,
  OpenAIRawResponse,
  OpenAIResponseRequest,
  OpenAIResponseResult,
  OpenAIResponsesSdk,
  OpenAIStructuredRequest,
  OpenAIStructuredResponse,
  OpenAITextRequest,
  OpenAITextResponse,
  OpenAIUsage,
} from "./openai.types.js";

export type OpenAIClientOptions = {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
  sdk?: OpenAIResponsesSdk;
};

export class OpenAIClient {
  private readonly model: string;
  private readonly sdk: OpenAIResponsesSdk;

  constructor(options: OpenAIClientOptions = {}) {
    const apiKey = options.apiKey ?? getOpenAIApiKey();
    this.model = options.model ?? getOpenAIModel();
    const timeoutMs = options.timeoutMs ?? getOpenAITimeoutMs();
    const maxRetries = options.maxRetries ?? getOpenAIMaxRetries();
    this.sdk =
      options.sdk ??
      new OpenAI({
        apiKey,
        timeout: timeoutMs,
        maxRetries,
      });
  }

  async generateText(request: OpenAITextRequest): Promise<OpenAITextResponse> {
    const started = Date.now();
    const params: OpenAICreateParams = {
      model: this.model,
      input: request.input,
      store: false,
    };
    if (request.instructions !== undefined) {
      params.instructions = request.instructions;
    }
    if (request.maxOutputTokens !== undefined) {
      params.max_output_tokens = request.maxOutputTokens;
    }

    try {
      const raw = await this.sdk.responses.create(params);
      const result = normalizeTextResponse(raw, this.model);
      logOpenAICall({
        operation: "generateText",
        model: result.model,
        durationMs: Date.now() - started,
        success: true,
        requestId: result.requestId,
        usage: result.usage,
      });
      return result;
    } catch (error) {
      const mapped = mapOpenAIError(error);
      logOpenAICall({
        operation: "generateText",
        model: this.model,
        durationMs: Date.now() - started,
        success: false,
        errorCode: mapped.code,
      });
      throw mapped;
    }
  }

  async createResponse(request: OpenAIResponseRequest): Promise<OpenAIResponseResult> {
    const started = Date.now();
    const params: OpenAICreateParams = {
      model: this.model,
      input: request.input,
      store: false,
    };
    if (request.instructions !== undefined) {
      params.instructions = request.instructions;
    }
    if (request.maxOutputTokens !== undefined) {
      params.max_output_tokens = request.maxOutputTokens;
    }
    if (request.tools !== undefined && request.tools.length > 0) {
      params.tools = request.tools;
    }

    try {
      const raw = await this.sdk.responses.create(params);
      const result = normalizeResponseResult(raw, this.model);
      logOpenAICall({
        operation: "createResponse",
        model: result.model,
        durationMs: Date.now() - started,
        success: true,
        requestId: result.requestId,
        usage: result.usage,
        toolCallCount: result.functionCalls.length,
      });
      return result;
    } catch (error) {
      const mapped = mapOpenAIError(error);
      logOpenAICall({
        operation: "createResponse",
        model: this.model,
        durationMs: Date.now() - started,
        success: false,
        errorCode: mapped.code,
      });
      throw mapped;
    }
  }

  async generateStructured<T>(
    request: OpenAIStructuredRequest<T>
  ): Promise<OpenAIStructuredResponse<T>> {
    const started = Date.now();
    const params: Record<string, unknown> = {
      model: this.model,
      input: request.input,
      store: false,
      text: {
        format: zodTextFormat(request.schema, request.name),
      },
    };
    if (request.instructions !== undefined) {
      params.instructions = request.instructions;
    }
    if (request.maxOutputTokens !== undefined) {
      params.max_output_tokens = request.maxOutputTokens;
    }

    try {
      const raw = await this.sdk.responses.create(params);
      const value = parseStructuredOutput(raw, request.schema);
      const result: OpenAIStructuredResponse<T> = {
        value,
        model:
          typeof raw.model === "string" && raw.model.trim()
            ? raw.model
            : this.model,
        usage: normalizeUsage(raw.usage),
        requestId: raw.id,
      };
      logOpenAICall({
        operation: "generateStructured",
        model: result.model,
        durationMs: Date.now() - started,
        success: true,
        requestId: result.requestId,
        usage: result.usage,
      });
      return result;
    } catch (error) {
      const mapped = mapOpenAIError(error);
      logOpenAICall({
        operation: "generateStructured",
        model: this.model,
        durationMs: Date.now() - started,
        success: false,
        errorCode: mapped.code,
      });
      throw mapped;
    }
  }
}

export function normalizeTextResponse(
  raw: OpenAIRawResponse,
  fallbackModel: string
): OpenAITextResponse {
  const text = raw.output_text?.trim() ?? "";
  if (!text) {
    throw new OpenAIClientError(
      "INVALID_RESPONSE",
      "OpenAI no devolvió texto utilizable."
    );
  }
  return {
    text,
    model: typeof raw.model === "string" && raw.model.trim() ? raw.model : fallbackModel,
    usage: normalizeUsage(raw.usage),
    requestId: raw.id,
  };
}

export function normalizeResponseResult(
  raw: OpenAIRawResponse,
  fallbackModel: string
): OpenAIResponseResult {
  const functionCalls = extractFunctionCalls(raw);
  const text = raw.output_text?.trim() ?? "";
  if (functionCalls.length === 0 && !text) {
    throw new OpenAIClientError(
      "INVALID_RESPONSE",
      "OpenAI no devolvió texto utilizable."
    );
  }
  return {
    text,
    functionCalls,
    model: typeof raw.model === "string" && raw.model.trim() ? raw.model : fallbackModel,
    usage: normalizeUsage(raw.usage),
    requestId: raw.id,
  };
}

export function extractFunctionCalls(raw: OpenAIRawResponse): OpenAIFunctionCall[] {
  if (!Array.isArray(raw.output)) {
    return [];
  }
  const calls: OpenAIFunctionCall[] = [];
  for (const item of raw.output) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    if (record.type !== "function_call") {
      continue;
    }
    const callId = typeof record.call_id === "string" ? record.call_id.trim() : "";
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (!callId || !name) {
      continue;
    }
    calls.push({
      callId,
      name,
      arguments: typeof record.arguments === "string" ? record.arguments : "{}",
    });
  }
  return calls;
}

export function parseStructuredOutput<T>(
  raw: OpenAIRawResponse,
  schema: { parse: (data: unknown) => T }
): T {
  const text = raw.output_text?.trim() ?? "";
  if (!text) {
    throw new OpenAIClientError(
      "INVALID_RESPONSE",
      "OpenAI no devolvió texto utilizable."
    );
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new OpenAIClientError(
      "INVALID_RESPONSE",
      "OpenAI no devolvió JSON válido."
    );
  }
  try {
    return schema.parse(data);
  } catch (error) {
    throw new OpenAIClientError(
      "INVALID_RESPONSE",
      "OpenAI devolvió un objeto que no cumple el schema.",
      { cause: error }
    );
  }
}

export function normalizeUsage(usage?: OpenAIRawResponse["usage"]): OpenAIUsage | undefined {
  if (!usage) {
    return undefined;
  }
  const normalized: OpenAIUsage = {};
  if (typeof usage.input_tokens === "number") {
    normalized.inputTokens = usage.input_tokens;
  }
  if (typeof usage.output_tokens === "number") {
    normalized.outputTokens = usage.output_tokens;
  }
  if (typeof usage.total_tokens === "number") {
    normalized.totalTokens = usage.total_tokens;
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function mapOpenAIError(error: unknown): OpenAIClientError {
  if (error instanceof OpenAIClientError) {
    return error;
  }
  if (error instanceof AuthenticationError) {
    return new OpenAIClientError(
      "AUTHENTICATION",
      "OpenAI rechazó la autenticación.",
      { cause: error }
    );
  }
  if (error instanceof RateLimitError) {
    return new OpenAIClientError(
      "RATE_LIMIT",
      "OpenAI alcanzó el límite de solicitudes.",
      { cause: error }
    );
  }
  if (error instanceof APIConnectionTimeoutError) {
    return new OpenAIClientError(
      "TIMEOUT",
      "La solicitud a OpenAI superó el tiempo límite.",
      { cause: error }
    );
  }
  if (error instanceof InternalServerError) {
    return new OpenAIClientError(
      "PROVIDER_ERROR",
      "OpenAI no está disponible.",
      { cause: error }
    );
  }
  if (error instanceof Error && "status" in error) {
    const status = (error as { status?: number }).status;
    if (status === 401 || status === 403) {
      return new OpenAIClientError(
        "AUTHENTICATION",
        "OpenAI rechazó la autenticación.",
        { cause: error }
      );
    }
    if (status === 429) {
      return new OpenAIClientError(
        "RATE_LIMIT",
        "OpenAI alcanzó el límite de solicitudes.",
        { cause: error }
      );
    }
    if (typeof status === "number" && status >= 500) {
      return new OpenAIClientError(
        "PROVIDER_ERROR",
        "OpenAI no está disponible.",
        { cause: error }
      );
    }
  }
  const message =
    error instanceof Error ? sanitizeOpenAIMessage(error.message) : "OpenAI no está disponible.";
  return new OpenAIClientError("PROVIDER_ERROR", message, { cause: error });
}

function logOpenAICall(entry: {
  operation: string;
  model: string;
  durationMs: number;
  success: boolean;
  requestId?: string;
  usage?: OpenAIUsage;
  errorCode?: string;
  toolCallCount?: number;
}): void {
  console.info(
    JSON.stringify({
      source: "OpenAIClient",
      operation: entry.operation,
      model: entry.model,
      durationMs: entry.durationMs,
      success: entry.success,
      requestId: entry.requestId,
      usage: entry.usage,
      errorCode: entry.errorCode,
      toolCallCount: entry.toolCallCount,
    })
  );
}
