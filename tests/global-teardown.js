// Global teardown for Playwright tests

async function globalTeardown() {
  console.log('🧽 Running global teardown...');
  
  // Use tracked cleanup if available
  if (global.testResourceTracker) {
    await global.testResourceTracker.cleanup();
  }
  
  console.log('✅ Global teardown complete');
}

export default globalTeardown;
