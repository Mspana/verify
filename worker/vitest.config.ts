import { defineConfig } from "vitest/config";

// Two test surfaces:
//   - normalize.test.ts is a pure-function test; runs in node with no
//     Workers runtime — cheaper and faster than spinning up the pool.
//   - anything under src/handlers/*.test.ts uses the Workers pool because
//     it needs KV bindings and the Worker environment to be meaningful.
//
// Single config with overrides via `workspace` is the approved layout; if
// we end up writing no handler tests this collapses to just the default.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Handler tests can opt into the Workers pool with a file-level
    // `// @vitest-environment workers` comment once we add any. For now
    // the default node environment covers normalize.ts.
    environment: "node",
  },
  resolve: {
    alias: {
      "@verify/shared": new URL("../shared/src/index.ts", import.meta.url)
        .pathname,
    },
  },
});
