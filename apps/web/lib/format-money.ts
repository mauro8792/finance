const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

export function currentYearMonth(now = new Date()): { year: number; month: number } {
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  };
}

export function formatMonthLabel(year: number, month: number): string {
  const name = MONTH_NAMES[month - 1];
  return name ? `${name} ${year}` : `${month}/${year}`;
}

export function formatMoney(amount: string, currency: "ARS" | "USD"): string {
  const formatted = formatArsAmount(amount);
  return currency === "USD" ? formatted.replace("$ ", "USD ") : formatted;
}

export function formatUsedPercent(usedPercent: string | null): string {
  if (usedPercent === null) {
    return "—";
  }

  const negative = usedPercent.startsWith("-");
  const unsigned = negative ? usedPercent.slice(1) : usedPercent;
  const [wholeRaw = "0", fractionRaw = ""] = unsigned.split(".");
  const whole = stripLeadingZeros(wholeRaw);
  const fraction = fractionRaw.replace(/0+$/, "");
  const display = fraction.length > 0 ? `${whole},${fraction}` : whole;
  return `${negative ? "-" : ""}${display}%`;
}

export function usedPercentBarWidth(usedPercent: string | null): string {
  if (usedPercent === null || usedPercent.startsWith("-")) {
    return "0%";
  }

  const [wholeRaw = "0", fractionRaw = ""] = usedPercent.split(".");
  const whole = stripLeadingZeros(wholeRaw);
  if (BigInt(whole) >= BigInt(100)) {
    return "100%";
  }

  const fraction = (fractionRaw + "00").slice(0, 2);
  return fraction === "00" ? `${whole}%` : `${whole}.${fraction}%`;
}

export function isUsedPercentOver(usedPercent: string | null): boolean {
  if (usedPercent === null || usedPercent.startsWith("-")) {
    return false;
  }
  const [wholeRaw = "0", fractionRaw = ""] = usedPercent.split(".");
  const hundredths =
    BigInt(stripLeadingZeros(wholeRaw)) * BigInt(100) +
    BigInt((fractionRaw + "00").slice(0, 2));
  return hundredths > BigInt(10000);
}

export function formatArsAmount(amount: string): string {
  const negative = amount.startsWith("-");
  const unsigned = negative ? amount.slice(1) : amount;
  const [wholeRaw = "0", fractionRaw = ""] = unsigned.split(".");
  const whole = stripLeadingZeros(wholeRaw);
  const cents = (fractionRaw + "00").slice(0, 2);
  return `${negative ? "-" : ""}$ ${groupThousands(whole)},${cents}`;
}

export function formatCoveredInstallments(coveredInstallments: string): string {
  const negative = coveredInstallments.startsWith("-");
  const unsigned = negative ? coveredInstallments.slice(1) : coveredInstallments;
  const [wholeRaw = "0", fractionRaw = ""] = unsigned.split(".");
  const whole = stripLeadingZeros(wholeRaw);
  const cents = (fractionRaw + "00").slice(0, 2);
  return `${negative ? "-" : ""}${groupThousands(whole)},${cents}`;
}

export function formatPaidAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const months = [
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "sep",
    "oct",
    "nov",
    "dic",
  ] as const;
  const month = months[date.getMonth()] ?? "";
  return `${date.getDate()} ${month} ${date.getFullYear()}`;
}

export function formatRunway(runwayMonths: string | null): string {
  if (runwayMonths === null) {
    return "Sin datos suficientes";
  }

  const [wholeRaw = "0", fractionRaw = ""] = runwayMonths.split(".");
  const whole = stripLeadingZeros(wholeRaw);
  const fraction = fractionRaw.replace(/0+$/, "");
  const display = fraction.length > 0 ? `${whole},${fraction}` : whole;
  const singular = whole === "1" && fraction.length === 0;
  return `${display} ${singular ? "mes" : "meses"}`;
}

export function isPositiveAmount(amount: string): boolean {
  if (amount.startsWith("-")) {
    return false;
  }
  return /[1-9]/.test(amount);
}

export function amountToCents(amount: string): bigint {
  const negative = amount.startsWith("-");
  const unsigned = negative ? amount.slice(1) : amount;
  const [wholeRaw = "0", fractionRaw = ""] = unsigned.split(".");
  const whole = stripLeadingZeros(wholeRaw);
  const cents = (fractionRaw + "00").slice(0, 2);
  const value = BigInt(whole) * BigInt(100) + BigInt(cents);
  return negative ? -value : value;
}

export function maxAmount(...amounts: Array<string | null>): string {
  let best = "0.00";
  for (const amount of amounts) {
    if (amount && amountToCents(amount) > amountToCents(best)) {
      best = amount;
    }
  }
  return best;
}

export function barSharePercent(amount: string, max: string): string {
  const value = amountToCents(amount);
  const ceiling = amountToCents(max);
  const zero = BigInt(0);
  if (ceiling <= zero || value <= zero) {
    return "0%";
  }
  const percent = (value * BigInt(100)) / ceiling;
  if (percent === zero) {
    return "1%";
  }
  const hundred = BigInt(100);
  return `${percent > hundred ? hundred : percent}%`;
}

function stripLeadingZeros(value: string): string {
  const stripped = value.replace(/^0+(?=\d)/, "");
  return stripped.length > 0 ? stripped : "0";
}

function groupThousands(digits: string): string {
  let grouped = "";
  for (let index = digits.length; index > 0; index -= 3) {
    const start = Math.max(0, index - 3);
    const chunk = digits.slice(start, index);
    grouped = grouped.length > 0 ? `${chunk}.${grouped}` : chunk;
  }
  return grouped;
}
