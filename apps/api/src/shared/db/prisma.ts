import { PrismaClient } from "@prisma/client";
import { assertSafeTestDatabaseUrl, getDatabaseUrl } from "../../config/index.js";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

/**
 * Instancia reutilizable de PrismaClient.
 * Usar solo desde infraestructura y repositories.
 */
export function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const url = getDatabaseUrl();
    if (process.env.PF_REQUIRE_TEST_DB === "1") {
      assertSafeTestDatabaseUrl(url);
    }
    globalForPrisma.prisma = new PrismaClient({
      datasources: {
        db: {
          url,
        },
      },
    });
  }

  return globalForPrisma.prisma;
}

export const prisma = {
  get client(): PrismaClient {
    return getPrismaClient();
  },
};

export async function checkDatabaseConnection(): Promise<void> {
  await getPrismaClient().$queryRaw`SELECT 1`;
}
