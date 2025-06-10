// Playwright configuration for Bun
// This is a simple configuration that will be updated when Playwright is installed

export default {
  testDir: './tests/e2e',
  timeout: 5 * 1000, // Increased for Firefox compatibility
  expect: {
    timeout: 5000
  },
  fullyParallel: true, // Enable parallel execution
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Let Playwright automatically determine optimal worker count
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
    {
      name: 'firefox',
      use: {
        browserName: 'firefox',
        // Firefox can be slower, increase timeout
        actionTimeout: 5000,
      },
    },
  ],
  // We don't use the built-in webServer because we'll start a server for each test
};
