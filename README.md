# Uptime Monitor

## Description

Uptime Monitor is a web application that allows users to monitor the availability of their websites and APIs. The application periodically checks the status of registered URLs and provides real-time updates on their availability. Users can create an account, add multiple websites to monitor, and view detailed uptime statistics and history.

## Technologies

- **Runtime**: Bun
- **Frontend**: React
- **Database**: SQLite
- **Testing**: Playwright

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (v1.0.0 or higher)

### Running the Application

```bash
# Build the frontend
bun run build

# Start the server
bun run dev
```

The application will be available at http://localhost:3000.

## Testing

This project uses Playwright for end-to-end testing. Here's how to run the tests:

### Running Tests

```bash
# Run all tests
bun test

# Run E2E tests with Playwright
npx playwright test
```

### Working with Playwright Visual Logs

Playwright provides visual logs that help debug tests by showing exactly what happened during test execution.

#### Running Tests with Trace

```bash
# Run tests with trace recording enabled
npx playwright test --trace on
```

#### Viewing Traces

After running tests with trace enabled, you can view the traces in several ways:

1. **Show HTML Report**:
   ```bash
   npx playwright show-report
   ```

2. **View Specific Test Trace**:
   ```bash
   npx playwright show-trace test-results/[test-name]/trace.zip
   ```

3. **Use UI Mode** (interactive test explorer):
   ```bash
   npx playwright test --ui
   ```

The trace viewer shows:
- Screenshots of each step
- DOM snapshots
- Network requests
- Console logs
- Test actions

This makes it easier to debug issues and understand test behavior.

## User Stories

Story 1: [x] User Sign Up
As a user, I want to sign up so that I can save my monitors.
Acceptance Criteria:
* I can enter my email and password in a sign-up form
* After successful sign-up, I receive confirmation and can proceed to sign in page
* My credentials are stored securely in the database

Story 2: [x] User Sign In
As a user, I want to sign in so that I can access my account.
Acceptance Criteria:
* I can enter my email and password to access my account
* If the credentials are correct, I am redirected to my dashboard
* If the credentials are incorrect, I see an appropriate error message

Story 3: [ ] Add Monitor
As a user, I want to add a monitor so that I can track its availability.
Acceptance Criteria:
* I can enter a URL in a form to add a monitor
* After successful addition, I receive confirmation and can view my monitor in the dashboard

Story 4: [ ] Monitor Status
As a user, I want to see the status of my monitors so that I can know if they are up or down.
Acceptance Criteria:
* I can see the status of my monitors in the dashboard
* The status is updated in real-time
* I can see the last 24 hours of monitor history

