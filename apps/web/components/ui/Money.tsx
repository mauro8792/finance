"use client";

import { formatMoney } from "../../lib/format-money";
import { usePrivacy } from "../PrivacyProvider";

type MoneyProps = {
  amount: string;
  currency?: "ARS" | "USD";
  className?: string;
};

export function Money({ amount, currency = "ARS", className }: MoneyProps) {
  const { maskMoney } = usePrivacy();
  return <span className={className}>{maskMoney(formatMoney(amount, currency))}</span>;
}
