import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Retry tests in tests/lib/api-client.test.ts sleep 500 + 1000 + 2000 ms
    // (each with up to 50% jitter), totaling ~3.5-5.25s of real time. The
    // default 5000ms testTimeout sits right on that edge and flakes on slow
    // CI runners. Keep generous headroom; if tests genuinely regress past
    // this, the mock is broken, not the timeout.
    testTimeout: 15000,
  },
});
