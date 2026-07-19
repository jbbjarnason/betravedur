import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/**/test/**/*.test.ts",
      "pipeline/test/**/*.test.ts",
      "test/**/*.test.ts",
    ],
    watch: false,
    coverage: {
      provider: "v8",
      include: ["packages/domain/src/**", "pipeline/src/**"],
    },
  },
});
