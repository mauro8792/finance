export type OpenAITextRequest = {
  instructions?: string;
  input: string;
  maxOutputTokens?: number;
};

export type OpenAIUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type OpenAITextResponse = {
  text: string;
  model: string;
  usage?: OpenAIUsage;
  requestId?: string;
};

export type OpenAIToolDefinition = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type OpenAIInputItem =
  | { type: "message"; role: "user" | "assistant"; content: string }
  | { type: "function_call"; call_id: string; name: string; arguments: string }
  | { type: "function_call_output"; call_id: string; output: string };

export type OpenAIFunctionCall = {
  callId: string;
  name: string;
  arguments: string;
};

export type OpenAIResponseRequest = {
  instructions?: string;
  input: string | OpenAIInputItem[];
  tools?: OpenAIToolDefinition[];
  maxOutputTokens?: number;
};

export type OpenAIResponseResult = {
  text: string;
  functionCalls: OpenAIFunctionCall[];
  model: string;
  usage?: OpenAIUsage;
  requestId?: string;
};

export type OpenAIRawUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
};

export type OpenAIRawResponse = {
  id?: string;
  model?: string;
  output_text?: string | null;
  usage?: OpenAIRawUsage | null;
  output?: unknown;
};

export type OpenAICreateParams = {
  model: string;
  input: string | OpenAIInputItem[];
  store: false;
  instructions?: string;
  max_output_tokens?: number;
  tools?: OpenAIToolDefinition[];
};

export type OpenAIStructuredRequest<T> = {
  instructions?: string;
  input: string;
  maxOutputTokens?: number;
  name: string;
  schema: {
    parse: (data: unknown) => T;
    _zod: { output: unknown };
  };
};

export type OpenAIStructuredResponse<T> = {
  value: T;
  model: string;
  usage?: OpenAIUsage;
  requestId?: string;
};

export type OpenAIResponsesSdk = {
  responses: {
    create: (params: Record<string, unknown>) => Promise<OpenAIRawResponse>;
  };
};
