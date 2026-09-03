import {
  disconnectBootstrap,
  setPasswordForUniqueUser,
} from "../src/modules/auth/bootstrap-auth.js";

async function main(): Promise<void> {
  const password = process.env.BOOTSTRAP_PASSWORD;
  if (!password) {
    throw new Error("Definí BOOTSTRAP_PASSWORD. El valor no se imprime.");
  }

  const result = await setPasswordForUniqueUser(password);
  console.log(`Password actualizado para user ${result.userId}.`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectBootstrap();
  });
