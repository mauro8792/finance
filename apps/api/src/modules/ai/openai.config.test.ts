import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getOpenAIApiKey,
  getOpenAIMaxRetries,
  getOpenAIModel,
  getOpenAITimeoutMs,
} from "./openai.config.js";
import { OpenAIClientError } from "./openai.errors.js";

test("getOpenAIApiKey throws a sanitized configuration error when missing", () => {
  assert.throws(
    () => getOpenAIApiKey({}),
    (error: unknown) =>
      error instanceof OpenAIClientError &&
      error.code === "CONFIGURATION" &&
      /OPENAI_API_KEY/.test(error.message) &&
      !error.message.includes("sk-")
  );
});

test("getOpenAIModel requires an explicit model and accepts override", () => {
  assert.throws(
    () => getOpenAIModel({}),
    (error: unknown) =>
      error instanceof OpenAIClientError && error.code === "CONFIGURATION"
  );
  assert.equal(getOpenAIModel({ OPENAI_MODEL: "test-model" }), "test-model");
});

test("getOpenAITimeoutMs defaults to 15000 and rejects invalid values", () => {
  assert.equal(getOpenAITimeoutMs({}), 15_000);
  assert.equal(getOpenAITimeoutMs({ OPENAI_TIMEOUT_MS: "8000" }), 8000);
  assert.throws(
    () => getOpenAITimeoutMs({ OPENAI_TIMEOUT_MS: "0" }),
    (error: unknown) =>
      error instanceof OpenAIClientError && error.code === "CONFIGURATION"
  );
  assert.throws(
    () => getOpenAITimeoutMs({ OPENAI_TIMEOUT_MS: "-1" }),
    (error: unknown) =>
      error instanceof OpenAIClientError && error.code === "CONFIGURATION"
  );
  assert.throws(
    () => getOpenAITimeoutMs({ OPENAI_TIMEOUT_MS: "abc" }),
    (error: unknown) =>
      error instanceof OpenAIClientError && error.code === "CONFIGURATION"
  );
});

test("getOpenAIMaxRetries defaults to 2 and rejects invalid values", () => {
  assert.equal(getOpenAIMaxRetries({}), 2);
  assert.equal(getOpenAIMaxRetries({ OPENAI_MAX_RETRIES: "0" }), 0);
  assert.throws(
    () => getOpenAIMaxRetries({ OPENAI_MAX_RETRIES: "-2" }),
    (error: unknown) =>
      error instanceof OpenAIClientError && error.code === "CONFIGURATION"
  );
  assert.throws(
    () => getOpenAIMaxRetries({ OPENAI_MAX_RETRIES: "1.5" }),
    (error: unknown) =>
      error instanceof OpenAIClientError && error.code === "CONFIGURATION"
  );
});
