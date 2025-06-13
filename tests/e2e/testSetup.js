// Common test setup file
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { test as base } from '@playwright/test';

// Test server port range (must match cleanup script) - scalable to hundreds of workers
const TEST_PORT_START = 3100;
const TEST_PORT_END = 3999; // 900 ports to support hundreds of workers

// CI keskkonna tuvastamine
const isCI = !!process.env.CI;

// Generate unique test database name for each test run
export const getTestDbPath = (workerIndex = 0, testTitle = '') => {
  // Create a database file name with worker index, timestamp and random string for uniqueness
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  const processId = process.pid;
  const testSlug = testTitle.replace(/[^a-zA-Z0-9]/g, '').substring(0, 10);
  return `test-database-w${workerIndex}-${processId}-${timestamp}-${randomStr}-${testSlug}.sqlite`;
};

// Simple worker-based port allocation (each worker gets 1 port since tests run sequentially within workers)

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

// Helper function to create worker-specific log prefix
function getWorkerPrefix(workerIndex, testTitle = '') {
  const colors = [
    '\x1b[36m', // Cyan
    '\x1b[33m', // Yellow
    '\x1b[35m', // Magenta
    '\x1b[32m', // Green
    '\x1b[34m', // Blue
    '\x1b[31m', // Red
  ];
  const reset = '\x1b[0m';
  const color = colors[workerIndex % colors.length];
  const shortTitle = testTitle.length > 20 ? testTitle.substring(0, 17) + '...' : testTitle;
  return `${color}[W${workerIndex}${shortTitle ? `:${shortTitle}` : ''}]${reset}`;
}

// Debug output control - suurendatud debug väljund CI keskkonnas
const DEBUG_CLEANUP = isCI || process.env.DEBUG_CLEANUP === 'true' || process.env.DEBUG_CLEANUP === '1';

// Helper function for worker-specific logging (debug only)
function workerLog(workerIndex, testTitle, message) {
  if (!DEBUG_CLEANUP) return; // Skip logging if debug is disabled

  const prefix = getWorkerPrefix(workerIndex, testTitle);
  console.log(`${prefix} ${message}`);
}

// Helper function for important messages (always shown)
function workerInfo(workerIndex, testTitle, message) {
  const prefix = getWorkerPrefix(workerIndex, testTitle);
  console.log(`${prefix} ${message}`);
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

// Get the port for a worker (scalable to hundreds of workers)
export const getTestPort = (workerIndex = 0) => {
  // Each worker gets exactly one port: Worker 0 = 3100, Worker 1 = 3101, etc.
  const port = TEST_PORT_START + workerIndex;

  // Ensure we don't exceed the port range
  if (port > TEST_PORT_END) {
    const maxWorkers = TEST_PORT_END - TEST_PORT_START + 1;
    throw new Error(`Worker ${workerIndex} exceeds maximum supported workers (${maxWorkers}). Port ${port} exceeds range (${TEST_PORT_START}-${TEST_PORT_END})`);
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
  // Start the server process WITHOUT --hot flag for tests (to avoid persistent processes)
  const serverProcess = spawn('bun', ['index.js'], {
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
export async function cleanupTest(dbPath, serverProcess, processInfo = null, workerIndex = 0, testTitle = '') {
  let processKilled = false;

  // Kill server process if it exists
  if (serverProcess && serverProcess.pid) {
    try {
      // Use provided process info or get it fresh (fallback)
      const info = processInfo || getProcessInfo(serverProcess.pid);
      workerLog(workerIndex, testTitle, `🧹 Cleaning up server PID ${serverProcess.pid} (${info.name}): ${info.command}`);

      // First check if process is actually running
      try {
        process.kill(serverProcess.pid, 0); // Check if process exists
      } catch (e) {
        workerLog(workerIndex, testTitle, `✓ Process ${serverProcess.pid} already dead`);
        processKilled = true;
        return { processKilled, dbRemoved: false }; // Early return, skip database cleanup for now
      }

      // For bun processes, we need to be more aggressive
      // Kill the entire process group to handle any child processes
      workerLog(workerIndex, testTitle, `⚠ Force killing process ${serverProcess.pid} and its group...`);

      try {
        const { execSync } = require('child_process');
        // Kill the entire process group
        execSync(`pkill -P ${serverProcess.pid}`, { stdio: 'ignore' }); // Kill children first
        process.kill(serverProcess.pid, 'SIGKILL'); // Then kill the main process
      } catch (e) {
        // Fallback to regular kill
        process.kill(serverProcess.pid, 'SIGKILL');
      }

      // Wait for force kill to take effect
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify the process is actually dead with multiple attempts
      let killAttempts = 5;
      while (killAttempts > 0) {
        try {
          process.kill(serverProcess.pid, 0); // Check if process still exists
          killAttempts--;
          console.log(`⚠ Process ${serverProcess.pid} still alive, attempt ${6 - killAttempts}/5`);

          if (killAttempts > 0) {
            // Try killing again
            process.kill(serverProcess.pid, 'SIGKILL');
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        } catch (e) {
          workerLog(workerIndex, testTitle, `✓ Successfully killed process ${serverProcess.pid}`);
          processKilled = true;
          break;
        }
      }

      if (!processKilled) {
        workerLog(workerIndex, testTitle, `❌ Failed to kill process ${serverProcess.pid} after ${5} attempts`);
        // Try using system kill command as last resort
        try {
          const { execSync } = require('child_process');
          execSync(`kill -9 ${serverProcess.pid}`, { stdio: 'ignore' });
          await new Promise(resolve => setTimeout(resolve, 100));

          // Final verification
          try {
            process.kill(serverProcess.pid, 0);
            workerLog(workerIndex, testTitle, `❌ System kill also failed for process ${serverProcess.pid}`);
          } catch (e) {
            workerLog(workerIndex, testTitle, `✓ System kill succeeded for process ${serverProcess.pid}`);
            processKilled = true;
          }
        } catch (e) {
          workerLog(workerIndex, testTitle, `❌ System kill command failed: ${e.message}`);
        }
      }
    } catch (error) {
      workerLog(workerIndex, testTitle, `❌ Error killing test server ${serverProcess.pid}: ${error.message}`);
    }
  } else {
    processKilled = true; // No process to kill
  }

  // Remove database file with retry logic
  let dbRemoved = false;
  let retries = 3;
  while (retries > 0) {
    try {
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
        workerLog(workerIndex, testTitle, `✓ Removed database: ${dbPath}`);
        dbRemoved = true;
        break;
      } else {
        dbRemoved = true; // File doesn't exist, consider it removed
        break;
      }
    } catch (error) {
      retries--;
      if (retries === 0) {
        workerLog(workerIndex, testTitle, `❌ Error cleaning up test database after retries: ${error.message}`);
      } else {
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
  }

  return { processKilled, dbRemoved };
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

    // Get process info while the process is fresh and store it
    let processInfo = { name: 'unknown', command: 'unknown' };
    try {
      if (server.process && server.process.pid) {
        processInfo = getProcessInfo(server.process.pid);
      }
    } catch (e) {
      // Ignore process info errors
    }
    
    // Register server with tracker
    global.testResourceTracker.servers.set(port, {
      process: server.process,
      processInfo,
      dbPath,
      workerIndex,
      title: testTitle
    });

    // Log information about server start
    workerLog(workerIndex, testTitle, `🚀 Started test server on port ${port} with database ${dbPath}`);

    // Wait for server to be ready
    try {
      await waitForServer(`${server.url}/`);
      workerLog(workerIndex, testTitle, `✅ Server ready at ${server.url}`);
    } catch (error) {
      workerInfo(workerIndex, testTitle, `⚠ WARNING: Server startup timed out: ${error.message}`);
      // Continue anyway, the test might handle server state correctly
    }

    // Wait a bit longer in CI environments
    if (isCI) {
      workerLog(workerIndex, testTitle, `🕒 CI environment detected, adding extra startup delay...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Enhance the server object with extra info needed by tests
    const testServer = {
      ...server,
      dbPath,
      workerIndex,
      testTitle
    };

    // Let the test use this server
    await use(testServer);

    // After test completes, clean up test resources
    try {
      workerLog(workerIndex, testTitle, `🧹 Cleaning up test resources for ${testTitle} (W${workerIndex}:${port})`);
      
      // Remove server from tracker before cleanup (to avoid duplicate cleanup)
      global.testResourceTracker.servers.delete(port);
      global.testResourceTracker.databases.delete(dbPath);
      
      const { processKilled, dbRemoved } = await cleanupTest(
        dbPath, 
        server.process, 
        processInfo,
        workerIndex,
        testTitle
      );
      
      if (processKilled && dbRemoved) {
        workerLog(workerIndex, testTitle, `✅ Cleanup successful for ${testTitle}`);
      } else {
        workerLog(workerIndex, testTitle, 
          `⚠ Partial cleanup for ${testTitle}: Process killed: ${processKilled}, DB removed: ${dbRemoved}`
        );
      }
    } catch (error) {
      console.error(`Error cleaning up test resources: ${error.message}`);
    }
  },
});