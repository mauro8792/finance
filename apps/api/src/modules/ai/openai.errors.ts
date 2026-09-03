export type OpenAIErrorCode =
  | "CONFIGURATION"
  | "AUTHENTICATION"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "PROVIDER_ERROR"
  | "INVALID_RESPONSE";

export class OpenAIClientError extends Error {
  constructor(
    public readonly code: OpenAIErrorCode,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "OpenAIClientError";
  }
}

const SENSITIVE = /sk-[A-Za-z0-9_-]+/g;

export function sanitizeOpenAIMessage(message: string): string {
  return message.replace(SENSITIVE, "[redacted]");
}
