/**
 * P0.14 — Human money parsing (es-AR first) → canonical decimal string.
 *
 * Canonical output: positive amount with exactly 2 fraction digits, e.g. "95784.34".
 * Never uses Number() on human input (avoids float drift).
 *
 * Ambiguity rules (documented + tested):
 * 1. Strip currency tokens: leading/trailing `$`, `ARS`, `USD` (case-insensitive) and spaces.
 * 2. Both `.` and `,` present → the **last** separator is the decimal mark;
 *    the other character is thousands grouping.
 *    - "95.784,34" → 95784.34
 *    - "95,784.34" → 95784.34
 * 3. Only `,`:
 *    - multiple commas → thousands (last group may be decimals if 1–2 digits)
 *    - single comma + 1–2 digits after → decimal
 *    - single comma + exactly 3 digits after → **thousands** (es-AR / en-US ambiguity → thousands)
 *    - single comma + >3 digits after → invalid
 * 4. Only `.`:
 *    - multiple dots → thousands (optional final 1–2 digit decimals not allowed with multi-dot;
 *      use comma for decimals in es-AR multi-thousand forms)
 *    - single dot + 1–2 digits after → decimal
 *    - single dot + exactly 3 digits after → **thousands** (Argentina-first)
 *    - single dot + >3 digits after → invalid
 * 5. No separators → integer major units.
 * 6. Reject negatives, empty, letters (aside from currency tokens), >2 true decimals.
 */

const CANONICAL_PATTERN = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;

export type ParseMoneySuccess = {
  ok: true;
  /** Intermediate normalized form before forcing 2 decimals (e.g. "12.5"). */
  normalized: string;
  /** Canonical API amount with exactly 2 decimals (e.g. "12.50"). */
  canonical: string;
};

export type ParseMoneyFailure = {
  ok: false;
  reason: string;
};

export type ParseMoneyResult = ParseMoneySuccess | ParseMoneyFailure;

export function stripMoneyDecorators(raw: string): string {
  let value = raw.trim().replace(/\u00a0/g, " ");
  value = value.replace(/\s+/g, " ");
  // Repeatedly strip currency tokens at edges.
  let prev = "";
  while (value !== prev) {
    prev = value;
    value = value
      .replace(/^(?:ARS|USD|\$)\s*/i, "")
      .replace(/\s*(?:ARS|USD|\$)$/i, "")
      .trim();
  }
  return value.replace(/\s/g, "");
}

/**
 * Normalize human money input to a plain ASCII decimal with optional fraction
 * (`.` decimal, no thousands). Does not force 2 decimals.
 */
export function normalizeMoneyInput(raw: string): string {
  const trimmed = stripMoneyDecorators(raw);
  if (!trimmed) {
    return "";
  }

  if (/[^0-9.,]/.test(trimmed)) {
    return trimmed; // leave invalid chars; validators reject
  }

  const hasComma = trimmed.includes(",");
  const hasDot = trimmed.includes(".");

  if (hasComma && hasDot) {
    const lastComma = trimmed.lastIndexOf(",");
    const lastDot = trimmed.lastIndexOf(".");
    if (lastComma > lastDot) {
      // Decimal comma; dots are thousands
      return trimmed.replace(/\./g, "").replace(",", ".");
    }
    // Decimal dot; commas are thousands
    return trimmed.replace(/,/g, "");
  }

  if (hasComma) {
    const parts = trimmed.split(",");
    if (parts.length > 2) {
      // 1,234,567 or 1,234,56 → last group decimals if 1–2 digits
      const last = parts[parts.length - 1] ?? "";
      const head = parts.slice(0, -1).join("");
      if (/^\d{1,2}$/.test(last) && /^\d+$/.test(head)) {
        return `${head}.${last}`;
      }
      if (/^\d+$/.test(last) && /^\d+$/.test(head) && last.length === 3) {
        return `${head}${last}`;
      }
      return trimmed.replace(/,/g, "");
    }
    const [whole = "", fraction = ""] = parts;
    if (!/^\d+$/.test(whole) || !/^\d+$/.test(fraction)) {
      return trimmed.replace(",", ".");
    }
    if (fraction.length === 3) {
      // Ambiguous "1,000" → thousands (documented)
      return `${whole}${fraction}`;
    }
    if (fraction.length <= 2) {
      return `${whole}.${fraction}`;
    }
    return `${whole}.${fraction}`; // invalid length caught later
  }

  if (hasDot) {
    const parts = trimmed.split(".");
    if (parts.length > 2) {
      // 25.400.000 — all thousands, no decimal group
      const joined = parts.join("");
      return /^\d+$/.test(joined) ? joined : trimmed;
    }
    const [whole = "", fraction = ""] = parts;
    if (!/^\d+$/.test(whole) || !/^\d+$/.test(fraction)) {
      return trimmed;
    }
    if (fraction.length === 3) {
      // Ambiguous "1.000" / "10.123" → thousands (Argentina-first)
      return `${whole}${fraction}`;
    }
    if (fraction.length <= 2) {
      return `${whole}.${fraction}`;
    }
    return `${whole}.${fraction}`;
  }

  return trimmed;
}

export function isCanonicalPositiveAmount(value: string): boolean {
  if (!CANONICAL_PATTERN.test(value)) {
    return false;
  }
  const [whole, fraction = ""] = value.split(".");
  const scaled = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return scaled > 0n;
}

export function toCanonicalAmount(normalized: string): string {
  const [whole, fraction = ""] = normalized.split(".");
  return `${whole}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}

export function parseMoney(raw: string): ParseMoneyResult {
  const normalized = normalizeMoneyInput(raw);
  if (!normalized) {
    return { ok: false, reason: "Monto vacío." };
  }
  if (!CANONICAL_PATTERN.test(normalized)) {
    return {
      ok: false,
      reason:
        "El importe debe ser un decimal positivo con hasta 2 decimales (formato es-AR admitido).",
    };
  }
  const [whole, fraction = ""] = normalized.split(".");
  const scaled = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (scaled <= 0n) {
    return { ok: false, reason: "El importe debe ser mayor que 0." };
  }
  return {
    ok: true,
    normalized,
    canonical: toCanonicalAmount(normalized),
  };
}

export function parseMoneyOrThrow(raw: string): string {
  const result = parseMoney(raw);
  if (!result.ok) {
    throw new Error(result.reason);
  }
  return result.canonical;
}

/** Compatibility aliases used by web QuickAdd. */
export function normalizeAmountInput(raw: string): string {
  return normalizeMoneyInput(raw);
}

export function isValidAmount(raw: string): boolean {
  return parseMoney(raw).ok;
}

export function toApiAmount(raw: string): string {
  const result = parseMoney(raw);
  if (!result.ok) {
    throw new Error(result.reason);
  }
  return result.canonical;
}
