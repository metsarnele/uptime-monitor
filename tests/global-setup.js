// Global setup for Playwright tests

async function globalSetup() {
  console.log('🚀 Setting up global test environment...');

  // Initialize simple resource tracker for coordination between tests
  if (!global.testResourceTracker) {
    global.testResourceTracker = {
      servers: new Map(), // port -> {process, processInfo, dbPath, workerIndex}
      databases: new Set() // Set of database file paths
    };
  }

  console.log('✅ Global setup complete');
}

export default globalSetup;
