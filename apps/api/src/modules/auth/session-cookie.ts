import type { Request, Response } from "express";
import {
  getSessionCookieName,
  getSessionSecure,
} from "../../config/index.js";

export function readCookie(req: Request, name = getSessionCookieName()): string | undefined {
  const header = req.headers.cookie;
  if (!header) {
    return undefined;
  }
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq);
    if (key === name) {
      return decodeURIComponent(trimmed.slice(eq + 1));
    }
  }
  return undefined;
}

export function setSessionCookie(res: Response, token: string, maxAgeMs: number): void {
  res.appendHeader("Set-Cookie", serializeSessionCookie(token, maxAgeMs));
}

export function expireSessionCookie(res: Response): void {
  res.appendHeader("Set-Cookie", serializeSessionCookie("", 0));
}

function serializeSessionCookie(value: string, maxAgeMs: number): string {
  const parts = [
    `${getSessionCookieName()}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.floor(maxAgeMs / 1000))}`,
  ];
  if (getSessionSecure()) {
    parts.push("Secure");
  }
  return parts.join("; ");
}
