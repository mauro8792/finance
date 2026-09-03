import type { Server } from "node:http";

export type ShutdownHooks = {
  disconnect: () => Promise<void>;
  timeoutMs?: number;
  exit?: (code: number) => void;
};

export function closeHttpServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export function createGracefulShutdown(server: Server, hooks: ShutdownHooks): () => Promise<void> {
  const timeoutMs = hooks.timeoutMs ?? 25_000;
  const exit = hooks.exit ?? ((code: number) => process.exit(code));
  let shuttingDown = false;

  return async (): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    const timer = setTimeout(() => {
      exit(1);
    }, timeoutMs);
    timer.unref();
    try {
      await closeHttpServer(server);
      await hooks.disconnect();
      clearTimeout(timer);
      exit(0);
    } catch {
      clearTimeout(timer);
      exit(1);
    }
  };
}

export function installGracefulShutdown(server: Server, hooks: ShutdownHooks): () => Promise<void> {
  const shutdown = createGracefulShutdown(server, hooks);
  process.on("SIGTERM", () => {
    void shutdown();
  });
  process.on("SIGINT", () => {
    void shutdown();
  });
  return shutdown;
}
