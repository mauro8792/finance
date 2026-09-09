import type { Prisma, PrismaClient } from "@prisma/client";
import {
  calculateExpectedReturn,
  calendarDaysBetween,
} from "./investment.math.js";
import {
  computeBalance,
  fromCents,
  toCents,
} from "../transactions/transaction-balance.js";

/** Exact Neon IDs for the first mis-initialized Bull Market caución (read-only audit). */
export const PROD_FIRST_CAUCION_CORRECTION_TARGETS = {
  investmentId: "80efad77-c3a5-432c-afd5-158f4e096bc5",
  incomeTransactionId: "854f246d-48a6-4553-86a2-d6ddbd911076",
  outflowTransactionId: "98f65a12-d988-4d5f-92ec-0082b5c568fa",
  accountId: "2ea2701b-157f-404b-9cb8-eceacc424287",
  userId: "bb34e81c-ddf8-46d9-bae4-b0561ff059cf",
  beforeAmount: "25495784.34",
  afterAmount: "25400000.00",
  annualRate: "0.211000",
  startDate: new Date("2026-09-02T15:00:00.000Z"),
  maturityDate: new Date("2026-09-09T15:00:00.000Z"),
  /** Real broker interest to register later via maturity — not applied by this script. */
  projectedActualReturn: "95784.34",
} as const;

export type FirstCaucionCorrectionTargets = {
  investmentId: string;
  incomeTransactionId: string;
  outflowTransactionId: string;
  accountId: string;
  userId: string;
  beforeAmount: string;
  afterAmount: string;
  annualRate: string;
  startDate: Date;
  maturityDate: Date;
  projectedActualReturn: string;
};

export type FirstCaucionCorrectionOptions = {
  dryRun: boolean;
  targets: FirstCaucionCorrectionTargets;
  /** Test-only: abort inside the write transaction after the named step. */
  __testThrowAfter?: "income" | "investment" | "outflow";
};

export class FirstCaucionCorrectionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "FirstCaucionCorrectionError";
    this.code = code;
  }
}

export type FirstCaucionCorrectionSnapshot = {
  incomeAmount: string;
  outflowAmount: string;
  principal: string;
  expectedReturn: string | null;
  actualReturn: string | null;
  investmentStatus: string;
  derivedBalance: string;
};

export type FirstCaucionCorrectionReport = {
  dryRun: boolean;
  applied: boolean;
  targets: {
    investmentId: string;
    incomeTransactionId: string;
    outflowTransactionId: string;
    accountId: string;
  };
  incomeFingerprint: {
    id: string;
    userId: string;
    accountId: string;
    type: string;
    status: string;
    amount: string;
    occurredAt: string;
    createdAt: string;
    categoryId: string | null;
    metadata: unknown;
    description: string | null;
  };
  uniqueness: {
    activeIncomesOnAccount: number;
    activeCapitalIncomesOnAccount: number;
  };
  before: FirstCaucionCorrectionSnapshot;
  after: FirstCaucionCorrectionSnapshot;
  maturityProjection: {
    note: string;
    principalReturn: string;
    investmentReturn: string;
    derivedBalanceAfterMaturity: string;
  };
  updated: {
    income: boolean;
    investment: boolean;
    outflow: boolean;
  };
};

type TxClient = Prisma.TransactionClient;

function money(value: { toFixed(digits: number): string }): string {
  return value.toFixed(2);
}

/** Format Postgres numeric::text without IEEE float (e.g. "25495784.340000" → "25495784.34"). */
function moneyText(value: string): string {
  const negative = value.startsWith("-");
  const raw = negative ? value.slice(1) : value;
  const [whole = "0", fraction = ""] = raw.split(".");
  const normalized = `${whole}.${fraction.padEnd(2, "0").slice(0, 2)}`;
  return negative ? `-${normalized}` : normalized;
}

function sameInstant(a: Date, b: Date): boolean {
  return a.getTime() === b.getTime();
}

function isCapitalIncomeMetadata(metadata: unknown): boolean {
  return (
    metadata !== null &&
    typeof metadata === "object" &&
    !Array.isArray(metadata) &&
    (metadata as { incomeKind?: unknown }).incomeKind === "CAPITAL"
  );
}

function abort(code: string, message: string): never {
  throw new FirstCaucionCorrectionError(code, message);
}

async function loadAccountActiveMovements(
  tx: TxClient | PrismaClient,
  accountId: string
) {
  const account = await tx.account.findUnique({ where: { id: accountId } });
  if (!account) {
    abort("ACCOUNT_NOT_FOUND", "Cuenta Bull Market ARS no encontrada.");
  }
  const movements = await tx.transaction.findMany({
    where: { accountId, status: "ACTIVE" },
    select: {
      type: true,
      amount: true,
      metadata: true,
      accountId: true,
    },
  });
  return {
    initialBalance: money(account.initialBalance),
    movements: movements.map((m) => ({
      type: m.type,
      amount: money(m.amount),
      metadata: m.metadata,
      accountId: m.accountId,
    })),
  };
}

function derivedBalanceFrom(
  initialBalance: string,
  movements: Array<{
    type: string;
    amount: string;
    metadata: unknown;
    accountId: string | null;
  }>
): string {
  return computeBalance(
    initialBalance,
    movements as Parameters<typeof computeBalance>[1]
  );
}

async function assertPreconditionsAndSnapshot(
  tx: TxClient,
  targets: FirstCaucionCorrectionTargets
): Promise<{
  snapshot: FirstCaucionCorrectionSnapshot;
  incomeFingerprint: FirstCaucionCorrectionReport["incomeFingerprint"];
  uniqueness: FirstCaucionCorrectionReport["uniqueness"];
  expectedReturnAfter: string;
}> {
  const lockedInvestment = await tx.$queryRaw<
    Array<{
      id: string;
      status: string;
      user_id: string;
      account_id: string;
      principal: string;
      annual_rate: string | null;
      start_date: Date;
      maturity_date: Date | null;
      expected_return: string | null;
      actual_return: string | null;
    }>
  >`
    SELECT
      id,
      status::text AS status,
      user_id,
      account_id,
      principal::text AS principal,
      annual_rate::text AS annual_rate,
      start_date,
      maturity_date,
      expected_return::text AS expected_return,
      actual_return::text AS actual_return
    FROM investments
    WHERE id = ${targets.investmentId}::uuid
    FOR UPDATE
  `;
  const investmentRow = lockedInvestment[0];
  if (!investmentRow) {
    abort("INVESTMENT_NOT_FOUND", "Investment id no encontrado.");
  }
  if (investmentRow.user_id !== targets.userId) {
    abort("WRONG_USER", "Investment userId no coincide.");
  }
  if (investmentRow.account_id !== targets.accountId) {
    abort("WRONG_ACCOUNT", "Investment accountId no coincide con Bull Market ARS.");
  }
  if (investmentRow.status !== "ACTIVE") {
    abort(
      "INVESTMENT_NOT_ACTIVE",
      `Investment status=${investmentRow.status}; se requiere ACTIVE.`
    );
  }
  const principalBefore = moneyText(investmentRow.principal);
  if (principalBefore !== targets.beforeAmount) {
    abort(
      "PRECONDITION_MISMATCH",
      `Investment.principal=${principalBefore}; se esperaba ${targets.beforeAmount} (¿ya corregido?).`
    );
  }
  const annualRateNormalized =
    investmentRow.annual_rate === null
      ? null
      : (() => {
          const [w = "0", f = ""] = investmentRow.annual_rate.split(".");
          return `${w}.${f.padEnd(6, "0").slice(0, 6)}`;
        })();
  if (annualRateNormalized !== targets.annualRate) {
    abort(
      "PRECONDITION_MISMATCH",
      `Investment.annualRate=${annualRateNormalized}; se esperaba ${targets.annualRate}.`
    );
  }
  if (!sameInstant(investmentRow.start_date, targets.startDate)) {
    abort(
      "PRECONDITION_MISMATCH",
      `Investment.startDate=${investmentRow.start_date.toISOString()}; se esperaba ${targets.startDate.toISOString()}.`
    );
  }
  if (
    !investmentRow.maturity_date ||
    !sameInstant(investmentRow.maturity_date, targets.maturityDate)
  ) {
    abort(
      "PRECONDITION_MISMATCH",
      `Investment.maturityDate=${investmentRow.maturity_date?.toISOString() ?? "null"}; se esperaba ${targets.maturityDate.toISOString()}.`
    );
  }
  if (investmentRow.actual_return !== null) {
    abort(
      "PRECONDITION_MISMATCH",
      "Investment.actualReturn debe ser null antes del vencimiento."
    );
  }

  const lockedIncome = await tx.$queryRaw<
    Array<{
      id: string;
      user_id: string;
      account_id: string;
      type: string;
      status: string;
      amount: string;
      occurred_at: Date;
      created_at: Date;
      category_id: string | null;
      metadata: unknown;
      description: string | null;
    }>
  >`
    SELECT
      id,
      user_id,
      account_id,
      type::text AS type,
      status::text AS status,
      amount::text AS amount,
      occurred_at,
      created_at,
      category_id,
      metadata,
      description
    FROM transactions
    WHERE id = ${targets.incomeTransactionId}::uuid
    FOR UPDATE
  `;
  const incomeRow = lockedIncome[0];
  if (!incomeRow) {
    abort("INCOME_NOT_FOUND", "INCOME transaction id no encontrado.");
  }
  if (incomeRow.user_id !== targets.userId) {
    abort("WRONG_USER", "INCOME userId no coincide.");
  }
  if (incomeRow.account_id !== targets.accountId) {
    abort("WRONG_ACCOUNT", "INCOME accountId no coincide con Bull Market ARS.");
  }
  if (incomeRow.type !== "INCOME") {
    abort("PRECONDITION_MISMATCH", `type=${incomeRow.type}; se esperaba INCOME.`);
  }
  if (incomeRow.status !== "ACTIVE") {
    abort(
      "PRECONDITION_MISMATCH",
      `INCOME status=${incomeRow.status}; se esperaba ACTIVE.`
    );
  }
  if (!isCapitalIncomeMetadata(incomeRow.metadata)) {
    abort(
      "PRECONDITION_MISMATCH",
      "INCOME metadata.incomeKind debe ser CAPITAL."
    );
  }
  const incomeAmount = moneyText(incomeRow.amount);
  if (incomeAmount !== targets.beforeAmount) {
    abort(
      "PRECONDITION_MISMATCH",
      `INCOME amount=${incomeAmount}; se esperaba ${targets.beforeAmount} (¿ya corregido?).`
    );
  }

  const lockedOutflow = await tx.$queryRaw<
    Array<{
      id: string;
      user_id: string;
      account_id: string;
      type: string;
      status: string;
      amount: string;
      metadata: unknown;
    }>
  >`
    SELECT
      id,
      user_id,
      account_id,
      type::text AS type,
      status::text AS status,
      amount::text AS amount,
      metadata
    FROM transactions
    WHERE id = ${targets.outflowTransactionId}::uuid
    FOR UPDATE
  `;
  const outflowRow = lockedOutflow[0];
  if (!outflowRow) {
    abort("OUTFLOW_NOT_FOUND", "INVESTMENT_OUTFLOW id no encontrado.");
  }
  if (outflowRow.user_id !== targets.userId) {
    abort("WRONG_USER", "OUTFLOW userId no coincide.");
  }
  if (outflowRow.account_id !== targets.accountId) {
    abort("WRONG_ACCOUNT", "OUTFLOW accountId no coincide con Bull Market ARS.");
  }
  if (outflowRow.type !== "INVESTMENT_OUTFLOW") {
    abort(
      "PRECONDITION_MISMATCH",
      `OUTFLOW type=${outflowRow.type}; se esperaba INVESTMENT_OUTFLOW.`
    );
  }
  if (outflowRow.status !== "ACTIVE") {
    abort(
      "PRECONDITION_MISMATCH",
      `OUTFLOW status=${outflowRow.status}; se esperaba ACTIVE.`
    );
  }
  const meta = outflowRow.metadata as { investmentId?: unknown } | null;
  if (meta?.investmentId !== targets.investmentId) {
    abort(
      "PRECONDITION_MISMATCH",
      "OUTFLOW metadata.investmentId no coincide con el investment id."
    );
  }
  const outflowAmount = moneyText(outflowRow.amount);
  if (outflowAmount !== targets.beforeAmount) {
    abort(
      "PRECONDITION_MISMATCH",
      `OUTFLOW amount=${outflowAmount}; se esperaba ${targets.beforeAmount}.`
    );
  }

  const linkedOutflows = await tx.transaction.findMany({
    where: {
      type: "INVESTMENT_OUTFLOW",
      status: "ACTIVE",
      metadata: {
        path: ["investmentId"],
        equals: targets.investmentId,
      },
    },
    select: { id: true },
  });
  if (linkedOutflows.length !== 1) {
    abort(
      "DUPLICATE_OUTFLOW",
      `Se esperaba 1 OUTFLOW vinculado; hay ${linkedOutflows.length}.`
    );
  }
  if (linkedOutflows[0]?.id !== targets.outflowTransactionId) {
    abort(
      "PRECONDITION_MISMATCH",
      "El OUTFLOW vinculado no coincide con el id esperado."
    );
  }

  const linkedReturns = await tx.transaction.count({
    where: {
      type: { in: ["INVESTMENT_PRINCIPAL_RETURN", "INVESTMENT_RETURN"] },
      metadata: {
        path: ["investmentId"],
        equals: targets.investmentId,
      },
    },
  });
  if (linkedReturns > 0) {
    abort(
      "PRECONDITION_MISMATCH",
      "Ya existen movimientos de vencimiento ligados a esta caución."
    );
  }

  const activeIncomes = await tx.transaction.findMany({
    where: {
      accountId: targets.accountId,
      type: "INCOME",
      status: "ACTIVE",
    },
    select: { id: true, metadata: true },
  });
  const capitalIncomes = activeIncomes.filter((row) =>
    isCapitalIncomeMetadata(row.metadata)
  );
  if (activeIncomes.length !== 1 || capitalIncomes.length !== 1) {
    abort(
      "INCOME_NOT_UNIQUE",
      `Bull Market ARS debe tener exactamente 1 INCOME CAPITAL ACTIVE; incomes=${activeIncomes.length} capital=${capitalIncomes.length}.`
    );
  }
  if (capitalIncomes[0]?.id !== targets.incomeTransactionId) {
    abort(
      "INCOME_NOT_UNIQUE",
      "El único INCOME CAPITAL ACTIVE no coincide con el transaction.id esperado."
    );
  }

  const { initialBalance, movements } = await loadAccountActiveMovements(
    tx,
    targets.accountId
  );
  const derived = derivedBalanceFrom(initialBalance, movements);
  if (toCents(derived) !== 0n) {
    abort(
      "PRECONDITION_MISMATCH",
      `Saldo derivado BEFORE debe ser 0.00; es ${derived}.`
    );
  }

  const days = calendarDaysBetween(targets.startDate, targets.maturityDate);
  const expectedReturnAfter = calculateExpectedReturn(
    targets.afterAmount,
    targets.annualRate,
    days
  );

  const expectedReturnBefore =
    investmentRow.expected_return === null
      ? null
      : moneyText(investmentRow.expected_return);

  return {
    snapshot: {
      incomeAmount,
      outflowAmount,
      principal: principalBefore,
      expectedReturn: expectedReturnBefore,
      actualReturn: null,
      investmentStatus: investmentRow.status,
      derivedBalance: derived,
    },
    incomeFingerprint: {
      id: incomeRow.id,
      userId: incomeRow.user_id,
      accountId: incomeRow.account_id,
      type: incomeRow.type,
      status: incomeRow.status,
      amount: incomeAmount,
      occurredAt: incomeRow.occurred_at.toISOString(),
      createdAt: incomeRow.created_at.toISOString(),
      categoryId: incomeRow.category_id,
      metadata: incomeRow.metadata,
      description: incomeRow.description,
    },
    uniqueness: {
      activeIncomesOnAccount: activeIncomes.length,
      activeCapitalIncomesOnAccount: capitalIncomes.length,
    },
    expectedReturnAfter,
  };
}

async function applyWrites(
  tx: TxClient,
  targets: FirstCaucionCorrectionTargets,
  expectedReturnAfter: string,
  __testThrowAfter?: FirstCaucionCorrectionOptions["__testThrowAfter"]
): Promise<void> {
  const incomeUpdated = await tx.transaction.updateMany({
    where: {
      id: targets.incomeTransactionId,
      status: "ACTIVE",
      type: "INCOME",
      amount: targets.beforeAmount,
      accountId: targets.accountId,
    },
    data: { amount: targets.afterAmount },
  });
  if (incomeUpdated.count !== 1) {
    abort("WRITE_FAILED", "No se pudo actualizar el INCOME (precondición perdida).");
  }
  if (__testThrowAfter === "income") {
    throw new Error("TEST_INJECTED_FAILURE_AFTER_INCOME");
  }

  const investmentUpdated = await tx.investment.updateMany({
    where: {
      id: targets.investmentId,
      status: "ACTIVE",
      principal: targets.beforeAmount,
      accountId: targets.accountId,
    },
    data: {
      principal: targets.afterAmount,
      expectedReturn: expectedReturnAfter,
    },
  });
  if (investmentUpdated.count !== 1) {
    abort(
      "WRITE_FAILED",
      "No se pudo actualizar el Investment (precondición perdida)."
    );
  }
  if (__testThrowAfter === "investment") {
    throw new Error("TEST_INJECTED_FAILURE_AFTER_INVESTMENT");
  }

  const outflowUpdated = await tx.transaction.updateMany({
    where: {
      id: targets.outflowTransactionId,
      status: "ACTIVE",
      type: "INVESTMENT_OUTFLOW",
      amount: targets.beforeAmount,
      accountId: targets.accountId,
    },
    data: { amount: targets.afterAmount },
  });
  if (outflowUpdated.count !== 1) {
    abort(
      "WRITE_FAILED",
      "No se pudo actualizar el INVESTMENT_OUTFLOW (precondición perdida)."
    );
  }
  if (__testThrowAfter === "outflow") {
    throw new Error("TEST_INJECTED_FAILURE_AFTER_OUTFLOW");
  }
}

async function readAfterSnapshot(
  tx: TxClient | PrismaClient,
  targets: FirstCaucionCorrectionTargets
): Promise<FirstCaucionCorrectionSnapshot> {
  const [income, outflow, investment, balanceParts] = await Promise.all([
    tx.transaction.findUniqueOrThrow({
      where: { id: targets.incomeTransactionId },
    }),
    tx.transaction.findUniqueOrThrow({
      where: { id: targets.outflowTransactionId },
    }),
    tx.investment.findUniqueOrThrow({ where: { id: targets.investmentId } }),
    loadAccountActiveMovements(tx, targets.accountId),
  ]);

  return {
    incomeAmount: money(income.amount),
    outflowAmount: money(outflow.amount),
    principal: money(investment.principal),
    expectedReturn:
      investment.expectedReturn === null
        ? null
        : money(investment.expectedReturn),
    actualReturn:
      investment.actualReturn === null ? null : money(investment.actualReturn),
    investmentStatus: investment.status,
    derivedBalance: derivedBalanceFrom(
      balanceParts.initialBalance,
      balanceParts.movements
    ),
  };
}

function maturityProjection(
  targets: FirstCaucionCorrectionTargets
): FirstCaucionCorrectionReport["maturityProjection"] {
  const afterMaturity = fromCents(
    toCents(targets.afterAmount) + toCents(targets.projectedActualReturn)
  );
  return {
    note:
      "NO ejecutado. Flujo actual de mature (principalReturn + investmentReturn) sobre balance post-corrección 0.",
    principalReturn: targets.afterAmount,
    investmentReturn: targets.projectedActualReturn,
    derivedBalanceAfterMaturity: afterMaturity,
  };
}

/**
 * One-shot administrative correction for the first mis-initialized caución.
 * Does not create maturity movements. Does not create a new caución.
 */
export async function correctFirstCaucionCapital(
  prisma: PrismaClient,
  options: FirstCaucionCorrectionOptions
): Promise<FirstCaucionCorrectionReport> {
  const { dryRun, targets, __testThrowAfter } = options;

  if (toCents(targets.afterAmount) >= toCents(targets.beforeAmount)) {
    abort(
      "INVALID_TARGETS",
      "afterAmount debe ser menor que beforeAmount para esta corrección."
    );
  }

  // Neon interactive transactions need headroom beyond the Prisma default 5s.
  return prisma.$transaction(
    async (tx) => {
    const checked = await assertPreconditionsAndSnapshot(tx, targets);
    const afterSimulated: FirstCaucionCorrectionSnapshot = {
      incomeAmount: targets.afterAmount,
      outflowAmount: targets.afterAmount,
      principal: targets.afterAmount,
      expectedReturn: checked.expectedReturnAfter,
      actualReturn: null,
      investmentStatus: "ACTIVE",
      derivedBalance: "0.00",
    };

    if (dryRun) {
      return {
        dryRun: true,
        applied: false,
        targets: {
          investmentId: targets.investmentId,
          incomeTransactionId: targets.incomeTransactionId,
          outflowTransactionId: targets.outflowTransactionId,
          accountId: targets.accountId,
        },
        incomeFingerprint: checked.incomeFingerprint,
        uniqueness: checked.uniqueness,
        before: checked.snapshot,
        after: afterSimulated,
        maturityProjection: maturityProjection(targets),
        updated: { income: false, investment: false, outflow: false },
      };
    }

    await applyWrites(tx, targets, checked.expectedReturnAfter, __testThrowAfter);
    const after = await readAfterSnapshot(tx, targets);

    if (after.incomeAmount !== targets.afterAmount) {
      abort("POSTCONDITION_FAILED", "INCOME amount post-corrección incorrecto.");
    }
    if (after.outflowAmount !== targets.afterAmount) {
      abort("POSTCONDITION_FAILED", "OUTFLOW amount post-corrección incorrecto.");
    }
    if (after.principal !== targets.afterAmount) {
      abort("POSTCONDITION_FAILED", "principal post-corrección incorrecto.");
    }
    if (after.expectedReturn !== checked.expectedReturnAfter) {
      abort("POSTCONDITION_FAILED", "expectedReturn post-corrección incorrecto.");
    }
    if (after.actualReturn !== null) {
      abort("POSTCONDITION_FAILED", "actualReturn debe seguir null.");
    }
    if (after.investmentStatus !== "ACTIVE") {
      abort("POSTCONDITION_FAILED", "Investment debe seguir ACTIVE.");
    }
    if (toCents(after.derivedBalance) !== 0n) {
      abort(
        "POSTCONDITION_FAILED",
        `Saldo derivado post-corrección debe ser 0.00; es ${after.derivedBalance}.`
      );
    }

    return {
      dryRun: false,
      applied: true,
      targets: {
        investmentId: targets.investmentId,
        incomeTransactionId: targets.incomeTransactionId,
        outflowTransactionId: targets.outflowTransactionId,
        accountId: targets.accountId,
      },
      incomeFingerprint: checked.incomeFingerprint,
      uniqueness: checked.uniqueness,
      before: checked.snapshot,
      after,
      maturityProjection: maturityProjection(targets),
      updated: { income: true, investment: true, outflow: true },
    };
    },
    { maxWait: 10_000, timeout: 60_000 }
  );
}

export function parseFixFirstCaucionCliArgs(argv: string[]): {
  dryRun: boolean;
  apply: boolean;
  help: boolean;
} {
  let dryRun = false;
  let apply = false;
  let help = false;
  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--apply") apply = true;
    else if (arg === "--help" || arg === "-h") help = true;
    else {
      throw new Error(`Flag desconocido: ${arg}`);
    }
  }
  if (!help && dryRun === apply) {
    throw new Error("Indicar exactamente uno de: --dry-run | --apply");
  }
  return { dryRun, apply, help };
}
