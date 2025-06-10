#!/usr/bin/env node

import { spawn } from 'child_process';
import { platform } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { broadCleanup } from './cleanup-tracked-resources.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Run cleanup using tracked resources if available, otherwise broad cleanup
 */
async function runCleanup(phase = 'before') {
  const phaseEmoji = {
    'before': '🧹',
    'after': '🧽',
    'interrupted': '🛑',
    'terminated': '🛑'
  };

  console.log(`${phaseEmoji[phase]} Running ${phase}-test cleanup...`);

  // Try to use tracked cleanup if global tracker is available
  if (typeof global !== 'undefined' && global.testResourceTracker) {
    await global.testResourceTracker.cleanup();
  } else {
    // Fall back to broad cleanup
    console.log('⚠️  Global tracker not available, using broad cleanup');
    broadCleanup();
  }
}

/**
 * Run Playwright tests
 */
async function runPlaywrightTests() {
  return new Promise((resolve, reject) => {
    console.log('🚀 Running Playwright tests...');
    
    const playwright = spawn('npx', ['playwright', 'test', '--reporter=list'], {
      stdio: 'inherit'
    });
    
    playwright.on('close', (code) => {
      resolve(code);
    });
    
    playwright.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Main test runner function
 */
async function runTests() {
  let testExitCode = 0;
  
  try {
    // Step 1: Cleanup before tests
    await runCleanup('before');
    
    // Step 2: Run tests
    testExitCode = await runPlaywrightTests();
    
    if (testExitCode === 0) {
      console.log('✅ All tests passed!');
    } else {
      console.log(`❌ Tests failed with exit code ${testExitCode}`);
    }
    
  } catch (error) {
    console.error('❌ Error during test execution:', error.message);
    testExitCode = 1;
  } finally {
    // Step 3: Always cleanup after tests (regardless of test results)
    try {
      console.log('');
      await runCleanup('after');
      console.log('🎉 Test workflow complete!');
    } catch (cleanupError) {
      console.error('⚠️  Post-test cleanup failed:', cleanupError.message);
      // Don't override test exit code with cleanup failure
    }
  }
  
  // Exit with the same code as the tests
  process.exit(testExitCode);
}

// Handle process termination signals to ensure cleanup
process.on('SIGINT', async () => {
  console.log('\n🛑 Test run interrupted. Running cleanup...');
  try {
    await runCleanup('interrupted');
  } catch (error) {
    console.error('Cleanup after interruption failed:', error.message);
  }
  process.exit(130); // Standard exit code for SIGINT
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Test run terminated. Running cleanup...');
  try {
    await runCleanup('terminated');
  } catch (error) {
    console.error('Cleanup after termination failed:', error.message);
  }
  process.exit(143); // Standard exit code for SIGTERM
});

// Run the tests
runTests();
