export const CURRENCIES = ["ARS", "USD"] as const;

export type Currency = (typeof CURRENCIES)[number];
