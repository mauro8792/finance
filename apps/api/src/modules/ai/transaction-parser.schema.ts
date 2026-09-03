import { CURRENCIES } from "shared";
import { z } from "zod";
import { INCOME_KINDS, PAYMENT_METHODS } from "../transactions/transaction.types.js";

const CANONICAL_AMOUNT = /^(?:0|[1-9]\d{0,15})\.\d{2}$/;

export const PARSER_TYPES = ["EXPENSE", "INCOME"] as const;

export const AIParsedTransactionSchema = z
  .object({
    type: z.enum(PARSER_TYPES).nullable(),
    amount: z
      .string()
      .regex(CANONICAL_AMOUNT, "amount debe ser un string canónico con 2 decimales.")
      .nullable(),
    currency: z.enum(CURRENCIES).nullable(),
    categoryHint: z.string().max(255).nullable(),
    accountHint: z.string().max(255).nullable(),
    description: z.string().max(255).nullable(),
    occurredAt: z.iso.datetime({ error: "occurredAt debe ser un datetime ISO." }).nullable(),
    paymentMethod: z.enum(PAYMENT_METHODS).nullable(),
    incomeKind: z.enum(INCOME_KINDS).nullable(),
  })
  .strict()
  .refine((value) => value.amount === null || value.amount !== "0.00", {
    message: "El importe debe ser mayor que 0.",
    path: ["amount"],
  });

export const ParsedTransactionsSchema = z
  .object({
    transactions: z.array(AIParsedTransactionSchema),
    ambiguities: z.array(z.string()),
  })
  .strict();

export type AIParsedTransaction = z.infer<typeof AIParsedTransactionSchema>;
export type ParsedTransactions = z.infer<typeof ParsedTransactionsSchema>;

export type TransactionDraft = {
  type: "EXPENSE" | "INCOME" | null;
  amount: string | null;
  currency: "ARS" | "USD";
  categoryHint: string | null;
  accountHint: string | null;
  description: string | null;
  occurredAt: string | null;
  paymentMethod: AIParsedTransaction["paymentMethod"];
  incomeKind: "OPERATING" | "CAPITAL" | null;
};

export type TransactionParseResult = {
  transactions: TransactionDraft[];
  ambiguities: string[];
};
