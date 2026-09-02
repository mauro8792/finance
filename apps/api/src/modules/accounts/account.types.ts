import type { Currency } from "shared";

export const ACCOUNT_TYPES = [
  "CASH",
  "BANK",
  "FUND",
  "INVESTMENT",
  "HOUSING_RESERVE",
  "OTHER",
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ZERO_INITIAL_BALANCE = "0.00";

export type Account = {
  id: string;
  userId: string;
  name: string;
  currency: Currency;
  type: AccountType;
  initialBalance: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateAccountInput = {
  userId: string;
  name: string;
  currency: Currency;
  type: AccountType;
  initialBalance?: string;
  isActive?: boolean;
};

export type UpdateAccountInput = {
  name?: string;
  currency?: Currency;
  type?: AccountType;
  isActive?: boolean;
};

export type AccountRepository = {
  create(input: CreateAccountInput): Promise<Account>;
  findById(id: string): Promise<Account | null>;
  findByUserId(userId: string): Promise<Account[]>;
  update(id: string, input: UpdateAccountInput): Promise<Account>;
};
