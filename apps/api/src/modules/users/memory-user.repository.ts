import { randomUUID } from "node:crypto";
import type { User, UserAuthRecord, UserRepository } from "./user.types.js";
import { DEFAULT_USER_TIMEZONE } from "./user.types.js";

export class MemoryUserRepository implements UserRepository {
  constructor(private user: User | null) {}

  async create(): Promise<User> {
    if (!this.user) {
      throw new Error("no user");
    }
    return this.user;
  }

  async findById(id: string): Promise<User | null> {
    return this.user && this.user.id === id ? this.user : null;
  }

  async findFirst(): Promise<User | null> {
    return this.user;
  }

  async findAuthByEmail(email: string): Promise<UserAuthRecord | null> {
    if (!this.user || this.user.email !== email) {
      return null;
    }
    return { user: this.user, passwordHash: "invalid" };
  }

  async count(): Promise<number> {
    return this.user ? 1 : 0;
  }

  async setCredentials(userId: string, email: string, passwordHash: string): Promise<User> {
    if (!this.user || this.user.id !== userId) {
      throw new Error("no user");
    }
    this.user = { ...this.user, email };
    void passwordHash;
    return this.user;
  }
}

export function makeTestUser(overrides: Partial<User> = {}): User {
  return {
    id: randomUUID(),
    name: "QA User",
    email: "qa@example.test",
    timezone: DEFAULT_USER_TIMEZONE,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
