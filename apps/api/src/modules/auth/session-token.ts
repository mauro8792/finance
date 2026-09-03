import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getSessionSecret } from "../../config/index.js";

export const SESSION_TOKEN_BYTES = 32;

export function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
}

export function hashSessionToken(token: string, secret = getSessionSecret()): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

export function sessionTokensEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
