import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { bootstrapAuthCredentials, setPasswordForUniqueUser } from "./bootstrap-auth.js";
import { verifyPassword } from "./password.js";
import {
  DEFAULT_USER_TIMEZONE,
  type CreateUserInput,
  type User,
  type UserAuthRecord,
  type UserRepository,
} from "../users/user.types.js";

class MemoryUsers implements UserRepository {
  readonly items: User[] = [];
  hashes = new Map<string, string>();

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
    this.items.push(user);
    this.hashes.set(user.id, "invalid");
    return user;
  }

  async findById(id: string): Promise<User | null> {
    return this.items.find((item) => item.id === id) ?? null;
  }

  async findFirst(): Promise<User | null> {
    return this.items[0] ?? null;
  }

  async findAuthByEmail(email: string): Promise<UserAuthRecord | null> {
    const user = this.items.find((item) => item.email === email);
    return user ? { user, passwordHash: this.hashes.get(user.id) ?? "invalid" } : null;
  }

  async count(): Promise<number> {
    return this.items.length;
  }

  async setCredentials(userId: string, email: string, passwordHash: string): Promise<User> {
    const index = this.items.findIndex((item) => item.id === userId);
    if (index < 0) {
      throw new Error("missing");
    }
    const updated = { ...this.items[index]!, email };
    this.items[index] = updated;
    this.hashes.set(userId, passwordHash);
    return updated;
  }
}

const PASSWORD = "correct-horse-battery-staple";

test("bootstrap with 0 users creates exactly one", async () => {
  const users = new MemoryUsers();
  const result = await bootstrapAuthCredentials({
    email: "prod@example.test",
    password: PASSWORD,
    name: "Mauro",
    users,
  });
  assert.equal(result.action, "created");
  assert.equal(users.items.length, 1);
  assert.equal(users.items[0]?.id, result.userId);
  assert.equal(users.items[0]?.email, "prod@example.test");
  assert.equal(users.items[0]?.name, "Mauro");
  const stored = users.hashes.get(result.userId);
  assert.ok(stored?.startsWith("$argon2"));
  assert.equal(await verifyPassword(stored!, PASSWORD), true);
});

test("bootstrap with 1 user updates that user and keeps the id", async () => {
  const users = new MemoryUsers();
  const existing = await users.create({ name: "QA", email: "old@example.test" });
  const result = await bootstrapAuthCredentials({
    email: "new@example.test",
    password: PASSWORD,
    users,
  });
  assert.equal(result.action, "updated");
  assert.equal(result.userId, existing.id);
  assert.equal(users.items.length, 1);
  assert.equal(users.items[0]?.email, "new@example.test");
});

test("bootstrap with more than 1 user fails fast", async () => {
  const users = new MemoryUsers();
  await users.create({ name: "A", email: "a@example.test" });
  await users.create({ name: "B", email: "b@example.test" });
  await assert.rejects(
    () => bootstrapAuthCredentials({ email: "c@example.test", password: PASSWORD, users }),
    /FAIL FAST/
  );
  assert.equal(users.items.length, 2);
  assert.equal(users.items[0]?.email, "a@example.test");
  assert.equal(users.items[1]?.email, "b@example.test");
});

test("setPassword requires exactly one user", async () => {
  const users = new MemoryUsers();
  await assert.rejects(() => setPasswordForUniqueUser(PASSWORD, users), /exactamente 1/);
  await users.create({ name: "A", email: "a@example.test" });
  const result = await setPasswordForUniqueUser(PASSWORD, users);
  assert.equal(result.userId, users.items[0]?.id);
  assert.ok(users.hashes.get(result.userId)?.startsWith("$argon2"));
});
