// Playwright configuration for Bun
// This is a simple configuration that will be updated when Playwright is installed

export default {
  testDir: './tests/e2e',
  timeout: process.env.CI ? 60 * 1000 : 30 * 1000, // Pikendatud timeout CI keskkonnas
  expect: {
    timeout: process.env.CI ? 20000 : 10000 // Suurendatud expect timeout CI jaoks
  },
  fullyParallel: false, // Keelatud paralleelsus stabiilsuse tagamiseks
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // CI keskkonnas kasutatakse vähem töötajaid
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['html'], ['list']] : 'list',
  globalSetup: './tests/global-setup.js',
  globalTeardown: './tests/global-teardown.js',
  use: {
    actionTimeout: process.env.PLAYWRIGHT_ACTION_TIMEOUT ? 
      parseInt(process.env.PLAYWRIGHT_ACTION_TIMEOUT) : 
      (process.env.CI ? 30000 : 10000), // Suurendatud default action timeout CI jaoks
    navigationTimeout: process.env.PLAYWRIGHT_NAVIGATION_TIMEOUT ? 
      parseInt(process.env.PLAYWRIGHT_NAVIGATION_TIMEOUT) : 
      (process.env.CI ? 30000 : 15000), // Lisatud navigatsiooniaeg
    // Sisselülitatud tracer kõigi testide jaoks CI keskkonnas
    trace: process.env.CI ? 'on' : 'on-first-retry',
    // Lisatud screenshot'id ebaõnnestumiste korral
    screenshot: process.env.CI ? 'on' : 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        actionTimeout: process.env.CI ? 30000 : 5000, // Suurendatud chromium timeout CI jaoks
      },
    },
    {
      name: 'firefox',
      use: {
        browserName: 'firefox',
        // Firefox can be slower, increase timeouts significantly
        actionTimeout: process.env.CI ? 40000 : 15000, // Eriti suurendatud Firefox timeout CI jaoks
        navigationTimeout: process.env.CI ? 40000 : 15000,
      },
    },
  ],
  // We don't use the built-in webServer because we'll start a server for each test
};
