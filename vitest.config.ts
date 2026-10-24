import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export const sharedAlias = {
  "@": r("./src"),
  // "server-only" throws outside a React Server environment; it is a no-op in tests.
  "server-only": r("./tests/stubs/server-only.ts"),
};

// Unit tests: pure logic, no database, no network.
export default defineConfig({
  resolve: { alias: sharedAlias },
  test: { include: ["tests/unit/**/*.test.ts"], environment: "node" },
});
