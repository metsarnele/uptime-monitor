// Global teardown for Playwright tests
import { broadCleanup } from '../scripts/cleanup-tracked-resources.js';

async function globalTeardown() {
  console.log('🧽 Running global teardown...');

  // Always run broad cleanup to ensure no processes are left behind
  // The individual cleanup might not be working reliably
  console.log('🧹 Running comprehensive cleanup to ensure no processes are left...');
  broadCleanup();

  // Also try tracked cleanup if available
  if (global.testResourceTracker) {
    const hasRemainingServers = global.testResourceTracker.servers.size > 0;
    const hasRemainingDatabases = global.testResourceTracker.databases.size > 0;

    if (hasRemainingServers || hasRemainingDatabases) {
      console.log(`⚠️  Tracker still has ${global.testResourceTracker.servers.size} servers and ${global.testResourceTracker.databases.size} databases`);
      await global.testResourceTracker.cleanup();
    }
  }

  console.log('✅ Global teardown complete');
}

export default globalTeardown;
