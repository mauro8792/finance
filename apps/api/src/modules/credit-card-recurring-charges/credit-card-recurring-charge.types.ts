import type { Currency } from "shared";

export const CREDIT_CARD_RECURRING_CHARGE_KINDS = [
  "MAINTENANCE",
  "RECURRING_SERVICE",
  "INSURANCE",
  "OTHER",
] as const;

export type CreditCardRecurringChargeKind =
  (typeof CREDIT_CARD_RECURRING_CHARGE_KINDS)[number];

export const CREDIT_CARD_RECURRING_CHARGE_FREQUENCIES = ["MONTHLY"] as const;

export type CreditCardRecurringChargeFrequency =
  (typeof CREDIT_CARD_RECURRING_CHARGE_FREQUENCIES)[number];

export const OCCURRENCE_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export type CreditCardRecurringChargeRecord = {
  id: string;
  userId: string;
  creditCardId: string;
  kind: CreditCardRecurringChargeKind;
  categoryId: string;
  description: string;
  expectedAmount: string | null;
  currency: Currency;
  frequency: CreditCardRecurringChargeFrequency;
  dayOfMonthHint: number | null;
  isActive: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreditCardRecurringChargeOccurrenceRecord = {
  id: string;
  userId: string;
  recurringChargeId: string;
  occurrenceKey: string;
  idempotencyKey: string;
  transactionId: string;
  amount: string;
  occurredAt: Date;
  createdAt: Date;
};

export type CreditCardRecurringChargeOccurrenceView = {
  id: string;
  recurringChargeId: string;
  occurrenceKey: string;
  transactionId: string;
  amount: string;
  currency: Currency;
  occurredAt: Date;
  description: string | null;
  idempotencyKey: string;
};

export type CreateCreditCardRecurringChargeInput = {
  userId: string;
  creditCardId: string;
  kind: CreditCardRecurringChargeKind;
  categoryId: string;
  description: string;
  expectedAmount?: string | null;
  dayOfMonthHint?: number | null;
  notes?: string | null;
  isActive?: boolean;
};

export type UpdateCreditCardRecurringChargeInput = {
  userId: string;
  id: string;
  kind?: CreditCardRecurringChargeKind;
  categoryId?: string;
  description?: string;
  expectedAmount?: string | null;
  dayOfMonthHint?: number | null;
  notes?: string | null;
};

export type ConfirmRecurringChargeInput = {
  userId: string;
  recurringChargeId: string;
  occurrenceKey: string;
  amount: string;
  idempotencyKey: string;
  occurredAt?: Date;
  description?: string | null;
};

export type ConfirmRecurringChargeResult = {
  created: boolean;
  occurrence: CreditCardRecurringChargeOccurrenceView;
};

export type RecurringChargeOutlookItem = {
  template: CreditCardRecurringChargeRecord;
  occurrenceKey: string;
  hasOccurrence: boolean;
  occurrence: CreditCardRecurringChargeOccurrenceView | null;
};

export type RecurringChargeOutlookResult = {
  creditCardId: string;
  occurrenceKey: string;
  year: number;
  month: number;
  items: RecurringChargeOutlookItem[];
  expectedSumFixed: string;
  variableCountPending: number;
};

export type CreditCardRecurringChargeRepository = {
  findById(id: string): Promise<CreditCardRecurringChargeRecord | null>;
  findByUserId(
    userId: string,
    creditCardId?: string
  ): Promise<CreditCardRecurringChargeRecord[]>;
  create(
    input: CreateCreditCardRecurringChargeInput
  ): Promise<CreditCardRecurringChargeRecord>;
  update(
    input: UpdateCreditCardRecurringChargeInput
  ): Promise<CreditCardRecurringChargeRecord>;
  setActive(
    userId: string,
    id: string,
    isActive: boolean
  ): Promise<CreditCardRecurringChargeRecord>;
  confirmAtomic(
    input: ConfirmRecurringChargeInput
  ): Promise<ConfirmRecurringChargeResult>;
  outlook(
    userId: string,
    creditCardId: string,
    year: number,
    month: number
  ): Promise<RecurringChargeOutlookResult>;
};
