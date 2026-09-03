import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import { closeHttpServer, createGracefulShutdown } from "./shutdown.js";

test("closeHttpServer stops accepting connections", async () => {
  const server = http.createServer((_req, res) => {
    res.statusCode = 204;
    res.end();
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}/`;
  const before = await fetch(url);
  assert.equal(before.status, 204);
  await closeHttpServer(server);
  await assert.rejects(() => fetch(url));
});

test("graceful shutdown closes HTTP then disconnects Prisma hook", async () => {
  const server = http.createServer((_req, res) => {
    res.statusCode = 204;
    res.end();
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const order: string[] = [];
  let exitCode: number | undefined;
  const shutdown = createGracefulShutdown(server, {
    disconnect: async () => {
      order.push("disconnect");
    },
    exit: (code) => {
      order.push(`exit:${code}`);
      exitCode = code;
    },
  });
  await shutdown();
  assert.equal(server.listening, false);
  assert.deepEqual(order, ["disconnect", "exit:0"]);
  assert.equal(exitCode, 0);
});
