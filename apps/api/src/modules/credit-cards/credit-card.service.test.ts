import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { AppError } from "../../shared/errors/app-error.js";
import { CreditCardService } from "./credit-card.service.js";
import type {
  CreateCreditCardInput,
  CreditCard,
  CreditCardRepository,
  UpdateCreditCardInput,
} from "./credit-card.types.js";

class MemoryCreditCardRepository implements CreditCardRepository {
  readonly items = new Map<string, CreditCard>();

  async create(input: CreateCreditCardInput): Promise<CreditCard> {
    if (input.isPrimary) {
      for (const item of this.items.values()) {
        if (item.userId === input.userId && item.isPrimary) {
          this.items.set(item.id, { ...item, isPrimary: false, updatedAt: new Date() });
        }
      }
    }
    const now = new Date();
    const card: CreditCard = {
      id: randomUUID(),
      userId: input.userId,
      name: input.name,
      issuer: input.issuer,
      brand: input.brand,
      currency: input.currency,
      isActive: input.isActive ?? true,
      isPrimary: input.isPrimary ?? false,
      closingDay: input.closingDay ?? null,
      dueDay: input.dueDay ?? null,
      feeStatus: input.feeStatus ?? "UNKNOWN",
      feeExpectedAmount: input.feeExpectedAmount ?? null,
      feeNotes: input.feeNotes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.items.set(card.id, card);
    return card;
  }

  async findById(id: string): Promise<CreditCard | null> {
    return this.items.get(id) ?? null;
  }

  async findByUserId(userId: string): Promise<CreditCard[]> {
    return [...this.items.values()]
      .filter((item) => item.userId === userId)
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name));
  }

  async update(id: string, input: UpdateCreditCardInput): Promise<CreditCard> {
    const current = this.items.get(id);
    if (!current) {
      throw new Error("missing");
    }
    const updated: CreditCard = {
      ...current,
      ...input,
      updatedAt: new Date(),
    };
    this.items.set(id, updated);
    return updated;
  }

  async setPrimary(userId: string, id: string): Promise<CreditCard> {
    for (const item of this.items.values()) {
      if (item.userId === userId && item.isPrimary) {
        this.items.set(item.id, { ...item, isPrimary: false, updatedAt: new Date() });
      }
    }
    return this.update(id, { isPrimary: true });
  }
}

const userId = randomUUID();

function baseInput() {
  return {
    name: "Visa Santander",
    issuer: "Santander",
    brand: "Visa",
    currency: "ARS" as const,
  };
}

test("CreditCardService creates a card with incomplete config", async () => {
  const service = new CreditCardService(new MemoryCreditCardRepository());
  const created = await service.create(userId, baseInput());
  assert.equal(created.name, "Visa Santander");
  assert.equal(created.closingDay, null);
  assert.equal(created.dueDay, null);
  assert.equal(created.isActive, true);
  assert.equal(created.isPrimary, false);
  assert.equal(created.feeStatus, "UNKNOWN");
});

test("CreditCardService lists only the current user cards", async () => {
  const repo = new MemoryCreditCardRepository();
  const service = new CreditCardService(repo);
  const other = randomUUID();
  await service.create(userId, baseInput());
  await service.create(other, { ...baseInput(), name: "Otra" });
  const listed = await service.list(userId);
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.name, "Visa Santander");
});

test("CreditCardService updates fields and allows null days", async () => {
  const service = new CreditCardService(new MemoryCreditCardRepository());
  const created = await service.create(userId, {
    ...baseInput(),
    closingDay: 25,
    dueDay: 7,
  });
  const updated = await service.update(userId, created.id, {
    name: "Visa BBVA",
    closingDay: null,
    dueDay: null,
  });
  assert.equal(updated.name, "Visa BBVA");
  assert.equal(updated.closingDay, null);
  assert.equal(updated.dueDay, null);
});

test("CreditCardService rejects out-of-range days and invalid currency", async () => {
  const service = new CreditCardService(new MemoryCreditCardRepository());
  await assert.rejects(
    () => service.create(userId, { ...baseInput(), closingDay: 0 }),
    (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  await assert.rejects(
    () => service.create(userId, { ...baseInput(), dueDay: 32 }),
    (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
  await assert.rejects(
    () =>
      service.create(userId, {
        ...baseInput(),
        currency: "EUR" as "ARS",
      }),
    (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
});

test("CreditCardService deactivate and reactivate keep the card", async () => {
  const repo = new MemoryCreditCardRepository();
  const service = new CreditCardService(repo);
  const created = await service.create(userId, { ...baseInput(), isPrimary: true });
  const off = await service.deactivate(userId, created.id);
  assert.equal(off.isActive, false);
  assert.equal(off.isPrimary, false);
  assert.equal(repo.items.size, 1);
  const on = await service.activate(userId, created.id);
  assert.equal(on.isActive, true);
});

test("CreditCardService setPrimary switches A to B", async () => {
  const service = new CreditCardService(new MemoryCreditCardRepository());
  const a = await service.create(userId, { ...baseInput(), isPrimary: true });
  const b = await service.create(userId, {
    ...baseInput(),
    name: "Amex Santander",
    brand: "Amex",
  });
  const primary = await service.setPrimary(userId, b.id);
  assert.equal(primary.isPrimary, true);
  const listed = await service.list(userId);
  assert.equal(listed.filter((item) => item.isPrimary).length, 1);
  assert.equal(listed.find((item) => item.id === a.id)?.isPrimary, false);
  assert.equal(listed.find((item) => item.id === b.id)?.isPrimary, true);
});

test("CreditCardService rejects setPrimary on inactive card", async () => {
  const service = new CreditCardService(new MemoryCreditCardRepository());
  const created = await service.create(userId, baseInput());
  await service.deactivate(userId, created.id);
  await assert.rejects(
    () => service.setPrimary(userId, created.id),
    (error: unknown) => error instanceof AppError && error.code === "VALIDATION_ERROR"
  );
});

test("CreditCardService hides other users cards", async () => {
  const service = new CreditCardService(new MemoryCreditCardRepository());
  const created = await service.create(userId, baseInput());
  await assert.rejects(
    () => service.update(randomUUID(), created.id, { name: "Hack" }),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND"
  );
});
