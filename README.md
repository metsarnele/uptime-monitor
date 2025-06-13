# Uptime Monitor

## Description

Uptime Monitor is a web application that allows users to monitor the availability of their websites and APIs. The application periodically checks the status of registered URLs and provides real-time updates on their availability. Users can create an account, add multiple websites to monitor, and view detailed uptime statistics and history.

## Technologies

- **Runtime**: Bun
- **Frontend**: Express-Handlebars
- **Backend**: Express.js
- **Database**: SQLite
- **Testing**: Playwright

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (v1.0.0 or higher)

### Environment Setup

Copy the `.env.example` file to `.env` and update the values as needed:

```bash
cp .env.example .env
```

**Required Environment Variables:**
- `JWT_SECRET` - **REQUIRED**: A secure secret key for JWT token signing. Generate a strong random string for production.
- `MAILGUN_API_KEY` - **REQUIRED**: Your Mailgun API key for sending email notifications when sites go down.
- `MAILGUN_DOMAIN` - **REQUIRED**: Your Mailgun domain for sending email notifications.
- `NODE_ENV` - **REQUIRED**: Environment mode (development/production/test).

**Optional Environment Variables:**
- `PORT` - Server port (defaults to 3000)

**Important**: The application will not start if any required environment variables are missing. You can generate a secure JWT secret with:
```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Using OpenSSL
openssl rand -hex 64
```

### Running the Application

```bash
# Install dependencies
bun install

# Start the development server
bun run dev

# OR for production
bun run start
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

Story 3: [x] Add Monitor
As a user, I want to add a monitor so that I can track its availability.
Acceptance Criteria:
* I can enter a URL in a form to add a monitor
* After successful addition, I receive confirmation and can view my monitor and its status in the dashboard
* The status is updated in real-time


Story 4: [x] Email Notifications
As a user, I want to receive email notifications when my monitored sites go down so that I can take immediate action.
Acceptance Criteria:
* I can enable email notifications for each of my monitors
* When a monitored site becomes unavailable, I receive an email notification
* The email contains information about which site is down and when it went down

