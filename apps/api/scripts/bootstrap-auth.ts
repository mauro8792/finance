import {
  bootstrapAuthCredentials,
  disconnectBootstrap,
} from "../src/modules/auth/bootstrap-auth.js";

async function main(): Promise<void> {
  const email = process.env.BOOTSTRAP_EMAIL?.trim();
  const password = process.env.BOOTSTRAP_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "Definí BOOTSTRAP_EMAIL y BOOTSTRAP_PASSWORD. No commitees esos valores. Ver apps/api/.env.example."
    );
  }

  const result = await bootstrapAuthCredentials({
    email,
    password,
    name: process.env.BOOTSTRAP_NAME,
  });
  const verb = result.action === "created" ? "creado" : "actualizado";
  console.log(`Bootstrap OK. User ${result.userId} ${verb}.`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectBootstrap();
  });
