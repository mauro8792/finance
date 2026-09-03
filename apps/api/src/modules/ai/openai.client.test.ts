import assert from "node:assert/strict";
import { test } from "node:test";
import {
  APIConnectionTimeoutError,
  AuthenticationError,
  InternalServerError,
  RateLimitError,
} from "openai";
import { z } from "zod";
import { OpenAIClient } from "./openai.client.js";
import { OpenAIClientError } from "./openai.errors.js";
import type { OpenAICreateParams, OpenAIRawResponse, OpenAIResponsesSdk } from "./openai.types.js";

function headers(): Headers {
  return new Headers();
}

function mockSdk(
  impl: (params: Record<string, unknown>) => Promise<OpenAIRawResponse>
): OpenAIResponsesSdk {
  return {
    responses: {
      create: impl,
    },
  };
}

function clientWith(
  impl: (params: Record<string, unknown>) => Promise<OpenAIRawResponse>
): OpenAIClient {
  return new OpenAIClient({
    apiKey: "test-key",
    model: "test-model",
    sdk: mockSdk(impl),
  });
}

test("generateText sends model, input, instructions, store:false and maxOutputTokens", async () => {
  const request = {
    instructions: "Sé breve.",
    input: "hola",
    maxOutputTokens: 32,
  };
  const frozen = { ...request };
  let captured: OpenAICreateParams | undefined;
  const client = clientWith(async (params) => {
    captured = params;
    return {
      id: "resp_1",
      model: "returned-model",
      output_text: "  respuesta  ",
      usage: { input_tokens: 4, output_tokens: 6, total_tokens: 10 },
    };
  });

  const result = await client.generateText(request);
  assert.deepEqual(request, frozen);
  assert.deepEqual(captured, {
    model: "test-model",
    input: "hola",
    store: false,
    instructions: "Sé breve.",
    max_output_tokens: 32,
  });
  assert.deepEqual(result, {
    text: "respuesta",
    model: "returned-model",
    usage: { inputTokens: 4, outputTokens: 6, totalTokens: 10 },
    requestId: "resp_1",
  });
});

test("generateText uses configured model when the provider omits it", async () => {
  const client = clientWith(async () => ({ output_text: "ok" }));
  const result = await client.generateText({ input: "ping" });
  assert.equal(result.model, "test-model");
  assert.equal(result.text, "ok");
});

test("generateText rejects an empty output_text", async () => {
  const client = clientWith(async () => ({ output_text: "   " }));
  await assert.rejects(
    () => client.generateText({ input: "ping" }),
    (error: unknown) =>
      error instanceof OpenAIClientError && error.code === "INVALID_RESPONSE"
  );
});

test("generateText maps authentication errors", async () => {
  const client = clientWith(async () => {
    throw new AuthenticationError(401, { message: "bad key" }, "bad key", headers());
  });
  await assert.rejects(
    () => client.generateText({ input: "ping" }),
    (error: unknown) =>
      error instanceof OpenAIClientError &&
      error.code === "AUTHENTICATION" &&
      !error.message.includes("sk-")
  );
});

test("generateText maps rate limit errors", async () => {
  const client = clientWith(async () => {
    throw new RateLimitError(429, { message: "slow down" }, "slow down", headers());
  });
  await assert.rejects(
    () => client.generateText({ input: "ping" }),
    (error: unknown) =>
      error instanceof OpenAIClientError && error.code === "RATE_LIMIT"
  );
});

test("generateText maps timeout errors", async () => {
  const client = clientWith(async () => {
    throw new APIConnectionTimeoutError({ message: "timed out" });
  });
  await assert.rejects(
    () => client.generateText({ input: "ping" }),
    (error: unknown) =>
      error instanceof OpenAIClientError && error.code === "TIMEOUT"
  );
});

test("generateText maps provider 5xx errors", async () => {
  const client = clientWith(async () => {
    throw new InternalServerError(503, { message: "down" }, "down", headers());
  });
  await assert.rejects(
    () => client.generateText({ input: "ping" }),
    (error: unknown) =>
      error instanceof OpenAIClientError && error.code === "PROVIDER_ERROR"
  );
});

test("OpenAIClient construction without a key fails with CONFIGURATION", () => {
  const previous = process.env.OPENAI_API_KEY;
  const previousModel = process.env.OPENAI_MODEL;
  delete process.env.OPENAI_API_KEY;
  process.env.OPENAI_MODEL = "test-model";
  try {
    assert.throws(
      () => new OpenAIClient(),
      (error: unknown) =>
        error instanceof OpenAIClientError &&
        error.code === "CONFIGURATION" &&
        !error.message.includes("sk-")
    );
  } finally {
    if (previous === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previous;
    }
    if (previousModel === undefined) {
      delete process.env.OPENAI_MODEL;
    } else {
      process.env.OPENAI_MODEL = previousModel;
    }
  }
});

const SampleSchema = z
  .object({
    label: z.string(),
    count: z.number().int(),
  })
  .strict();

test("generateStructured sends store:false and a json_schema text format", async () => {
  const request = {
    instructions: "Sólo schema.",
    input: "hola",
    maxOutputTokens: 64,
    name: "sample",
    schema: SampleSchema,
  };
  const frozen = { ...request };
  let captured: Record<string, unknown> | undefined;
  const client = clientWith(async (params) => {
    captured = params;
    return {
      id: "resp_s",
      model: "returned-model",
      output_text: JSON.stringify({ label: "ok", count: 2 }),
      usage: { input_tokens: 3, output_tokens: 5, total_tokens: 8 },
    };
  });

  const result = await client.generateStructured(request);
  assert.deepEqual(request, frozen);
  assert.equal(captured?.model, "test-model");
  assert.equal(captured?.input, "hola");
  assert.equal(captured?.store, false);
  assert.equal(captured?.instructions, "Sólo schema.");
  assert.equal(captured?.max_output_tokens, 64);
  const format = (captured?.text as { format?: { type?: string; name?: string } } | undefined)
    ?.format;
  assert.equal(format?.type, "json_schema");
  assert.equal(format?.name, "sample");
  assert.deepEqual(result, {
    value: { label: "ok", count: 2 },
    model: "returned-model",
    usage: { inputTokens: 3, outputTokens: 5, totalTokens: 8 },
    requestId: "resp_s",
  });
});

test("generateStructured rejects invalid JSON, extra fields and empty text", async () => {
  const invalidJson = clientWith(async () => ({ output_text: "not-json" }));
  await assert.rejects(
    () =>
      invalidJson.generateStructured({
        input: "ping",
        name: "sample",
        schema: SampleSchema,
      }),
    (error: unknown) =>
      error instanceof OpenAIClientError && error.code === "INVALID_RESPONSE"
  );

  const extraFields = clientWith(async () => ({
    output_text: JSON.stringify({ label: "ok", count: 1, extra: true }),
  }));
  await assert.rejects(
    () =>
      extraFields.generateStructured({
        input: "ping",
        name: "sample",
        schema: SampleSchema,
      }),
    (error: unknown) =>
      error instanceof OpenAIClientError && error.code === "INVALID_RESPONSE"
  );

  const empty = clientWith(async () => ({ output_text: "   " }));
  await assert.rejects(
    () =>
      empty.generateStructured({
        input: "ping",
        name: "sample",
        schema: SampleSchema,
      }),
    (error: unknown) =>
      error instanceof OpenAIClientError && error.code === "INVALID_RESPONSE"
  );
});

test("createResponse sends tools, store:false and parses function calls", async () => {
  let captured: OpenAICreateParams | undefined;
  const client = clientWith(async (params) => {
    captured = params;
    return {
      id: "resp_tools",
      model: "returned-model",
      output_text: "",
      output: [
        {
          type: "function_call",
          call_id: "call_1",
          name: "get_financial_summary",
          arguments: '{"year":2026,"month":9}',
        },
      ],
      usage: { input_tokens: 8, output_tokens: 4, total_tokens: 12 },
    };
  });

  const tools = [
    {
      type: "function" as const,
      name: "get_financial_summary",
      description: "resumen",
      parameters: { type: "object" },
    },
  ];
  const result = await client.createResponse({
    instructions: "Usá tools.",
    input: "¿cuál es mi runway?",
    tools,
    maxOutputTokens: 1024,
  });

  assert.deepEqual(captured, {
    model: "test-model",
    input: "¿cuál es mi runway?",
    store: false,
    instructions: "Usá tools.",
    max_output_tokens: 1024,
    tools,
  });
  assert.equal(result.text, "");
  assert.deepEqual(result.functionCalls, [
    {
      callId: "call_1",
      name: "get_financial_summary",
      arguments: '{"year":2026,"month":9}',
    },
  ]);
  assert.equal(result.model, "returned-model");
  assert.equal(result.requestId, "resp_tools");
});

test("createResponse accepts a final text without tool calls", async () => {
  const client = clientWith(async () => ({ output_text: "  Hola.  " }));
  const result = await client.createResponse({ input: "hola" });
  assert.equal(result.text, "Hola.");
  assert.deepEqual(result.functionCalls, []);
});

test("createResponse rejects an empty payload without tool calls", async () => {
  const client = clientWith(async () => ({ output_text: "  ", output: [] }));
  await assert.rejects(
    () => client.createResponse({ input: "hola" }),
    (error: unknown) =>
      error instanceof OpenAIClientError && error.code === "INVALID_RESPONSE"
  );
});
