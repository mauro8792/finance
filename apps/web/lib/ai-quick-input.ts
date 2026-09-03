import { ApiClientError } from "./api";
import { formatMoney } from "./format-money";
import {
  filterActiveAccounts,
  filterCategoriesForType,
  PAYMENT_METHOD_LABELS,
  toLocalDateTimeInput,
} from "./quick-add";
import { INCOME_KIND_LABELS, TRANSACTION_TYPE_LABELS } from "./transactions";
import type {
  Account,
  AIParsedTransaction,
  Category,
  CreateTransactionRequest,
  Currency,
  MovementKind,
  ParseTransactionResponse,
  PaymentMethod,
} from "./types";

export type ResolvedAiDraft = {
  proposal: AIParsedTransaction;
  kind: MovementKind | null;
  amount: string | null;
  currency: Currency;
  accountId: string;
  accountName: string | null;
  categoryId: string;
  categoryName: string | null;
  description: string | null;
  occurredAt: string | null;
  paymentMethod: PaymentMethod | null;
  incomeKind: AIParsedTransaction["incomeKind"];
};

export function normalizeHint(value: string): string {
  return value.trim().toLocaleLowerCase("es-AR");
}

export function matchByExactName<T extends { name: string }>(
  items: T[],
  hint: string | null
): T | null {
  if (!hint) {
    return null;
  }
  const needle = normalizeHint(hint);
  if (!needle) {
    return null;
  }
  const matches = items.filter((item) => normalizeHint(item.name) === needle);
  return matches.length === 1 ? matches[0] : null;
}

export function resolveAiDraft(
  proposal: AIParsedTransaction,
  accounts: Account[],
  categories: Category[]
): ResolvedAiDraft {
  const kind = proposal.type;
  const accountsForCurrency = filterActiveAccounts(accounts).filter(
    (account) => account.currency === proposal.currency
  );
  const account = matchByExactName(accountsForCurrency, proposal.accountHint);
  const categoryPool = kind ? filterCategoriesForType(categories, kind) : [];
  const category = matchByExactName(categoryPool, proposal.categoryHint);

  return {
    proposal,
    kind,
    amount: proposal.amount,
    currency: proposal.currency,
    accountId: account?.id ?? "",
    accountName: account?.name ?? null,
    categoryId: category?.id ?? "",
    categoryName: category?.name ?? null,
    description: proposal.description,
    occurredAt: proposal.occurredAt,
    paymentMethod: proposal.paymentMethod,
    incomeKind: kind === "EXPENSE" ? null : proposal.incomeKind,
  };
}

export function canConfirmAiDraft(draft: ResolvedAiDraft): boolean {
  if (draft.kind === null || !draft.amount || !draft.accountId || !draft.categoryId) {
    return false;
  }
  if (draft.kind === "INCOME" && !draft.incomeKind) {
    return false;
  }
  return true;
}

export function toCreateRequest(
  draft: ResolvedAiDraft,
  account: Account
): CreateTransactionRequest | null {
  if (!canConfirmAiDraft(draft) || !draft.kind || !draft.amount) {
    return null;
  }
  const base = {
    amount: draft.amount,
    currency: account.currency,
    accountId: account.id,
    categoryId: draft.categoryId,
    ...(draft.description ? { description: draft.description } : {}),
    ...(draft.occurredAt ? { occurredAt: draft.occurredAt } : {}),
  };
  if (draft.kind === "INCOME") {
    if (!draft.incomeKind) {
      return null;
    }
    return {
      ...base,
      type: "INCOME",
      incomeKind: draft.incomeKind,
    };
  }
  return {
    ...base,
    ...(draft.paymentMethod ? { paymentMethod: draft.paymentMethod } : {}),
  };
}

export function occurredAtToFormValue(occurredAt: string | null): string {
  if (!occurredAt) {
    return toLocalDateTimeInput(new Date());
  }
  const parsed = new Date(occurredAt);
  if (Number.isNaN(parsed.getTime())) {
    return toLocalDateTimeInput(new Date());
  }
  return toLocalDateTimeInput(parsed);
}

export function parseTransactionErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 400) {
      return "Revisá el texto e intentá de nuevo.";
    }
    if (error.status === 429) {
      return "Demasiadas solicitudes. Probá de nuevo en un momento.";
    }
    if (error.status === 503 || error.code === "AI_UNAVAILABLE") {
      return "El asistente no está disponible temporalmente. Podés registrar el movimiento a mano.";
    }
  }
  return "No se pudo interpretar el movimiento.";
}

export function splitProposals(response: ParseTransactionResponse): {
  primary: AIParsedTransaction | null;
  extras: AIParsedTransaction[];
} {
  const [primary = null, ...extras] = response.transactions;
  return { primary, extras };
}

export type ProposalUiStatus = "pending" | "editing" | "saved" | "discarded" | "error";

export type ProposalItem = {
  id: string;
  index: number;
  proposal: AIParsedTransaction;
  status: ProposalUiStatus;
  error: string | null;
};

export function itemsFromParse(transactions: AIParsedTransaction[]): ProposalItem[] {
  return transactions.map((proposal, index) => ({
    id: `proposal-${index}`,
    index,
    proposal,
    status: "pending",
    error: null,
  }));
}

export function isProposalSettled(item: ProposalItem): boolean {
  return item.status === "saved" || item.status === "discarded";
}

export function allProposalsSettled(items: ProposalItem[]): boolean {
  return items.length > 0 && items.every(isProposalSettled);
}

export function savedProposalCount(items: ProposalItem[]): number {
  return items.filter((item) => item.status === "saved").length;
}

export function completionMessage(items: ProposalItem[]): string | null {
  const saved = items.filter((item) => item.status === "saved");
  if (saved.length === 0) {
    return null;
  }
  if (saved.length === 1) {
    return saved[0]?.proposal.type === "INCOME"
      ? "Ingreso registrado."
      : "Gasto registrado.";
  }
  return `${saved.length} movimientos registrados.`;
}

export function typeLabel(kind: MovementKind | null): string | null {
  if (!kind) {
    return null;
  }
  return TRANSACTION_TYPE_LABELS[kind];
}

export function paymentMethodLabel(method: PaymentMethod | null): string | null {
  if (!method) {
    return null;
  }
  return PAYMENT_METHOD_LABELS[method];
}

export function incomeKindLabel(kind: AIParsedTransaction["incomeKind"]): string | null {
  if (!kind) {
    return null;
  }
  return INCOME_KIND_LABELS[kind];
}

export function formatProposalAmount(amount: string | null, currency: Currency): string | null {
  if (!amount) {
    return null;
  }
  return formatMoney(amount, currency);
}

export const AI_QUERY_INVALIDATIONS = [
  "transactions",
  "accounts",
  "account-balances",
  "financial-summary",
  "budgets",
] as const;
