import { defineConfig } from "vitest/config";
import path from "node:path";

// Vitest runs the pure calculation library (no DOM, no Supabase).
// Path alias mirrors tsconfig so test imports use `@/lib/...` like the app.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    globals: false,
    reporters: "default",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
