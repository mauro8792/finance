import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import express from "express";
import { stubAuth } from "../../middlewares/require-auth.js";
import request from "supertest";
import { app as mountedApp } from "../../app.js";
import { errorHandler } from "../../middlewares/error-handler.js";
import type { Category } from "../categories/category.types.js";
import type { User, UserRepository } from "../users/user.types.js";
import { DEFAULT_USER_TIMEZONE } from "../users/user.types.js";
import { AiController, type AiChatHandler } from "./ai.controller.js";
import type { AiToolContext } from "./tools/ai-tool.types.js";
import { createAiRouter } from "./ai.routes.js";
import { OpenAIClientError } from "./openai.errors.js";
import type { OpenAIStructuredRequest, OpenAIStructuredResponse } from "./openai.types.js";
import type { ParsedTransactions, TransactionParseResult } from "./transaction-parser.schema.js";
import {
  TransactionParserService,
  type ParserAllowedCategory,
} from "./transaction-parser.service.js";

const expenseResult: TransactionParseResult = {
  transactions: [
    {
      type: "EXPENSE",
      amount: "75000.00",
      currency: "ARS",
      categoryHint: "Supermercado",
      accountHint: null,
      description: "Supermercado",
      occurredAt: null,
      paymentMethod: null,
      incomeKind: null,
    },
  ],
  ambiguities: [],
};

const incomeResult: TransactionParseResult = {
  transactions: [
    {
      type: "INCOME",
      amount: "500000.00",
      currency: "ARS",
      categoryHint: "Sueldo",
      accountHint: null,
      description: "Sueldo",
      occurredAt: null,
      paymentMethod: null,
      incomeKind: "OPERATING",
    },
  ],
  ambiguities: [],
};

const owner: User = {
  id: "user-1",
  name: "Dev",
  email: "qa@example.test",
  timezone: DEFAULT_USER_TIMEZONE,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: "cat-comida",
    userId: owner.id,
    name: "Comida",
    type: "EXPENSE",
    isSystem: true,
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

const defaultCategories: Category[] = [
  category({ id: "cat-comida", name: "Comida" }),
  category({ id: "cat-transporte", name: "Transporte" }),
  category({ id: "cat-servicios", name: "Servicios" }),
];

class MemoryUserRepository implements UserRepository {
  constructor(private readonly user: User | null) {}
  async create(): Promise<User> {
    if (!this.user) {
      throw new Error("no user");
    }
    return this.user;
  }
  async findById(id: string): Promise<User | null> {
    return this.user && this.user.id === id ? this.user : null;
  }
  async findFirst(): Promise<User | null> {
    return this.user;
  }
  async findAuthByEmail(email: string) {
    return this.user && this.user.email === email
      ? { user: this.user, passwordHash: "invalid" }
      : null;
  }
  async count() {
    return this.user ? 1 : 0;
  }
  async setCredentials() {
    if (!this.user) {
      throw new Error("no user");
    }
    return this.user;
  }
}

class MemoryCategoryList {
  listCalls: string[] = [];
  constructor(private readonly items: Category[]) {}
  async list(userId: string): Promise<Category[]> {
    this.listCalls.push(userId);
    return this.items.filter((item) => item.userId === userId);
  }
}

class FakeAssistant implements AiChatHandler {
  calls: { message: string; context: AiToolContext }[] = [];
  next: { answer: string } | (() => Promise<{ answer: string }>) = {
    answer: "Tu runway actual es de 12.00 meses.",
  };

  async ask(message: string, context: AiToolContext): Promise<{ answer: string }> {
    this.calls.push({ message, context });
    if (typeof this.next === "function") {
      return this.next();
    }
    return this.next;
  }
}

class FakeParser {
  calls: string[] = [];
  lastCategories: ParserAllowedCategory[] | undefined;
  next: TransactionParseResult | (() => Promise<TransactionParseResult>) = expenseResult;

  async parse(
    text: string,
    allowedCategories: ParserAllowedCategory[] = []
  ): Promise<TransactionParseResult> {
    this.calls.push(text);
    this.lastCategories = allowedCategories;
    if (typeof this.next === "function") {
      return this.next();
    }
    return this.next;
  }
}

class FakeOpenAI {
  lastRequest: OpenAIStructuredRequest<ParsedTransactions> | undefined;
  next: ParsedTransactions = {
    transactions: [
      {
        type: "EXPENSE",
        amount: "15000.00",
        currency: null,
        categoryHint: "Comida",
        accountHint: null,
        description: "panadería",
        occurredAt: null,
        paymentMethod: null,
        incomeKind: null,
      },
    ],
    ambiguities: [],
  };
  calls = 0;

  async generateStructured(
    request: OpenAIStructuredRequest<ParsedTransactions>
  ): Promise<OpenAIStructuredResponse<ParsedTransactions>> {
    this.calls += 1;
    this.lastRequest = request;
    return { value: this.next, model: "test-model", requestId: "resp_test" };
  }
}

function appWith(
  parser: Pick<TransactionParserService, "parse">,
  categories: Category[] = [],
  user: User | null = owner,
  chat: AiChatHandler = new FakeAssistant()
) {
  const app = express();
  if (user) {
    app.use(stubAuth(user.id));
  }
  app.use(express.json());
  app.use(
    "/api/ai",
    createAiRouter(
      new AiController(
        parser,
        new MemoryCategoryList(categories),
        new MemoryUserRepository(user),
        chat
      )
    )
  );
  app.use(errorHandler);
  return app;
}

test("POST /api/ai/parse-transaction returns a mocked expense proposal", async () => {
  const parser = new FakeParser();
  const response = await request(appWith(parser))
    .post("/api/ai/parse-transaction")
    .send({ text: "gasté 75 mil en el super" });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, expenseResult);
  assert.deepEqual(parser.calls, ["gasté 75 mil en el super"]);
});

test("POST /api/ai/parse-transaction returns a mocked income proposal", async () => {
  const parser = new FakeParser();
  parser.next = incomeResult;
  const response = await request(appWith(parser))
    .post("/api/ai/parse-transaction")
    .send({ text: "me depositaron 500 mil de sueldo" });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, incomeResult);
  assert.equal(response.body.transactions[0].amount, "500000.00");
  assert.equal(typeof response.body.transactions[0].amount, "string");
});

test("POST /api/ai/parse-transaction rejects missing text", async () => {
  const parser = new FakeParser();
  const response = await request(appWith(parser)).post("/api/ai/parse-transaction").send({});
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
  assert.equal(parser.calls.length, 0);
});

test("POST /api/ai/parse-transaction rejects empty text", async () => {
  const parser = new FakeParser();
  const response = await request(appWith(parser))
    .post("/api/ai/parse-transaction")
    .send({ text: "" });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
  assert.equal(parser.calls.length, 0);
});

test("POST /api/ai/parse-transaction rejects whitespace-only text", async () => {
  const parser = new FakeParser();
  const response = await request(appWith(parser))
    .post("/api/ai/parse-transaction")
    .send({ text: "   " });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
  assert.equal(parser.calls.length, 0);
});

test("POST /api/ai/parse-transaction rejects a non-string text", async () => {
  const parser = new FakeParser();
  const response = await request(appWith(parser))
    .post("/api/ai/parse-transaction")
    .send({ text: 75000 });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
  assert.equal(parser.calls.length, 0);
});

test("POST /api/ai/parse-transaction returns parser ambiguities", async () => {
  const parser = new FakeParser();
  parser.next = {
    transactions: [
      {
        type: null,
        amount: null,
        currency: "ARS",
        categoryHint: "Gym",
        accountHint: null,
        description: null,
        occurredAt: null,
        paymentMethod: null,
        incomeKind: null,
      },
    ],
    ambiguities: ["categoría incierta", "falta importe", "gasto/ingreso ambiguo"],
  };
  const response = await request(appWith(parser))
    .post("/api/ai/parse-transaction")
    .send({ text: "algo del gym" });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.ambiguities, [
    "categoría incierta",
    "falta importe",
    "gasto/ingreso ambiguo",
  ]);
});

test("POST /api/ai/parse-transaction maps provider errors to sanitized 503", async () => {
  const parser = new FakeParser();
  parser.next = async () => {
    throw new OpenAIClientError("PROVIDER_ERROR", "sk-secret-should-not-leak");
  };
  const response = await request(appWith(parser))
    .post("/api/ai/parse-transaction")
    .send({ text: "gasté 75 mil en el super" });
  assert.equal(response.status, 503);
  assert.equal(response.body.error.code, "AI_UNAVAILABLE");
  assert.equal(response.body.error.message, "El asistente no está disponible temporalmente.");
  assert.equal(response.body.error.stack, undefined);
  assert.doesNotMatch(JSON.stringify(response.body), /sk-/);
  assert.doesNotMatch(JSON.stringify(response.body), /prompt/i);
});

test("POST /api/ai/parse-transaction maps unexpected errors to sanitized 500", async () => {
  const parser = new FakeParser();
  parser.next = async () => {
    throw new Error("raw SDK boom sk-secret");
  };
  const response = await request(appWith(parser))
    .post("/api/ai/parse-transaction")
    .send({ text: "gasté 75 mil en el super" });
  assert.equal(response.status, 500);
  assert.equal(response.body.error.code, "INTERNAL_ERROR");
  assert.equal(response.body.error.message, "Error interno del servidor.");
  assert.doesNotMatch(JSON.stringify(response.body), /sk-/);
});

test("POST /api/ai/parse-transaction maps rate limit to 429", async () => {
  const parser = new FakeParser();
  parser.next = async () => {
    throw new OpenAIClientError("RATE_LIMIT", "slow down");
  };
  const response = await request(appWith(parser))
    .post("/api/ai/parse-transaction")
    .send({ text: "gasté 75 mil en el super" });
  assert.equal(response.status, 429);
  assert.equal(response.body.error.code, "RATE_LIMIT");
  assert.doesNotMatch(JSON.stringify(response.body), /sk-/);
});

test("POST /api/ai/parse-transaction does not persist and does not send extra context", async () => {
  const parser = new FakeParser();
  const response = await request(appWith(parser))
    .post("/api/ai/parse-transaction")
    .send({
      text: "gasté 75 mil en el super",
      userId: "should-be-rejected-if-accepted",
    });
  assert.equal(response.status, 400);
  assert.equal(parser.calls.length, 0);

  const ok = await request(appWith(parser))
    .post("/api/ai/parse-transaction")
    .send({ text: "gasté 75 mil en el super" });
  assert.equal(ok.status, 200);
  assert.deepEqual(parser.calls, ["gasté 75 mil en el super"]);
  assert.doesNotMatch(parser.calls[0] ?? "", /balance|historial|housing|investment/i);

  const here = dirname(fileURLToPath(import.meta.url));
  const controllerSrc = readFileSync(join(here, "ai.controller.ts"), "utf8");
  const routesSrc = readFileSync(join(here, "ai.routes.ts"), "utf8");
  const parserSrc = readFileSync(join(here, "transaction-parser.service.ts"), "utf8");
  const openaiSrc = readFileSync(join(here, "openai.client.ts"), "utf8");
  assert.doesNotMatch(controllerSrc, /prisma|Prisma/);
  assert.doesNotMatch(controllerSrc, /transactions\.create|prisma\.transaction/i);
  assert.match(routesSrc, /CategoryService/);
  assert.match(routesSrc, /PrismaCategoryRepository/);
  assert.doesNotMatch(parserSrc, /prisma|Prisma|CategoryService/);
  assert.doesNotMatch(openaiSrc, /Category|Prisma|Account/);
});

test("POST /api/ai/parse-transaction loads categories from the backend and does not accept them in the request", async () => {
  const parser = new FakeParser();
  const categories = new MemoryCategoryList([
    ...defaultCategories,
    category({
      id: "cat-inactive",
      name: "Vieja",
      isActive: false,
    }),
    category({
      id: "cat-other",
      userId: "other-user",
      name: "Ajena",
    }),
  ]);
  const app = express();
  app.use(stubAuth(owner.id));
  app.use(express.json());
  app.use(
    "/api/ai",
    createAiRouter(
      new AiController(
        parser,
        categories,
        new MemoryUserRepository(owner),
        new FakeAssistant()
      )
    )
  );
  app.use(errorHandler);

  const rejected = await request(app)
    .post("/api/ai/parse-transaction")
    .send({
      text: "gasté 15 mil en la panadería",
      categories: [{ name: "Manipulada", type: "EXPENSE" }],
    });
  assert.equal(rejected.status, 400);
  assert.equal(parser.calls.length, 0);
  assert.deepEqual(categories.listCalls, []);

  const ok = await request(app)
    .post("/api/ai/parse-transaction")
    .send({ text: "gasté 15 mil en la panadería" });
  assert.equal(ok.status, 200);
  assert.deepEqual(parser.calls, ["gasté 15 mil en la panadería"]);
  assert.deepEqual(categories.listCalls, [owner.id]);
  assert.deepEqual(parser.lastCategories, [
    { name: "Comida", type: "EXPENSE" },
    { name: "Transporte", type: "EXPENSE" },
    { name: "Servicios", type: "EXPENSE" },
  ]);
  assert.equal(ok.body.transactions[0].categoryHint, "Supermercado");
  assert.equal(ok.body.transactions[0].accountHint, null);
  assert.doesNotMatch(JSON.stringify(ok.body), /cat-comida|categoryId/);
});

test("POST /api/ai/parse-transaction with mocked provider keeps a canonical allowed category", async () => {
  const openai = new FakeOpenAI();
  const response = await request(appWith(new TransactionParserService(openai), defaultCategories))
    .post("/api/ai/parse-transaction")
    .send({ text: "gasté 15 mil en la panadería" });

  assert.equal(response.status, 200);
  assert.equal(openai.calls, 1);
  assert.equal(openai.lastRequest?.input, "gasté 15 mil en la panadería");
  assert.match(openai.lastRequest?.instructions ?? "", /"name":"Comida"/);
  assert.doesNotMatch(openai.lastRequest?.instructions ?? "", /cat-comida/);
  assert.equal(response.body.transactions[0].categoryHint, "Comida");
  assert.equal(response.body.transactions[0].accountHint, null);
  assert.doesNotMatch(JSON.stringify(response.body), /cat-comida|categoryId/);
});

test("POST /api/ai/parse-transaction does not silently accept a category outside the allow-list", async () => {
  const openai = new FakeOpenAI();
  openai.next = {
    transactions: [
      {
        type: "EXPENSE",
        amount: "15000.00",
        currency: "ARS",
        categoryHint: "Panadería",
        accountHint: null,
        description: "panadería",
        occurredAt: null,
        paymentMethod: null,
        incomeKind: null,
      },
    ],
    ambiguities: [],
  };
  const response = await request(appWith(new TransactionParserService(openai), defaultCategories))
    .post("/api/ai/parse-transaction")
    .send({ text: "gasté 15 mil en la panadería" });

  assert.equal(response.status, 200);
  assert.equal(response.body.transactions[0].categoryHint, null);
  assert.ok(response.body.ambiguities.includes("categoría no reconocida"));
});

test("POST /api/ai/parse-transaction works without categories and does not invent one", async () => {
  const openai = new FakeOpenAI();
  const response = await request(appWith(new TransactionParserService(openai), []))
    .post("/api/ai/parse-transaction")
    .send({ text: "gasté 15 mil en la panadería" });

  assert.equal(response.status, 200);
  assert.equal(response.body.transactions[0].categoryHint, null);
  assert.equal(response.body.transactions[0].amount, "15000.00");
});

test("POST /api/ai/parse-transaction returns multiple proposals without persisting", async () => {
  const parser = new FakeParser();
  parser.next = {
    transactions: [
      {
        type: "EXPENSE",
        amount: "15000.00",
        currency: "ARS",
        categoryHint: "Comida",
        accountHint: null,
        description: "panadería",
        occurredAt: null,
        paymentMethod: null,
        incomeKind: null,
      },
      {
        type: "EXPENSE",
        amount: "30000.00",
        currency: "ARS",
        categoryHint: "Transporte",
        accountHint: null,
        description: "nafta",
        occurredAt: null,
        paymentMethod: null,
        incomeKind: null,
      },
    ],
    ambiguities: ["La moneda y el medio de pago no están especificados."],
  };
  const response = await request(appWith(parser, defaultCategories))
    .post("/api/ai/parse-transaction")
    .send({ text: "gasté 15 mil en panadería y 30 mil en nafta" });

  assert.equal(response.status, 200);
  assert.equal(response.body.transactions.length, 2);
  assert.equal(response.body.transactions[0].amount, "15000.00");
  assert.equal(response.body.transactions[1].amount, "30000.00");
  assert.equal(response.body.transactions[0].categoryHint, "Comida");
  assert.equal(response.body.transactions[1].categoryHint, "Transporte");
  assert.deepEqual(parser.calls, ["gasté 15 mil en panadería y 30 mil en nafta"]);
  assert.doesNotMatch(JSON.stringify(response.body), /categoryId|cat-comida/);
  assert.ok(
    response.body.ambiguities.includes("La moneda y el medio de pago no están especificados.")
  );
});

test("POST /api/ai/parse-transaction with mocked provider sanitizes one invalid hint among many", async () => {
  const openai = new FakeOpenAI();
  openai.next = {
    transactions: [
      {
        type: "EXPENSE",
        amount: "15000.00",
        currency: "ARS",
        categoryHint: "Comida",
        accountHint: null,
        description: "panadería",
        occurredAt: null,
        paymentMethod: null,
        incomeKind: null,
      },
      {
        type: "EXPENSE",
        amount: "30000.00",
        currency: "ARS",
        categoryHint: "Panadería",
        accountHint: null,
        description: "nafta",
        occurredAt: null,
        paymentMethod: null,
        incomeKind: null,
      },
    ],
    ambiguities: [],
  };
  const response = await request(appWith(new TransactionParserService(openai), defaultCategories))
    .post("/api/ai/parse-transaction")
    .send({ text: "gasté 15 mil en panadería y 30 mil en nafta" });

  assert.equal(response.status, 200);
  assert.equal(openai.calls, 1);
  assert.equal(response.body.transactions.length, 2);
  assert.equal(response.body.transactions[0].categoryHint, "Comida");
  assert.equal(response.body.transactions[1].categoryHint, null);
  assert.ok(response.body.ambiguities.includes("categoría no reconocida"));
});

test("POST /api/ai/parse-transaction rejects text longer than 2000 characters", async () => {
  const response = await request(appWith(new FakeParser()))
    .post("/api/ai/parse-transaction")
    .send({ text: "a".repeat(2001) });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
  assert.match(String(response.body.error.message), /2000/);
});

test("POST /api/ai/parse-transaction is mounted on the real app and requires auth", async () => {
  const response = await request(mountedApp).post("/api/ai/parse-transaction").send({});
  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, "UNAUTHENTICATED");
});

test("POST /api/ai/chat rejects message longer than 4000 characters", async () => {
  const response = await request(appWith(new FakeParser()))
    .post("/api/ai/chat")
    .send({ message: "b".repeat(4001) });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
  assert.match(String(response.body.error.message), /4000/);
});

test("POST /api/ai/chat returns a mocked answer", async () => {
  const chat = new FakeAssistant();
  const response = await request(appWith(new FakeParser(), [], owner, chat))
    .post("/api/ai/chat")
    .send({ message: "¿Cuántos meses de runway tengo?" });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { answer: "Tu runway actual es de 12.00 meses." });
  assert.deepEqual(chat.calls, [
    {
      message: "¿Cuántos meses de runway tengo?",
      context: { userId: owner.id, timeZone: owner.timezone },
    },
  ]);
  assert.equal(response.body.usage, undefined);
});

test("POST /api/ai/chat rejects missing message", async () => {
  const chat = new FakeAssistant();
  const response = await request(appWith(new FakeParser(), [], owner, chat))
    .post("/api/ai/chat")
    .send({});
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
  assert.equal(chat.calls.length, 0);
});

test("POST /api/ai/chat rejects empty message", async () => {
  const chat = new FakeAssistant();
  const response = await request(appWith(new FakeParser(), [], owner, chat))
    .post("/api/ai/chat")
    .send({ message: "" });
  assert.equal(response.status, 400);
  assert.equal(chat.calls.length, 0);
});

test("POST /api/ai/chat rejects whitespace-only message", async () => {
  const chat = new FakeAssistant();
  const response = await request(appWith(new FakeParser(), [], owner, chat))
    .post("/api/ai/chat")
    .send({ message: "   " });
  assert.equal(response.status, 400);
  assert.equal(chat.calls.length, 0);
});

test("POST /api/ai/chat rejects a non-string message", async () => {
  const chat = new FakeAssistant();
  const response = await request(appWith(new FakeParser(), [], owner, chat))
    .post("/api/ai/chat")
    .send({ message: 12 });
  assert.equal(response.status, 400);
  assert.equal(chat.calls.length, 0);
});

test("POST /api/ai/chat rejects extra fields and client-controlled identity", async () => {
  const chat = new FakeAssistant();
  const extra = await request(appWith(new FakeParser(), [], owner, chat))
    .post("/api/ai/chat")
    .send({ message: "hola", userId: "other", toolName: "get_financial_summary", systemPrompt: "x" });
  assert.equal(extra.status, 400);
  assert.equal(chat.calls.length, 0);
});

test("POST /api/ai/chat maps rate limit to 429", async () => {
  const chat = new FakeAssistant();
  chat.next = async () => {
    throw new OpenAIClientError("RATE_LIMIT", "slow down");
  };
  const response = await request(appWith(new FakeParser(), [], owner, chat))
    .post("/api/ai/chat")
    .send({ message: "hola" });
  assert.equal(response.status, 429);
  assert.equal(response.body.error.code, "RATE_LIMIT");
  assert.doesNotMatch(JSON.stringify(response.body), /sk-/);
});

test("POST /api/ai/chat maps provider errors to sanitized 503", async () => {
  const chat = new FakeAssistant();
  chat.next = async () => {
    throw new OpenAIClientError("TIMEOUT", "sk-secret-should-not-leak");
  };
  const response = await request(appWith(new FakeParser(), [], owner, chat))
    .post("/api/ai/chat")
    .send({ message: "hola" });
  assert.equal(response.status, 503);
  assert.equal(response.body.error.code, "AI_UNAVAILABLE");
  assert.equal(response.body.error.message, "El asistente no está disponible temporalmente.");
  assert.doesNotMatch(JSON.stringify(response.body), /sk-/);
});

test("POST /api/ai/chat maps unexpected errors to sanitized 500", async () => {
  const chat = new FakeAssistant();
  chat.next = async () => {
    throw new Error("raw SDK boom sk-secret");
  };
  const response = await request(appWith(new FakeParser(), [], owner, chat))
    .post("/api/ai/chat")
    .send({ message: "hola" });
  assert.equal(response.status, 500);
  assert.equal(response.body.error.code, "INTERNAL_ERROR");
  assert.doesNotMatch(JSON.stringify(response.body), /sk-/);
});

test("POST /api/ai/chat is mounted on the real app and requires auth", async () => {
  const response = await request(mountedApp).post("/api/ai/chat").send({});
  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, "UNAUTHENTICATED");
});

test("POST /api/ai/chat mocks a no-income simulation question", async () => {
  const chat = new FakeAssistant();
  chat.next = {
    answer:
      "Actualmente tenés 12.00 meses de runway. En el escenario de 6 meses sin ingresos, el capital proyectado sería menor. Nada se modificó.",
  };
  const response = await request(appWith(new FakeParser(), [], owner, chat))
    .post("/api/ai/chat")
    .send({ message: "¿Qué pasa si no tengo ingresos por 6 meses?" });
  assert.equal(response.status, 200);
  assert.deepEqual(chat.calls[0]?.message, "¿Qué pasa si no tengo ingresos por 6 meses?");
  assert.match(response.body.answer, /escenario/i);
  assert.doesNotMatch(response.body.answer, /separé|moví/i);
});

test("POST /api/ai/chat mocks a new-job simulation question", async () => {
  const chat = new FakeAssistant();
  chat.next = {
    answer:
      "Si consiguieras trabajo en 3 meses cobrando ARS 3500000.00, el escenario cambiaría el consumo de fondo. No se aplicó ningún cambio.",
  };
  const response = await request(appWith(new FakeParser(), [], owner, chat))
    .post("/api/ai/chat")
    .send({
      message: "¿Qué pasa si consigo trabajo en 3 meses cobrando 3500000.00 por mes?",
    });
  assert.equal(response.status, 200);
  assert.match(response.body.answer, /Si consiguieras/i);
});

test("POST /api/ai/chat mocks a housing reserve simulation with FX", async () => {
  const chat = new FakeAssistant();
  chat.next = {
    answer:
      "Si separaras 8 cuotas de vivienda al tipo de cambio 1400 ARS por USD, el escenario dejaría capital ARS restante. No se compraron dólares.",
  };
  const response = await request(appWith(new FakeParser(), [], owner, chat))
    .post("/api/ai/chat")
    .send({
      message:
        "¿Cuánto me queda si separo 8 cuotas de vivienda con tipo de cambio 1400?",
    });
  assert.equal(response.status, 200);
  assert.match(response.body.answer, /Si separaras/i);
  assert.doesNotMatch(response.body.answer, /separé 8 cuotas/);
});
