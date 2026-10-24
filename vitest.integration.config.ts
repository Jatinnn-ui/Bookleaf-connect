import { defineConfig } from "vitest/config";
import { sharedAlias } from "./vitest.config";

// Integration tests run against a real PostgreSQL database (TEST_DATABASE_URL).
// That database is RESET on every run, so never point it at real data.
export default defineConfig({
  resolve: { alias: sharedAlias },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/integration/global-setup.ts"],
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
      AUTH_SECRET: "integration-test-secret-0123456789abcdefghij",
      GEMINI_API_KEY: "",
      NODE_ENV: "test",
    },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
