import type { Currency } from "shared";

export type Clock = {
  now(): Date;
};

export const systemClock: Clock = {
  now: () => new Date(),
};

export type DueInstallmentCandidate = {
  installmentId: string;
  purchaseId: string;
  userId: string;
  creditCardId: string;
  categoryId: string;
  currency: Currency;
  description: string | null;
  installmentNumber: number;
  installmentsCount: number;
  amount: string;
  scheduledFor: Date;
};

export type RecognizeInstallmentOutcome = "recognized" | "skipped";

export type RecognizeDueResult = {
  asOf: string;
  dryRun: boolean;
  eligible: number;
  recognized: number;
  skipped: number;
  failed: number;
  totalsByCurrency: Record<string, string>;
  purchasesAffected: number;
  cardsAffected: number;
  failureMessage?: string;
};

export type RecognizeDueOptions = {
  asOf?: Date;
  /** Optional scope (tests / operator). Omit to process all users. */
  userId?: string;
  dryRun?: boolean;
};
