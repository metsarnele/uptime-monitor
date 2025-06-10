#!/usr/bin/env node

/**
 * Cleanup script that uses the global resource tracker
 * This is more precise than the broad port-range cleanup
 */

import { execSync } from 'child_process';
import { platform } from 'os';
import fs from 'fs';

/**
 * Get the global resource tracker from any running test processes
 * Since we can't directly access the global from another process,
 * we'll fall back to the broad cleanup for now, but this script
 * can be called from within the test process context
 */
async function cleanupTrackedResources() {
  if (typeof global !== 'undefined' && global.testResourceTracker) {
    // We're running in the same process context as tests
    await global.testResourceTracker.cleanup();
    return true;
  }
  
  // Fallback to broad cleanup if we can't access the tracker
  console.log('⚠️  Global tracker not accessible, falling back to broad cleanup');
  return false;
}

/**
 * Get detailed process information
 */
function getProcessInfo(pid) {
  try {
    const isWindows = platform() === 'win32';

    if (isWindows) {
      // Windows: Get process name and command line
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
      // Unix/Linux/macOS: Get process name and command line
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

/**
 * Broad cleanup as fallback (original cleanup logic)
 */
function broadCleanup() {
  const TEST_PORT_START = 3100;
  const TEST_PORT_END = 3999; // Scalable to hundreds of workers

  console.log(`🧹 Running broad cleanup (ports ${TEST_PORT_START}-${TEST_PORT_END})...`);

  let cleanedCount = 0;

  try {
    const isWindows = platform() === 'win32';

    if (isWindows) {
      // Windows cleanup
      try {
        // Get processes using test ports
        const netstatOutput = execSync(`netstat -ano | findstr ":3[1-3][0-9][0-9]"`, { encoding: 'utf8' });
        const lines = netstatOutput.split('\n');
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

        for (const pid of pids) {
          const processInfo = getProcessInfo(pid);
          // Only kill processes that are clearly test-related (bun, node, or contain index.js)
          const isTestProcess = processInfo.name.includes('bun') ||
                               processInfo.name.includes('node') ||
                               processInfo.command.includes('index.js') ||
                               processInfo.command.includes('bun');

          if (isTestProcess) {
            try {
              execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
              cleanedCount++;
              console.log(`✓ Killed process ${pid} (${processInfo.name}): ${processInfo.command}`);
            } catch (e) {
              console.log(`⚠ Could not kill process ${pid} (${processInfo.name}): ${processInfo.command}`);
            }
          } else {
            console.log(`⚠ Skipped non-test process ${pid} (${processInfo.name}): ${processInfo.command}`);
          }
        }
      } catch (e) {
        // No processes found on those ports
      }

      // Also kill bun processes
      try {
        const output = execSync('tasklist /FI "IMAGENAME eq bun.exe" /FO CSV', { encoding: 'utf8' });
        const lines = output.split('\n').slice(1);

        for (const line of lines) {
          if (line.includes('bun.exe')) {
            const parts = line.split(',');
            if (parts.length >= 2) {
              const pid = parts[1].replace(/"/g, '');
              const processInfo = getProcessInfo(pid);
              // Only kill if it's running index.js
              if (processInfo.command.includes('index.js')) {
                try {
                  execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
                  cleanedCount++;
                  console.log(`✓ Killed bun process ${pid} (${processInfo.name}): ${processInfo.command}`);
                } catch (e) {
                  console.log(`⚠ Could not kill bun process ${pid} (${processInfo.name}): ${processInfo.command}`);
                }
              }
            }
          }
        }
      } catch (e) {
        // No bun processes found
      }
    } else {
      // Unix/Linux/macOS cleanup
      try {
        const output = execSync(`lsof -i :${TEST_PORT_START}-${TEST_PORT_END}`, { encoding: 'utf8' });
        const lines = output.split('\n').slice(1); // Skip header
        const pids = new Set();

        for (const line of lines) {
          if (line.trim()) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 2) {
              const pid = parts[1];
              if (pid && !isNaN(pid)) {
                pids.add(pid);
              }
            }
          }
        }

        for (const pid of pids) {
          const processInfo = getProcessInfo(pid);
          // Only kill processes that are clearly test-related (bun, node, or contain index.js)
          const isTestProcess = processInfo.name.includes('bun') ||
                               processInfo.name.includes('node') ||
                               processInfo.command.includes('index.js') ||
                               processInfo.command.includes('bun');

          if (isTestProcess) {
            try {
              execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
              cleanedCount++;
              console.log(`✓ Killed process ${pid} (${processInfo.name}): ${processInfo.command}`);
            } catch (e) {
              console.log(`⚠ Could not kill process ${pid} (${processInfo.name}): ${processInfo.command}`);
            }
          } else {
            console.log(`⚠ Skipped non-test process ${pid} (${processInfo.name}): ${processInfo.command}`);
          }
        }
      } catch (e) {
        // No processes found on those ports
      }

      // Also kill bun processes running index.js
      try {
        const output = execSync('pgrep -f "bun.*index.js"', { encoding: 'utf8' });
        const pids = output.trim().split('\n').filter(pid => pid && pid.trim());

        for (const pid of pids) {
          const processInfo = getProcessInfo(pid);
          try {
            execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
            cleanedCount++;
            console.log(`✓ Killed bun process ${pid} (${processInfo.name}): ${processInfo.command}`);
          } catch (e) {
            console.log(`⚠ Could not kill bun process ${pid} (${processInfo.name}): ${processInfo.command}`);
          }
        }
      } catch (e) {
        // No bun processes found
      }
    }
    
    // Clean up database files
    try {
      if (isWindows) {
        execSync('del /Q test-database-*.sqlite 2>nul', { stdio: 'ignore' });
        execSync('del /Q database.sqlite 2>nul', { stdio: 'ignore' });
      } else {
        execSync('rm -f test-database-*.sqlite database.sqlite', { stdio: 'ignore' });
      }
      console.log('✓ Cleaned up test database files');
      cleanedCount++;
    } catch (e) {
      // Files might not exist
    }
    
  } catch (error) {
    console.error('Error during broad cleanup:', error.message);
  }
  
  if (cleanedCount > 0) {
    console.log(`✅ Broad cleanup complete: ${cleanedCount} test-related processes/files cleaned`);
  } else {
    console.log('✅ No test-related resources found to clean up');
  }
}

/**
 * Main cleanup function
 */
async function cleanup() {
  const phase = process.argv[2] || 'general';
  const phaseEmoji = {
    'before': '🧹',
    'after': '🧽', 
    'interrupted': '🛑',
    'terminated': '🛑',
    'general': '🧹'
  };
  
  console.log(`${phaseEmoji[phase]} Cleaning up test resources...`);
  
  // Try tracked cleanup first
  const trackedCleanupSuccess = await cleanupTrackedResources();
  
  // If tracked cleanup wasn't available, do broad cleanup
  if (!trackedCleanupSuccess) {
    broadCleanup();
  }
  
  console.log('🎯 Cleanup complete!');
}

// Export for use in other scripts
export { cleanupTrackedResources, broadCleanup };

// Run cleanup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  cleanup();
}
