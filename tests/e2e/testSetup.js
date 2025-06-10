// Common test setup file
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { test as base } from '@playwright/test';

// Test server port range (must match cleanup script)
const TEST_PORT_START = 3100;
const TEST_PORT_END = 3400;

// Generate unique test database name for each test run
export const getTestDbPath = (workerIndex = 0, testTitle = '') => {
  // Create a database file name with worker index, timestamp and random string for uniqueness
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  const processId = process.pid;
  const testSlug = testTitle.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10);
  return `test-database-w${workerIndex}-${processId}-${timestamp}-${randomStr}-${testSlug}.sqlite`;
};

// Counter for unique port assignment per worker
const workerPortCounters = new Map();

// Helper function to get process information
function getProcessInfo(pid) {
  try {
    const { execSync } = require('child_process');
    const { platform } = require('os');
    const isWindows = platform() === 'win32';

    if (isWindows) {
      const output = execSync(`wmic process where "ProcessId=${pid}" get Name,CommandLine /format:csv`, { encoding: 'utf8' });
      const lines = output.split('\n').filter(line => line.trim() && !line.startsWith('Node'));
      if (lines.length > 0) {
        const parts = lines[0].split(',');
        return {
          name: parts[2] || 'unknown',
          command: parts[1] || 'unknown'
        };
      }
    } else {
      const nameOutput = execSync(`ps -p ${pid} -o comm=`, { encoding: 'utf8' }).trim();
      const cmdOutput = execSync(`ps -p ${pid} -o args=`, { encoding: 'utf8' }).trim();
      return {
        name: nameOutput || 'unknown',
        command: cmdOutput || 'unknown'
      };
    }
  } catch (e) {
    return { name: 'unknown', command: 'unknown' };
  }
}

// Global resource tracker
global.testResourceTracker = global.testResourceTracker || {
  servers: new Map(), // port -> { process, dbPath, workerIndex }
  databases: new Set(), // Set of database file paths
  cleanup: async function() {
    console.log('🧹 Cleaning up tracked test resources...');
    let cleanedCount = 0;

    // Kill tracked server processes
    for (const [port, resource] of this.servers) {
      try {
        if (resource.process && resource.process.pid) {
          const processInfo = getProcessInfo(resource.process.pid);
          process.kill(resource.process.pid, 'SIGTERM');
          setTimeout(() => {
            try {
              process.kill(resource.process.pid, 0); // Check if still alive
              process.kill(resource.process.pid, 'SIGKILL'); // Force kill
            } catch (e) {
              // Process already dead
            }
          }, 200);
          console.log(`✓ Killed server on port ${port} (PID: ${resource.process.pid}, ${processInfo.name}): ${processInfo.command}`);
          cleanedCount++;
        }
      } catch (error) {
        console.log(`⚠ Could not kill server on port ${port}: ${error.message}`);
      }
    }

    // Clean up tracked database files
    for (const dbPath of this.databases) {
      try {
        if (fs.existsSync(dbPath)) {
          fs.unlinkSync(dbPath);
          console.log(`✓ Removed database: ${dbPath}`);
          cleanedCount++;
        }
      } catch (error) {
        console.log(`⚠ Could not remove database ${dbPath}: ${error.message}`);
      }
    }

    // Clear tracking
    this.servers.clear();
    this.databases.clear();

    if (cleanedCount > 0) {
      console.log(`✅ Cleaned up ${cleanedCount} tracked resources`);
    } else {
      console.log('✅ No tracked resources to clean up');
    }
  }
};

// Get a unique port for test server based on worker index
export const getTestPort = (workerIndex = 0) => {
  // Initialize counter for this worker if not exists
  if (!workerPortCounters.has(workerIndex)) {
    workerPortCounters.set(workerIndex, 0);
  }

  // Get and increment counter for this worker
  const testIndex = workerPortCounters.get(workerIndex);
  workerPortCounters.set(workerIndex, testIndex + 1);

  // Use worker index and test index to ensure unique ports across parallel workers
  // Each worker gets a range of 100 ports to avoid collisions within the defined range
  const port = TEST_PORT_START + (workerIndex * 100) + testIndex;

  // Ensure we don't exceed the port range
  if (port > TEST_PORT_END) {
    throw new Error(`Port ${port} exceeds test port range (${TEST_PORT_START}-${TEST_PORT_END})`);
  }

  return port;
};

// Initialize a test database
export async function initTestDatabase(dbPath) {
  // Read schema file
  const schema = fs.readFileSync(path.join(process.cwd(), 'database/schema.sql'), 'utf8');

  // Create and initialize the database
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // Execute schema to create tables
  await db.exec(schema);

  return db;
}

// Start a test server for a specific test
export async function startTestServer(dbPath, port) {
  // Start the server process with environment variables
  const serverProcess = spawn('bun', ['run', 'dev'], {
    env: {
      ...process.env,
      TEST_DB: dbPath,
      PORT: port.toString(),
      NODE_ENV: 'test'
    },
    stdio: 'pipe',
    detached: false
  });

  // Add error handling for server process
  serverProcess.on('error', (error) => {
    console.error(`Server process error on port ${port}:`, error);
  });

  // Return the server process and port
  return {
    process: serverProcess,
    port,
    url: `http://localhost:${port}`
  };
}

// Wait for server to be ready with improved reliability for parallel execution
export function waitForServer(url, maxRetries = 150, interval = 100) {
  return new Promise((resolve, reject) => {
    let retries = 0;

    const checkServer = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const response = await fetch(url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Playwright-Test' },
          method: 'GET'
        });

        clearTimeout(timeoutId);

        if (response.status === 200) {
          // Double-check with a second request to ensure server is stable
          try {
            const secondResponse = await fetch(url, {
              headers: { 'User-Agent': 'Playwright-Test' },
              method: 'GET'
            });
            if (secondResponse.status === 200) {
              resolve();
              return;
            }
          } catch (e) {
            // First request succeeded but second failed, continue retrying
          }
        }
      } catch (e) {
        // Server not ready yet, or request timed out
        if (e.name === 'AbortError') {
          // Request timed out, continue retrying
        }
      }

      retries++;
      if (retries >= maxRetries) {
        reject(new Error(`Server at ${url} not ready after ${maxRetries} retries (${maxRetries * interval}ms)`));
        return;
      }

      setTimeout(checkServer, interval);
    };

    // Start checking after a small initial delay to let the server start
    setTimeout(checkServer, 200);
  });
}

// Clean up test database and server with improved error handling
export async function cleanupTest(dbPath, serverProcess) {
  // Kill server process if it exists
  if (serverProcess && serverProcess.pid) {
    try {
      // Try graceful shutdown first
      process.kill(serverProcess.pid, 'SIGTERM');

      // Wait a bit for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 200));

      // Force kill if still running
      try {
        process.kill(serverProcess.pid, 0); // Check if process still exists
        process.kill(serverProcess.pid, 'SIGKILL'); // Force kill if it does
      } catch (e) {
        // Process already dead, which is what we want
      }
    } catch (error) {
      console.error(`Error killing test server: ${error.message}`);
    }
  }

  // Remove database file with retry logic
  let retries = 3;
  while (retries > 0) {
    try {
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
        break;
      }
    } catch (error) {
      retries--;
      if (retries === 0) {
        console.error(`Error cleaning up test database after retries: ${error.message}`);
      } else {
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
  }
}

// Create a test fixture that provides an isolated server and database for each test
export const test = base.extend({
  // Define a fixture for the test server and database
  testServer: async ({ }, use, testInfo) => {
    // Get worker index and test title for unique resource allocation
    const workerIndex = testInfo.workerIndex;
    const testTitle = testInfo.title || '';

    // Create unique test database and server for this test
    const dbPath = getTestDbPath(workerIndex, testTitle);
    await initTestDatabase(dbPath);
    const port = getTestPort(workerIndex);

    // Register database with tracker
    global.testResourceTracker.databases.add(dbPath);

    // Start server for this test
    const server = await startTestServer(dbPath, port);

    // Register server with tracker
    global.testResourceTracker.servers.set(port, {
      process: server.process,
      dbPath,
      workerIndex
    });

    // Wait for server to be ready
    await waitForServer(server.url);

    // Use the server in the test
    await use({
      url: server.url,
      dbPath,
      process: server.process,
      workerIndex,
      port
    });

    // Clean up after the test and remove from tracker
    await cleanupTest(dbPath, server.process);
    global.testResourceTracker.servers.delete(port);
    global.testResourceTracker.databases.delete(dbPath);
  }
});
