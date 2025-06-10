// Global setup for Playwright tests
import { broadCleanup } from '../scripts/cleanup-tracked-resources.js';

async function globalSetup() {
  console.log('🚀 Setting up global test environment...');
  
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

  // Initialize global resource tracker if not already present
  if (!global.testResourceTracker) {
    global.testResourceTracker = {
      servers: new Map(),
      databases: new Set(),
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
        const fs = await import('fs');
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
  }
  
  // Run initial cleanup to clear any leftover resources
  console.log('🧹 Running initial cleanup...');
  broadCleanup();
  
  // Set up cleanup handlers for process termination
  const cleanup = async () => {
    if (global.testResourceTracker) {
      await global.testResourceTracker.cleanup();
    }
  };
  
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('exit', cleanup);
  
  console.log('✅ Global setup complete');
}

export default globalSetup;
