// Global teardown for Playwright tests

async function globalTeardown() {
  console.log('🧽 Running global teardown...');

  // Verify that individual cleanup worked properly
  if (global.testResourceTracker) {
    const remainingServers = global.testResourceTracker.servers.size;
    const remainingDatabases = global.testResourceTracker.databases.size;

    if (remainingServers > 0 || remainingDatabases > 0) {
      console.log(`⚠️  Warning: ${remainingServers} servers and ${remainingDatabases} databases still tracked (individual cleanup may have failed)`);
    } else {
      console.log('✅ All resources cleaned up successfully');
    }
  }

  console.log('✅ Global teardown complete');
}

export default globalTeardown;
