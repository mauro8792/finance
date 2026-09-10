import { z } from "zod";
import { parseMoney } from "shared";

/**
 * Accepts human es-AR money strings or plain numbers; outputs canonical "1234.56".
 */
export const PositiveMoneyAmountSchema = z
  .union([z.string(), z.number()])
  .transform((value, ctx) => {
    const raw = typeof value === "number" ? String(value) : value;
    const parsed = parseMoney(raw);
    if (!parsed.ok) {
      ctx.addIssue({ code: "custom", message: parsed.reason });
      return z.NEVER;
    }
    return parsed.canonical;
  });

export const OptionalNullablePositiveMoneyAmountSchema = z
  .union([PositiveMoneyAmountSchema, z.null()])
  .optional();
