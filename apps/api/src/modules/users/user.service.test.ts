import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { UserService } from "./user.service.js";
import {
  DEFAULT_USER_TIMEZONE,
  type CreateUserInput,
  type User,
  type UserRepository,
} from "./user.types.js";

class MemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, User>();

  async create(input: CreateUserInput): Promise<User> {
    const now = new Date();
    const user: User = {
      id: randomUUID(),
      name: input.name,
      email: input.email ?? `qa-${randomUUID()}@invalid.local`,
      timezone: input.timezone ?? DEFAULT_USER_TIMEZONE,
      createdAt: now,
      updatedAt: now,
    };

    this.users.set(user.id, user);
    return user;
  }

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async findFirst(): Promise<User | null> {
    return this.users.values().next().value ?? null;
  }

  async findAuthByEmail(email: string) {
    const user = [...this.users.values()].find((item) => item.email === email);
    return user ? { user, passwordHash: "invalid" } : null;
  }

  async count() {
    return this.users.size;
  }

  async setCredentials(userId: string, email: string) {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error("missing");
    }
    const updated = { ...user, email };
    this.users.set(userId, updated);
    return updated;
  }
}

test("UserService creates a user and retrieves it by id", async () => {
  const service = new UserService(new MemoryUserRepository());

  const created = await service.create({ name: "Usuario demo" });
  const found = await service.getById(created.id);

  assert.equal(found?.id, created.id);
  assert.equal(found?.name, "Usuario demo");
  assert.equal(typeof found?.email, "string");
  assert.equal(found?.timezone, DEFAULT_USER_TIMEZONE);
});

test("UserService rejects an empty name", async () => {
  const service = new UserService(new MemoryUserRepository());

  await assert.rejects(() => service.create({ name: "   " }), /obligatorio/);
});
