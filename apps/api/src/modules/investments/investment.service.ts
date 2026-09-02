import { randomUUID } from "node:crypto";
import { CURRENCIES, type Currency } from "shared";
import { AppError } from "../../shared/errors/app-error.js";
import type { AccountRepository } from "../accounts/account.types.js";
import { computeBalance, toCents } from "../transactions/transaction-balance.js";
import { parsePositiveAmount } from "../transactions/transaction.service.js";
import type { Transaction, TransactionRepository } from "../transactions/transaction.types.js";
import {
  calculateExpectedReturn,
  calendarDaysBetween,
} from "./investment.math.js";
import type {
  Investment,
  InvestmentRepository,
  InvestmentStatus,
} from "./investment.types.js";

const RATE_PATTERN = /^(?:0|[1-9]\d{0,5})(?:\.\d{1,6})?$/;

export type CreateCaucionRequest = {
  accountId: string;
  currency: Currency;
  principal: string;
  annualRate: string;
  startDate: Date;
  maturityDate: Date;
  notes?: string | null;
};

export type CreateCaucionResult = {
  investment: Investment;
  transaction: Transaction;
};

export type MatureCaucionRequest = {
  destinationAccountId: string;
  capitalReturned: string;
  actualReturn: string;
  occurredAt: Date;
};

export type MatureCaucionResult = {
  investment: Investment;
  destinationAccountId: string;
  occurredAt: Date;
  principalReturn: Transaction;
  investmentReturn: Transaction | null;
};

export type RenewCaucionRequest = {
  accountId: string;
  renewalPrincipal: string;
  actualReturn: string;
  annualRate: string;
  occurredAt: Date;
  maturityDate: Date;
  notes?: string | null;
};

export type RenewCaucionResult = {
  original: Investment;
  investment: Investment;
  occurredAt: Date;
  principalReturn: Transaction;
  investmentReturn: Transaction | null;
  outflow: Transaction;
};

const AMOUNT_PATTERN = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;

export class InvestmentService {
  constructor(
    private readonly investments: InvestmentRepository,
    private readonly accounts: AccountRepository,
    private readonly transactions: TransactionRepository
  ) {}

  async list(userId: string): Promise<Investment[]> {
    const items = await this.investments.findByUserId(userId);
    return [...items].sort(compareInvestments);
  }

  async createCaucion(
    userId: string,
    input: CreateCaucionRequest
  ): Promise<CreateCaucionResult> {
    const currency = requireCurrency(input.currency);
    const principal = parsePositiveAmount(input.principal);
    const annualRate = parseNonNegativeAnnualRate(input.annualRate);
    const startDate = input.startDate;
    const maturityDate = input.maturityDate;

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(maturityDate.getTime())) {
      throw new AppError("VALIDATION_ERROR", "Las fechas de la caución son inválidas.", 400);
    }

    const days = calendarDaysBetween(startDate, maturityDate);
    if (days < 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        "La fecha de vencimiento no puede ser anterior al inicio.",
        400
      );
    }

    const persistedMaturityDate =
      maturityDate.getTime() < startDate.getTime() ? startDate : maturityDate;

    const account = await this.requireOriginAccount(userId, input.accountId);
    if (account.currency !== currency) {
      throw new AppError(
        "CURRENCY_MISMATCH",
        "La moneda de la cuenta debe coincidir con la de la caución.",
        400
      );
    }

    const movements = await this.transactions.findByUserId(userId, {
      accountId: account.id,
      status: "ACTIVE",
    });
    const available = computeBalance(account.initialBalance, movements);
    if (toCents(available) < toCents(principal)) {
      throw new AppError(
        "INSUFFICIENT_BALANCE",
        "La cuenta no tiene saldo suficiente.",
        400
      );
    }

    const investmentId = randomUUID();
    const transactionId = randomUUID();
    const expectedReturn = calculateExpectedReturn(principal, annualRate, days);

    return this.investments.createCaucionAtomic(
      {
        id: investmentId,
        userId,
        accountId: account.id,
        type: "CAUCION",
        status: "ACTIVE",
        currency,
        principal,
        annualRate,
        startDate,
        maturityDate: persistedMaturityDate,
        expectedReturn,
        notes: normalizeNotes(input.notes),
      },
      {
        id: transactionId,
        userId,
        accountId: account.id,
        categoryId: null,
        type: "INVESTMENT_OUTFLOW",
        status: "ACTIVE",
        amount: principal,
        currency,
        occurredAt: startDate,
        relatedTransactionId: null,
        reimbursementStatus: "NONE",
        metadata: { investmentId },
      }
    );
  }

  async mature(userId: string, id: string, input: MatureCaucionRequest): Promise<MatureCaucionResult> {
    const investment = await this.investments.findById(id);
    if (!investment || investment.userId !== userId) {
      throw new AppError("NOT_FOUND", "Inversión no encontrada.", 404);
    }
    if (investment.type !== "CAUCION") {
      throw new AppError(
        "VALIDATION_ERROR",
        "Sólo una caución puede registrar vencimiento en este flujo.",
        400
      );
    }
    if (investment.status !== "ACTIVE") {
      throw new AppError(
        "INVESTMENT_NOT_ACTIVE",
        "Sólo una inversión ACTIVE puede registrar vencimiento.",
        400
      );
    }
    if (!investment.maturityDate) {
      throw new AppError(
        "VALIDATION_ERROR",
        "La caución no tiene fecha de vencimiento.",
        400
      );
    }

    const occurredAt = input.occurredAt;
    if (Number.isNaN(occurredAt.getTime())) {
      throw new AppError("VALIDATION_ERROR", "La fecha de acreditación es inválida.", 400);
    }
    if (calendarDaysBetween(investment.maturityDate, occurredAt) < 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        "La fecha de acreditación no puede ser anterior al vencimiento.",
        400
      );
    }

    const destination = await this.requireOriginAccount(userId, input.destinationAccountId);
    if (destination.currency !== investment.currency) {
      throw new AppError(
        "CURRENCY_MISMATCH",
        "La moneda de la cuenta destino debe coincidir con la de la caución.",
        400
      );
    }

    const capitalReturned = parsePositiveAmount(input.capitalReturned);
    if (toCents(capitalReturned) !== toCents(investment.principal)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "El capital retornado debe coincidir con el principal de la caución.",
        400
      );
    }

    const actualReturn = parseNonNegativeAmount(input.actualReturn);
    const hasYield = toCents(actualReturn) > 0n;
    const principalTxId = randomUUID();
    const returnTxId = randomUUID();
    const metadata = { investmentId: investment.id };

    const result = await this.investments.matureAtomic(
      investment.id,
      { status: "MATURED", actualReturn },
      {
        id: principalTxId,
        userId,
        accountId: destination.id,
        categoryId: null,
        type: "INVESTMENT_PRINCIPAL_RETURN",
        status: "ACTIVE",
        amount: investment.principal,
        currency: investment.currency,
        occurredAt,
        relatedTransactionId: null,
        reimbursementStatus: "NONE",
        metadata,
      },
      hasYield
        ? {
            id: returnTxId,
            userId,
            accountId: destination.id,
            categoryId: null,
            type: "INVESTMENT_RETURN",
            status: "ACTIVE",
            amount: actualReturn,
            currency: investment.currency,
            occurredAt,
            relatedTransactionId: null,
            reimbursementStatus: "NONE",
            metadata,
          }
        : null
    );

    return {
      investment: result.investment,
      destinationAccountId: destination.id,
      occurredAt,
      principalReturn: result.principalReturn,
      investmentReturn: result.investmentReturn,
    };
  }

  async renew(userId: string, id: string, input: RenewCaucionRequest): Promise<RenewCaucionResult> {
    const original = await this.investments.findById(id);
    if (!original || original.userId !== userId) {
      throw new AppError("NOT_FOUND", "Inversión no encontrada.", 404);
    }
    if (original.type !== "CAUCION") {
      throw new AppError(
        "VALIDATION_ERROR",
        "Sólo una caución puede renovarse en este flujo.",
        400
      );
    }
    if (original.status !== "ACTIVE") {
      throw new AppError(
        "INVESTMENT_NOT_ACTIVE",
        "Sólo una inversión ACTIVE puede renovarse.",
        400
      );
    }
    if (!original.maturityDate) {
      throw new AppError(
        "VALIDATION_ERROR",
        "La caución no tiene fecha de vencimiento.",
        400
      );
    }

    const occurredAt = input.occurredAt;
    const maturityDate = input.maturityDate;
    if (Number.isNaN(occurredAt.getTime()) || Number.isNaN(maturityDate.getTime())) {
      throw new AppError("VALIDATION_ERROR", "Las fechas de la renovación son inválidas.", 400);
    }
    if (calendarDaysBetween(original.maturityDate, occurredAt) < 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        "La fecha de la operación no puede ser anterior al vencimiento original.",
        400
      );
    }
    const days = calendarDaysBetween(occurredAt, maturityDate);
    if (days < 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        "La fecha de vencimiento de la nueva caución no puede ser anterior al inicio.",
        400
      );
    }
    const persistedMaturityDate =
      maturityDate.getTime() < occurredAt.getTime() ? occurredAt : maturityDate;

    const account = await this.requireOriginAccount(userId, input.accountId);
    if (account.currency !== original.currency) {
      throw new AppError(
        "CURRENCY_MISMATCH",
        "La moneda de la cuenta debe coincidir con la de la caución.",
        400
      );
    }

    const actualReturn = parseNonNegativeAmount(input.actualReturn);
    const renewalPrincipal = parsePositiveAmount(input.renewalPrincipal);
    if (toCents(renewalPrincipal) > toCents(original.principal)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "El capital renovado no puede superar el principal original.",
        400
      );
    }

    const annualRate = parseNonNegativeAnnualRate(input.annualRate);
    const expectedReturn = calculateExpectedReturn(renewalPrincipal, annualRate, days);

    const movements = await this.transactions.findByUserId(userId, {
      accountId: account.id,
      status: "ACTIVE",
    });
    const available = computeBalance(account.initialBalance, movements);
    const funded =
      toCents(available) + toCents(original.principal) + toCents(actualReturn);
    if (funded < toCents(renewalPrincipal)) {
      throw new AppError(
        "INSUFFICIENT_BALANCE",
        "La cuenta no tiene saldo suficiente.",
        400
      );
    }

    const newInvestmentId = randomUUID();
    const hasYield = toCents(actualReturn) > 0n;

    const result = await this.investments.renewAtomic({
      originalId: original.id,
      originalPatch: { status: "RENEWED", actualReturn },
      newInvestment: {
        id: newInvestmentId,
        userId,
        accountId: account.id,
        type: "CAUCION",
        status: "ACTIVE",
        currency: original.currency,
        principal: renewalPrincipal,
        annualRate,
        startDate: occurredAt,
        maturityDate: persistedMaturityDate,
        expectedReturn,
        notes: normalizeNotes(input.notes),
        renewedFromInvestmentId: original.id,
      },
      principalReturn: {
        id: randomUUID(),
        userId,
        accountId: account.id,
        categoryId: null,
        type: "INVESTMENT_PRINCIPAL_RETURN",
        status: "ACTIVE",
        amount: original.principal,
        currency: original.currency,
        occurredAt,
        relatedTransactionId: null,
        reimbursementStatus: "NONE",
        metadata: { investmentId: original.id },
      },
      investmentReturn: hasYield
        ? {
            id: randomUUID(),
            userId,
            accountId: account.id,
            categoryId: null,
            type: "INVESTMENT_RETURN",
            status: "ACTIVE",
            amount: actualReturn,
            currency: original.currency,
            occurredAt,
            relatedTransactionId: null,
            reimbursementStatus: "NONE",
            metadata: { investmentId: original.id },
          }
        : null,
      outflow: {
        id: randomUUID(),
        userId,
        accountId: account.id,
        categoryId: null,
        type: "INVESTMENT_OUTFLOW",
        status: "ACTIVE",
        amount: renewalPrincipal,
        currency: original.currency,
        occurredAt,
        relatedTransactionId: null,
        reimbursementStatus: "NONE",
        metadata: { investmentId: newInvestmentId },
      },
    });

    return {
      original: result.original,
      investment: result.investment,
      occurredAt,
      principalReturn: result.principalReturn,
      investmentReturn: result.investmentReturn,
      outflow: result.outflow,
    };
  }

  private async requireOriginAccount(userId: string, accountId: string) {
    const account = await this.accounts.findById(accountId);
    if (!account || account.userId !== userId) {
      throw new AppError("NOT_FOUND", "Cuenta no encontrada.", 404);
    }
    if (!account.isActive) {
      throw new AppError(
        "ACCOUNT_INACTIVE",
        "No se puede registrar un movimiento sobre una cuenta inactiva.",
        400
      );
    }
    return account;
  }
}

function requireCurrency(currency: string): Currency {
  if ((CURRENCIES as readonly string[]).includes(currency)) {
    return currency as Currency;
  }
  throw new AppError("VALIDATION_ERROR", "La moneda debe ser ARS o USD.", 400);
}

function parseNonNegativeAnnualRate(raw: string): string {
  const value = raw.trim();
  if (!RATE_PATTERN.test(value)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "La TNA debe ser un decimal mayor o igual a 0 con hasta 6 decimales.",
      400
    );
  }
  const [whole, fraction = ""] = value.split(".");
  return `${whole}.${fraction.padEnd(6, "0")}`;
}

function parseNonNegativeAmount(raw: string): string {
  const value = raw.trim();
  if (!AMOUNT_PATTERN.test(value)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "El rendimiento real debe ser un decimal mayor o igual a 0 con hasta 2 decimales.",
      400
    );
  }
  const [whole, fraction = ""] = value.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

function normalizeNotes(notes: string | null | undefined): string | null {
  if (notes === undefined || notes === null) {
    return null;
  }
  const value = notes.trim();
  return value.length > 0 ? value : null;
}

const STATUS_RANK: Record<InvestmentStatus, number> = {
  ACTIVE: 0,
  DRAFT: 1,
  MATURED: 2,
  RENEWED: 3,
  CANCELLED: 4,
};

function compareInvestments(left: Investment, right: Investment): number {
  const rank = STATUS_RANK[left.status] - STATUS_RANK[right.status];
  if (rank !== 0) {
    return rank;
  }
  return right.createdAt.getTime() - left.createdAt.getTime();
}
