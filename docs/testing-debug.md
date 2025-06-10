# Testing Debug Output Control

The test suite supports toggling debug output on and off for cleaner or more detailed test runs.

## Quick Commands

### Default (Quiet Mode)
```bash
bun run test
```
- Shows only test results and essential messages
- Clean, minimal output
- Recommended for CI/CD and regular development

### Debug Mode
```bash
bun run test:debug
```
- Shows detailed cleanup process with worker-specific logging
- Color-coded worker prefixes: `[W0:test name]` and `[W1:test name]`
- Process information and cleanup steps
- Useful for troubleshooting test issues

### Explicit Quiet Mode
```bash
bun run test:quiet
```
- Same as default, but explicitly sets quiet mode
- Useful when DEBUG_CLEANUP environment variable might be set

## Environment Variable

You can also control debug output directly with the environment variable:

```bash
# Enable debug output
DEBUG_CLEANUP=true bun run test

# Disable debug output
DEBUG_CLEANUP=false bun run test
```

## Output Examples

### Quiet Mode Output
```
🚀 Setting up global test environment...
✅ Global setup complete

Running 9 tests using 2 workers
  ✓  1 [chromium] › tests/e2e/home.spec.js:6:3 › Home Page › should show welcome message when not logged in (861ms)
  ✓  2 [chromium] › tests/e2e/signin.spec.js:29:3 › User Sign In › should allow user to enter email and password to access account (1.1s)
  ...

🧽 Running global teardown...
✅ All resources cleaned up successfully
✅ Global teardown complete

  9 passed (5.3s)
```

### Debug Mode Output
```
🚀 Setting up global test environment...
✅ Global setup complete

Running 9 tests using 2 workers
[W1:should allow user...] 📝 Captured process info for PID 50593: unknown - unknown
[W0:should show welco...] 📝 Captured process info for PID 50618: unknown - unknown
[W0:should show welco...] 🧹 Cleaning up server PID 50618 (unknown): unknown
[W0:should show welco...] ⚠ Force killing process 50618 and its group...
[W1:should allow user...] 🧹 Cleaning up server PID 50593 (unknown): unknown
[W1:should allow user...] ⚠ Force killing process 50593 and its group...
[W0:should show welco...] ✓ Successfully killed process 50618
[W0:should show welco...] ✓ Removed database: test-database-w0-50568-1749552974156-vefzeu-shouldshow.sqlite
  ✓  1 [chromium] › tests/e2e/home.spec.js:6:3 › Home Page › should show welcome message when not logged in (851ms)
  ...
```

## Worker Color Coding

In debug mode, each worker gets a unique color:
- **Worker 0**: Cyan
- **Worker 1**: Yellow  
- **Worker 2**: Magenta
- **Worker 3**: Green
- **Worker 4**: Blue
- **Worker 5**: Red

This makes it easy to follow parallel test execution and see which cleanup messages belong to which test.

## Performance Optimization

The test suite automatically scales to your system:
- **Adaptive workers**: Playwright automatically determines optimal worker count based on CPU cores
- **Scalable port allocation**: Supports hundreds of workers (ports 3100-3999)
- **Simple allocation**: Each worker gets one port (Worker 0 = 3100, Worker 1 = 3101, etc.)
- **Efficient resource usage**: No wasted ports or complex allocation logic
- **~4-5 second execution time** for the full test suite

## Scalability

The system is designed to scale automatically:
- **Automatic worker detection**: Playwright determines optimal worker count based on your CPU
- **Massive scalability**: Supports up to 900 concurrent workers (ports 3100-3999)
- **Zero configuration**: No manual tuning required for different systems
- **Resource isolation**: Each worker gets its own port and database
- **Cross-platform**: Works consistently on Windows, macOS, and Linux
