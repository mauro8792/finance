import { randomUUID } from "node:crypto";
import {
  getSessionTtlDays,
  SESSION_IDLE_MS,
} from "../../config/index.js";
import { getPrismaClient } from "../../shared/db/prisma.js";
import { generateSessionToken, hashSessionToken } from "./session-token.js";

export type AuthSession = {
  id: string;
  userId: string;
  expiresAt: Date;
  absoluteExpiresAt: Date;
};

export class SessionService {
  constructor(private readonly prisma = getPrismaClient()) {}

  async create(userId: string, now = new Date()): Promise<{ token: string; session: AuthSession }> {
    const absoluteExpiresAt = new Date(
      now.getTime() + getSessionTtlDays() * 24 * 60 * 60 * 1000
    );
    const expiresAt = earlierDate(new Date(now.getTime() + SESSION_IDLE_MS), absoluteExpiresAt);
    const token = generateSessionToken();
    const id = randomUUID();
    const created = await this.prisma.session.create({
      data: {
        id,
        userId,
        tokenHash: hashSessionToken(token),
        createdAt: now,
        absoluteExpiresAt,
        expiresAt,
      },
    });
    return {
      token,
      session: toAuthSession(created),
    };
  }

  async findValidByToken(token: string, now = new Date()): Promise<AuthSession | null> {
    if (!token) {
      return null;
    }
    const record = await this.prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(token) },
    });
    if (!record || record.revokedAt || record.expiresAt <= now || record.absoluteExpiresAt <= now) {
      return null;
    }
    return toAuthSession(record);
  }

  async touch(session: AuthSession, now = new Date()): Promise<AuthSession> {
    const nextExpires = earlierDate(new Date(now.getTime() + SESSION_IDLE_MS), session.absoluteExpiresAt);
    if (nextExpires <= session.expiresAt) {
      return session;
    }
    const updated = await this.prisma.session.update({
      where: { id: session.id },
      data: { expiresAt: nextExpires },
    });
    return toAuthSession(updated);
  }

  async revoke(sessionId: string, now = new Date()): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: now },
    });
  }
}

function earlierDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

function toAuthSession(record: {
  id: string;
  userId: string;
  expiresAt: Date;
  absoluteExpiresAt: Date;
}): AuthSession {
  return {
    id: record.id,
    userId: record.userId,
    expiresAt: record.expiresAt,
    absoluteExpiresAt: record.absoluteExpiresAt,
  };
}
