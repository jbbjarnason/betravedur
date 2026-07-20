import { defineConfig } from "vite";

// GitHub project-pages serve from /<repo>/. The base MUST match the Pages subpath
// exactly (RESEARCH Pattern 4 / Pitfall 4) so pmtiles + data fetches resolve.
export default defineConfig({
  base: "/betravedur/",
  build: {
    target: "es2023",
  },
});
