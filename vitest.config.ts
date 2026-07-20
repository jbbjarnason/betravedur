import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/**/test/**/*.test.ts",
      "pipeline/test/**/*.test.ts",
      "test/**/*.test.ts",
      // Site unit tests live next to source (co-located data-layer specs).
      "site/src/**/*.test.ts",
    ],
    watch: false,
    coverage: {
      provider: "v8",
      include: ["packages/domain/src/**", "pipeline/src/**"],
    },
  },
});
