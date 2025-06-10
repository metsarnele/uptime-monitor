#!/usr/bin/env node

import { execSync } from 'child_process';
import { platform } from 'os';

// Define the test server port range
const TEST_PORT_START = 3100;
const TEST_PORT_END = 3400;

/**
 * Get processes using ports in the test range
 */
function getProcessesUsingTestPorts() {
  try {
    const isWindows = platform() === 'win32';
    
    if (isWindows) {
      // Windows command to find processes using ports
      const output = execSync(`netstat -ano | findstr ":3[1-3][0-9][0-9]"`, { encoding: 'utf8' });
      return parseWindowsNetstat(output);
    } else {
      // Unix/Linux/macOS command to find processes using ports
      const output = execSync(`lsof -i :${TEST_PORT_START}-${TEST_PORT_END} -t`, { encoding: 'utf8' });
      return output.trim().split('\n').filter(pid => pid && pid.trim());
    }
  } catch (error) {
    // No processes found or command failed
    return [];
  }
}

/**
 * Parse Windows netstat output to extract PIDs
 */
function parseWindowsNetstat(output) {
  const lines = output.split('\n');
  const pids = new Set();
  
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 5) {
      const pid = parts[parts.length - 1];
      if (pid && !isNaN(pid)) {
        pids.add(pid);
      }
    }
  }
  
  return Array.from(pids);
}

/**
 * Kill processes by PID
 */
function killProcesses(pids) {
  const isWindows = platform() === 'win32';
  let killedCount = 0;
  
  for (const pid of pids) {
    try {
      if (isWindows) {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
      } else {
        execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
      }
      killedCount++;
      console.log(`✓ Killed process ${pid}`);
    } catch (error) {
      // Process might already be dead or not accessible
      console.log(`⚠ Could not kill process ${pid} (might already be dead)`);
    }
  }
  
  return killedCount;
}

/**
 * Kill bun processes that might be test servers
 */
function killBunTestProcesses() {
  try {
    const isWindows = platform() === 'win32';
    let killedCount = 0;
    
    if (isWindows) {
      // Windows: find bun processes and kill them
      try {
        const output = execSync('tasklist /FI "IMAGENAME eq bun.exe" /FO CSV', { encoding: 'utf8' });
        const lines = output.split('\n').slice(1); // Skip header
        
        for (const line of lines) {
          if (line.includes('bun.exe')) {
            const parts = line.split(',');
            if (parts.length >= 2) {
              const pid = parts[1].replace(/"/g, '');
              try {
                execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
                killedCount++;
                console.log(`✓ Killed bun process ${pid}`);
              } catch (e) {
                // Process might already be dead
              }
            }
          }
        }
      } catch (e) {
        // No bun processes found
      }
    } else {
      // Unix/Linux/macOS: kill bun processes running index.js
      try {
        execSync('pkill -f "bun.*index.js"', { stdio: 'ignore' });
        killedCount++;
        console.log('✓ Killed bun test server processes');
      } catch (e) {
        // No processes found
      }
    }
    
    return killedCount;
  } catch (error) {
    return 0;
  }
}

/**
 * Clean up test database files
 */
function cleanupTestDatabases() {
  try {
    const isWindows = platform() === 'win32';
    
    if (isWindows) {
      execSync('del /Q test-database-*.sqlite 2>nul', { stdio: 'ignore' });
      execSync('del /Q database.sqlite 2>nul', { stdio: 'ignore' });
    } else {
      execSync('rm -f test-database-*.sqlite database.sqlite', { stdio: 'ignore' });
    }
    
    console.log('✓ Cleaned up test database files');
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Main cleanup function
 */
function cleanup() {
  const phase = process.argv[2] || 'general';
  const phaseEmoji = {
    'before': '🧹',
    'after': '🧽',
    'interrupted': '🛑',
    'terminated': '🛑',
    'general': '🧹'
  };

  console.log(`${phaseEmoji[phase]} Cleaning up test servers (ports ${TEST_PORT_START}-${TEST_PORT_END})...`);

  // Kill processes using test ports
  const portPids = getProcessesUsingTestPorts();
  let totalKilled = 0;

  if (portPids.length > 0) {
    console.log(`Found ${portPids.length} processes using test ports`);
    totalKilled += killProcesses(portPids);
  }

  // Kill bun test processes
  totalKilled += killBunTestProcesses();

  // Clean up test databases
  cleanupTestDatabases();

  if (totalKilled > 0) {
    console.log(`✅ Cleanup complete: killed ${totalKilled} processes`);
    if (phase === 'before') {
      // Wait a bit for processes to fully terminate before starting tests
      setTimeout(() => {
        console.log('🚀 Ready to run tests');
      }, 500);
    }
  } else {
    console.log('✅ No test servers found running');
    if (phase === 'before') {
      console.log('🚀 Ready to run tests');
    }
  }
}

// Run cleanup
cleanup();
