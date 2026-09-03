import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AIParsedTransactionSchema,
  ParsedTransactionsSchema,
} from "./transaction-parser.schema.js";

const validItem = {
  type: "EXPENSE" as const,
  amount: "75000.00",
  currency: "ARS" as const,
  categoryHint: "Supermercado",
  accountHint: null,
  description: "Supermercado",
  occurredAt: null,
  paymentMethod: null,
  incomeKind: null,
};

test("schema accepts a canonical expense draft", () => {
  const parsed = AIParsedTransactionSchema.parse(validItem);
  assert.equal(parsed.amount, "75000.00");
  assert.equal(parsed.type, "EXPENSE");
});

test("schema rejects a non-canonical amount", () => {
  assert.throws(() => AIParsedTransactionSchema.parse({ ...validItem, amount: "75000" }));
  assert.throws(() => AIParsedTransactionSchema.parse({ ...validItem, amount: "75 mil" }));
  assert.throws(() => AIParsedTransactionSchema.parse({ ...validItem, amount: "abc" }));
  assert.throws(() => AIParsedTransactionSchema.parse({ ...validItem, amount: "0.00" }));
  assert.throws(() => AIParsedTransactionSchema.parse({ ...validItem, amount: "-1.00" }));
});

test("schema accepts a null amount as a partial draft", () => {
  const parsed = AIParsedTransactionSchema.parse({ ...validItem, amount: null });
  assert.equal(parsed.amount, null);
});

test("schema rejects extra fields", () => {
  assert.throws(() =>
    AIParsedTransactionSchema.parse({ ...validItem, confidence: 0.9 })
  );
  assert.throws(() =>
    ParsedTransactionsSchema.parse({
      transactions: [validItem],
      ambiguities: [],
      extra: true,
    })
  );
});

test("schema accepts multiple items without treating them as persistence", () => {
  const parsed = ParsedTransactionsSchema.parse({
    transactions: [
      validItem,
      {
        ...validItem,
        type: "INCOME",
        amount: "500000.00",
        categoryHint: "Sueldo",
        description: "Sueldo",
        incomeKind: "OPERATING",
      },
    ],
    ambiguities: [],
  });
  assert.equal(parsed.transactions.length, 2);
});

test("schema rejects transfer types", () => {
  assert.throws(() =>
    AIParsedTransactionSchema.parse({ ...validItem, type: "TRANSFER" })
  );
});
