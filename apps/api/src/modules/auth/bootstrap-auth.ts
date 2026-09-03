import { AppError } from "../../shared/errors/app-error.js";
import { getPrismaClient } from "../../shared/db/prisma.js";
import { hashPassword, MIN_PASSWORD_LENGTH } from "./password.js";
import { PrismaUserRepository } from "../users/user.repository.js";
import { UserService } from "../users/user.service.js";
import type { UserRepository } from "../users/user.types.js";

export const DEFAULT_BOOTSTRAP_NAME = "Usuario";

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export type BootstrapAuthResult = {
  userId: string;
  email: string;
  action: "created" | "updated";
};

export async function bootstrapAuthCredentials(options: {
  email: string;
  password: string;
  name?: string;
  users?: UserRepository;
}): Promise<BootstrapAuthResult> {
  const email = normalizeEmail(options.email);
  if (!email || !email.includes("@")) {
    throw new AppError("VALIDATION_ERROR", "BOOTSTRAP_EMAIL no es válido.", 400);
  }
  if (options.password.length < MIN_PASSWORD_LENGTH) {
    throw new AppError(
      "VALIDATION_ERROR",
      `BOOTSTRAP_PASSWORD debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
      400
    );
  }

  const users = options.users ?? new PrismaUserRepository();
  const count = await users.count();
  if (count > 1) {
    throw new Error(
      `Bootstrap requiere 0 o 1 usuario. Encontrados: ${count}. FAIL FAST: no se creó ni modificó ningún user.`
    );
  }

  const passwordHash = await hashPassword(options.password);

  if (count === 0) {
    const created = await new UserService(users).create({
      name: options.name?.trim() || DEFAULT_BOOTSTRAP_NAME,
      email,
    });
    await users.setCredentials(created.id, email, passwordHash);
    return { userId: created.id, email, action: "created" };
  }

  const user = await users.findFirst();
  if (!user) {
    throw new Error("Bootstrap no encontró el usuario único.");
  }
  await users.setCredentials(user.id, email, passwordHash);
  return { userId: user.id, email, action: "updated" };
}

export async function setPasswordForUniqueUser(
  password: string,
  users: UserRepository = new PrismaUserRepository()
): Promise<{ userId: string }> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AppError(
      "VALIDATION_ERROR",
      `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
      400
    );
  }
  const count = await users.count();
  if (count !== 1) {
    throw new Error(`Cambio de password requiere exactamente 1 usuario. Encontrados: ${count}.`);
  }
  const user = await users.findFirst();
  if (!user) {
    throw new Error("No hay usuario.");
  }
  const passwordHash = await hashPassword(password);
  await users.setCredentials(user.id, user.email, passwordHash);
  return { userId: user.id };
}

export async function disconnectBootstrap(): Promise<void> {
  await getPrismaClient().$disconnect();
}
