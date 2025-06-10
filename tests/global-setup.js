// Global setup for Playwright tests
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name in ES modules context
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Cleans up old test database files from previous test runs
 */
function cleanupOldTestDatabases() {
  console.log('🧹 Cleaning up old test database files...');
  const rootDir = path.resolve(__dirname, '..');
  const files = fs.readdirSync(rootDir);
  
  // Find and remove all test database files
  let count = 0;
  for (const file of files) {
    // Safety check: Only remove files that match our test database pattern exactly
    if (file.match(/^test-database-w\d+-\d+-\d+-[a-z0-9]+-?.*\.sqlite$/)) {
      try {
        fs.unlinkSync(path.join(rootDir, file));
        count++;
      } catch (error) {
        console.error(`Error removing file ${file}: ${error.message}`);
      }
    }
  }
  
  console.log(`🗑️ Removed ${count} old test database files`);
}

async function globalSetup() {
  console.log('🚀 Setting up global test environment...');
  
  // Clean up old test database files before running tests
  cleanupOldTestDatabases();

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
