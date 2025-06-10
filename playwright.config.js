// Playwright configuration for Bun
// This is a simple configuration that will be updated when Playwright is installed

export default {
  testDir: './tests/e2e',
  timeout: 2 * 1000,
  expect: {
    timeout: 5000
  },
  fullyParallel: true, // Enable parallel execution
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 2, // Use 2 workers for better stability
  reporter: 'list',
  globalSetup: './tests/global-setup.js',
  globalTeardown: './tests/global-teardown.js',
  use: {
    actionTimeout: 0,
    // We'll set the baseURL dynamically in each test
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
      },
    },
  ],
  // We don't use the built-in webServer because we'll start a server for each test
};
