import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { PrismaTransactionRepository } from "../../modules/transactions/transaction.repository.js";
import { AppError } from "../errors/app-error.js";
import { getPrismaClient } from "./prisma.js";

test("transfer_links enforces unique (userId, idempotencyKey)", async () => {
  const prisma = getPrismaClient();
  const user = await prisma.user.create({
    data: {
      name: "QA TransferLink",
      email: `${randomUUID()}@qa.invalid`,
      passwordHash: "invalid",
    },
  });
  const source = await prisma.account.create({
    data: {
      userId: user.id,
      name: "Source",
      currency: "ARS",
      type: "BANK",
    },
  });
  const destination = await prisma.account.create({
    data: {
      userId: user.id,
      name: "Dest",
      currency: "ARS",
      type: "BANK",
    },
  });
  const outId = randomUUID();
  const inId = randomUUID();
  const outId2 = randomUUID();
  const inId2 = randomUUID();
  const transferId = randomUUID();
  const key = `idemp-${randomUUID()}`;

  try {
    await prisma.transaction.createMany({
      data: [
        {
          id: outId,
          userId: user.id,
          accountId: source.id,
          type: "TRANSFER",
          status: "ACTIVE",
          amount: "10.00",
          currency: "ARS",
          occurredAt: new Date("2026-09-10T12:00:00.000Z"),
          metadata: { transferId, direction: "OUT" },
        },
        {
          id: inId,
          userId: user.id,
          accountId: destination.id,
          type: "TRANSFER",
          status: "ACTIVE",
          amount: "10.00",
          currency: "ARS",
          occurredAt: new Date("2026-09-10T12:00:00.000Z"),
          metadata: { transferId, direction: "IN" },
        },
        {
          id: outId2,
          userId: user.id,
          accountId: source.id,
          type: "TRANSFER",
          status: "ACTIVE",
          amount: "10.00",
          currency: "ARS",
          occurredAt: new Date("2026-09-10T12:00:00.000Z"),
          metadata: { transferId: randomUUID(), direction: "OUT" },
        },
        {
          id: inId2,
          userId: user.id,
          accountId: destination.id,
          type: "TRANSFER",
          status: "ACTIVE",
          amount: "10.00",
          currency: "ARS",
          occurredAt: new Date("2026-09-10T12:00:00.000Z"),
          metadata: { transferId: randomUUID(), direction: "IN" },
        },
      ],
    });
    await prisma.transferLink.create({
      data: {
        userId: user.id,
        transferId,
        sourceAccountId: source.id,
        destinationAccountId: destination.id,
        outTransactionId: outId,
        inTransactionId: inId,
        amount: "10.00",
        currency: "ARS",
        occurredAt: new Date("2026-09-10T12:00:00.000Z"),
        idempotencyKey: key,
      },
    });

    await assert.rejects(
      () =>
        prisma.transferLink.create({
          data: {
            userId: user.id,
            transferId: randomUUID(),
            sourceAccountId: source.id,
            destinationAccountId: destination.id,
            outTransactionId: outId2,
            inTransactionId: inId2,
            amount: "10.00",
            currency: "ARS",
            occurredAt: new Date("2026-09-10T12:00:00.000Z"),
            idempotencyKey: key,
          },
        }),
      (error: unknown) =>
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
    );
  } finally {
    await prisma.transferLink.deleteMany({ where: { userId: user.id } });
    await prisma.transaction.deleteMany({ where: { userId: user.id } });
    await prisma.account.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("createTransferAtomic concurrent same key creates exactly one logical transfer", async () => {
  const prisma = getPrismaClient();
  const repo = new PrismaTransactionRepository();
  const user = await prisma.user.create({
    data: {
      name: "QA Transfer Concurrent",
      email: `${randomUUID()}@qa.invalid`,
      passwordHash: "invalid",
    },
  });
  const source = await prisma.account.create({
    data: {
      userId: user.id,
      name: "Source",
      currency: "ARS",
      type: "BANK",
    },
  });
  const destination = await prisma.account.create({
    data: {
      userId: user.id,
      name: "Dest",
      currency: "ARS",
      type: "CASH",
    },
  });

  const key = `concurrent-${randomUUID()}`;
  const input = {
    userId: user.id,
    sourceAccountId: source.id,
    destinationAccountId: destination.id,
    amount: "150.00",
    description: null as string | null,
    occurredAt: new Date("2026-09-10T15:00:00.000Z"),
    clientSentOccurredAt: true,
    idempotencyKey: key,
  };

  try {
    const results = await Promise.all([
      repo.createTransferAtomic(input),
      repo.createTransferAtomic(input),
    ]);
    const createdCount = results.filter((item) => item.created).length;
    assert.equal(createdCount, 1);
    assert.equal(results[0]!.transferId, results[1]!.transferId);
    assert.equal(results[0]!.out.id, results[1]!.out.id);
    assert.equal(
      await prisma.transferLink.count({ where: { userId: user.id } }),
      1
    );
    assert.equal(
      await prisma.transaction.count({
        where: { userId: user.id, type: "TRANSFER" },
      }),
      2
    );

    await assert.rejects(
      () =>
        repo.createTransferAtomic({
          ...input,
          amount: "200.00",
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "IDEMPOTENCY_CONFLICT"
    );
  } finally {
    await prisma.transferLink.deleteMany({ where: { userId: user.id } });
    await prisma.transaction.deleteMany({ where: { userId: user.id } });
    await prisma.account.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("createTransferAtomic allows negative source balance (lock order by UUID)", async () => {
  const prisma = getPrismaClient();
  const repo = new PrismaTransactionRepository();
  const user = await prisma.user.create({
    data: {
      name: "QA Transfer Negative",
      email: `${randomUUID()}@qa.invalid`,
      passwordHash: "invalid",
    },
  });
  const first = await prisma.account.create({
    data: {
      userId: user.id,
      name: "Account-A",
      currency: "ARS",
      type: "BANK",
    },
  });
  const second = await prisma.account.create({
    data: {
      userId: user.id,
      name: "Account-B",
      currency: "ARS",
      type: "INVESTMENT",
    },
  });
  // Ensure source.id > destination.id so lock order is destination then source.
  const [destination, source] =
    first.id < second.id ? [first, second] : [second, first];
  await prisma.account.update({
    where: { id: destination.id },
    data: { type: "BANK", name: "Dest-first-lock" },
  });
  await prisma.account.update({
    where: { id: source.id },
    data: { type: "INVESTMENT", name: "Source-second-lock" },
  });

  try {
    const created = await repo.createTransferAtomic({
      userId: user.id,
      sourceAccountId: source.id,
      destinationAccountId: destination.id,
      amount: "150.00",
      description: null,
      occurredAt: new Date("2026-09-10T16:00:00.000Z"),
      clientSentOccurredAt: false,
      idempotencyKey: `neg-${randomUUID()}`,
    });
    assert.equal(created.created, true);
    assert.equal(created.out.accountId, source.id);
    assert.equal(created.in.accountId, destination.id);
    assert.equal(await prisma.investment.count({ where: { userId: user.id } }), 0);
  } finally {
    await prisma.transferLink.deleteMany({ where: { userId: user.id } });
    await prisma.transaction.deleteMany({ where: { userId: user.id } });
    await prisma.account.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
