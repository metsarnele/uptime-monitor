// Common test setup file
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

// Base port for test servers
const BASE_PORT = 3100;
let lastAssignedPort = 0;

// Generate unique test database name for each test run
export const getTestDbPath = () => {
  // Create a database file name with a timestamp and random string for uniqueness
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `test-database-${timestamp}-${randomStr}.sqlite`;
};

// Get a unique port for test server
export const getTestPort = () => {
  lastAssignedPort++;
  return BASE_PORT + lastAssignedPort;
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
      PORT: port.toString()
    },
    stdio: 'pipe'
  });

  // Return the server process and port
  return {
    process: serverProcess,
    port,
    url: `http://localhost:${port}`
  };
}

// Wait for server to be ready
export function waitForServer(url, maxRetries = 50, interval = 100) {
  return new Promise((resolve, reject) => {
    let retries = 0;

    const checkServer = async () => {
      try {
        const response = await fetch(url);
        if (response.status === 200) {
          resolve();
          return;
        }
      } catch (e) {
        // Server not ready yet
      }

      retries++;
      if (retries >= maxRetries) {
        reject(new Error(`Server at ${url} not ready after ${maxRetries} retries`));
        return;
      }

      setTimeout(checkServer, interval);
    };

    checkServer();
  });
}

// Clean up test database and server
export async function cleanupTest(dbPath, serverProcess) {
  // Kill server process if it exists
  if (serverProcess && serverProcess.kill) {
    try {
      serverProcess.kill();
    } catch (error) {
      console.error(`Error killing test server: ${error.message}`);
    }
  }

  // Remove database file
  try {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  } catch (error) {
    console.error(`Error cleaning up test database: ${error.message}`);
  }
}
