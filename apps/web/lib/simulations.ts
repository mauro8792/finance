import { normalizeAmountInput } from "./quick-add";
import type { SimulationRequest, SimulationResponse, SimulationType } from "./types";

export const SIMULATION_TIMEZONE = "America/Argentina/Buenos_Aires";

export const SIMULATION_LABELS: Record<SimulationType, string> = {
  MONTHS_WITHOUT_INCOME: "Sin ingresos",
  NEW_JOB: "Nuevo empleo",
  HOUSING_RESERVE: "Reserva vivienda",
};

const SIGNED_PERCENT = /^-?(?:0|[1-9]\d{0,5})(?:[.,]\d{1,8})?$/;
const NON_NEGATIVE_AMOUNT = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;
const FX_PATTERN = /^(?:0|[1-9]\d{0,11})(?:[.,]\d{1,6})?$/;
const RATE_MICRO = BigInt(1_000_000);

const SIMULATION_ERRORS: Record<string, string> = {
  INVALID_MONTHS: "La cantidad de meses debe ser un entero mayor que 0.",
  INVALID_TARGET_INSTALLMENTS: "Las cuotas objetivo deben ser un entero mayor que 0.",
  INVALID_EXCHANGE_RATE: "La cotización ARS por USD debe ser mayor que 0.",
  INSUFFICIENT_BASELINE: "Todavía no hay suficiente historial para calcular este escenario.",
  UNSUPPORTED_SCENARIO: "Este escenario sólo admite obligaciones de vivienda en USD.",
  VALIDATION_ERROR: "Revisá los datos ingresados.",
  NOT_FOUND: "No encontramos esa obligación de vivienda.",
  USER_NOT_CONFIGURED: "No hay un usuario configurado.",
  CURRENCY_MISMATCH: "La cuenta reserva debe usar la misma moneda que la obligación.",
};

export function percentToExpenseFraction(raw: string): string | null {
  const trimmed = raw.trim().replace(",", ".");
  if (!SIGNED_PERCENT.test(trimmed)) {
    return null;
  }

  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  let percentE8 =
    BigInt(whole) * BigInt(100_000_000) + BigInt(fraction.padEnd(8, "0").slice(0, 8));
  if (fraction.length > 8 && fraction[8]! >= "5") {
    percentE8 += BigInt(1);
  }

  const rateE8 = percentE8 / BigInt(100);
  let micros = rateE8 / BigInt(100);
  if (rateE8 % BigInt(100) >= BigInt(50)) {
    micros += BigInt(1);
  }

  const wholeRate = micros / RATE_MICRO;
  const fractionRate = (micros % RATE_MICRO).toString().padStart(6, "0");
  return `${negative ? "-" : ""}${wholeRate}.${fractionRate}`;
}

export function formatExpenseChangePercent(fraction: string): string {
  const negative = fraction.startsWith("-");
  const unsigned = negative ? fraction.slice(1) : fraction;
  const [whole = "0", frac = ""] = unsigned.split(".");
  const micros =
    BigInt(stripLeadingZeros(whole)) * RATE_MICRO + BigInt(frac.padEnd(6, "0").slice(0, 6));
  const percentMicros = micros * BigInt(100);
  const percentWhole = percentMicros / RATE_MICRO;
  const percentFraction = (percentMicros % RATE_MICRO)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");
  const display =
    percentFraction.length > 0 ? `${percentWhole},${percentFraction}` : `${percentWhole}`;
  return `${negative ? "-" : ""}${display}%`;
}

export function toExchangeRate(raw: string): string | null {
  const value = raw.trim().replace(",", ".");
  if (!FX_PATTERN.test(value)) {
    return null;
  }
  const [whole = "0", fraction = ""] = value.split(".");
  const micros = BigInt(whole) * RATE_MICRO + BigInt(fraction.padEnd(6, "0"));
  if (micros <= BigInt(0)) {
    return null;
  }
  return `${whole}.${fraction.padEnd(6, "0")}`;
}

export function isNonNegativeMoneyInput(raw: string): boolean {
  return NON_NEGATIVE_AMOUNT.test(normalizeAmountInput(raw));
}

export function parsePositiveIntInput(raw: string): number | null {
  const value = raw.trim();
  if (!/^[1-9]\d*$/.test(value)) {
    return null;
  }
  return Number(value);
}

export function parseNonNegativeIntInput(raw: string): number | null {
  const value = raw.trim();
  if (!/^(?:0|[1-9]\d*)$/.test(value)) {
    return null;
  }
  return Number(value);
}

export function hasInsufficientBaseline(
  averageMonthlyFundConsumptionARS: string | null
): boolean {
  return averageMonthlyFundConsumptionARS === null;
}

export function fundStopsConsuming(
  finalMonthlyFundConsumptionARS: string | null,
  runwayAfterScenarioMonths: string | null
): boolean {
  return finalMonthlyFundConsumptionARS === "0.00" && runwayAfterScenarioMonths === null;
}

export function depletedCopy(
  depletedAfterMonth: number | null,
  variant: "months" | "job"
): string | null {
  if (depletedAfterMonth === null) {
    return null;
  }
  if (depletedAfterMonth === 0) {
    return "El escenario comienza sin capital ARS disponible.";
  }
  if (variant === "job") {
    return `El fondo se agotaría durante el mes ${depletedAfterMonth} del escenario.`;
  }
  return `El fondo se agotaría durante el mes ${depletedAfterMonth}.`;
}

export function simulationFormError(error: unknown): string {
  if (error instanceof Error && "code" in error) {
    const code = (error as { code?: string }).code;
    if (
      code === "VALIDATION_ERROR" &&
      error.message.trim() &&
      !isRawErrorCode(error.message)
    ) {
      return error.message;
    }
    if (code && SIMULATION_ERRORS[code]) {
      return SIMULATION_ERRORS[code];
    }
    if (error.message.trim() && !isRawErrorCode(error.message)) {
      return error.message;
    }
  }

  return "No pudimos simular el escenario. Probá de nuevo.";
}

function isRawErrorCode(message: string): boolean {
  return /^[A-Z][A-Z0-9_]+$/.test(message.trim());
}

function stripLeadingZeros(value: string): string {
  const stripped = value.replace(/^0+(?=\d)/, "");
  return stripped.length > 0 ? stripped : "0";
}

export type { SimulationRequest, SimulationResponse, SimulationType };
