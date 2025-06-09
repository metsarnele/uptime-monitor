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

### Installation

1. Install dependencies
   ```bash
   bun install
   ```

2. Start the development server
   ```bash
   bun run dev
   ```

3. Open your browser and navigate to `http://localhost:3000`

## Running Tests

```bash
# Run unit tests
bun test

# Run end-to-end tests
bun run test:e2e
```

## User Stories


Story 1: [ ] User Sign Up
As a user, I want to sign up so that I can save my monitors.
Acceptance Criteria:
* I can enter my email and password in a sign-up form
* After successful sign-up, I receive confirmation and can proceed to sign in
* My credentials are stored securely in the database

Story 2: [ ] User Sign In
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
