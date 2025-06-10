// @ts-check
import { test, expect } from '@playwright/test';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import bcryptjs from 'bcryptjs';
import { getTestDbPath, initTestDatabase, getTestPort, startTestServer, waitForServer, cleanupTest } from './testSetup';

/**
 * @typedef {Object} TestServer
 * @property {string} url - The server URL
 * @property {Object} process - The server process
 */

test.describe('User Sign In', () => {
  // Test data for a pre-registered user
  const testEmail = 'signin-test@example.com';
  const testPassword = 'securepassword123';
  /** @type {string} */
  let dbPath;
  /** @type {TestServer} */
  let server;
  /** @type {string} */
  let baseURL;

  // Setup: Create a test database and start a server before each test
  test.beforeEach(async ({ page, context }) => {
    // Create unique test database and server for this test
    dbPath = getTestDbPath();
    const db = await initTestDatabase(dbPath);
    const port = getTestPort();

    // Create a test user
    const hashedPassword = await bcryptjs.hash(testPassword, 10);
    await db.run(
      'INSERT INTO users (email, password) VALUES (?, ?)',
      [testEmail, hashedPassword]
    );
    await db.close();

    // Start server for this test
    server = await startTestServer(dbPath, port);
    baseURL = server.url;

    // Wait for server to be ready
    await waitForServer(baseURL);

    // Navigate to the home page
    await page.goto(baseURL);
  });

  // Clean up after each test
  test.afterEach(async () => {
    await cleanupTest(dbPath, server.process);
  });

  test('should allow user to enter email and password to access account', async ({ page }) => {
    // Navigate to the signin page with absolute URL
    await page.goto(`${baseURL}/signin`);

    // Verify sign-in form elements are present
    const emailInput = page.getByLabel('Email Address');
    const passwordInput = page.getByLabel('Password');
    const signInButton = page.getByRole('button', { name: /sign in/i });

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(signInButton).toBeVisible();

    // Check that the form accepts input
    await emailInput.fill(testEmail);
    await passwordInput.fill(testPassword);

    await expect(emailInput).toHaveValue(testEmail);
    await expect(passwordInput).toHaveValue(testPassword);
  });

  test('should redirect to dashboard with correct credentials', async ({ page }) => {
    // Navigate to the signin page with absolute URL
    await page.goto(`${baseURL}/signin`);

    // Fill in correct credentials
    await page.getByLabel('Email Address').fill(testEmail);
    await page.getByLabel('Password').fill(testPassword);

// Submit the form
await page.getByRole('button', { name: /sign in/i }).click();

// Verify redirection to dashboard
await expect(page).toHaveURL(/.*\/dashboard/);

    // Verify we're on the dashboard page by checking for dashboard-specific elements
    const welcomeMessage = page.getByText(/welcome/i);
    const dashboardTitle = page.getByRole('heading', { name: /dashboard/i });

    await expect(welcomeMessage).toBeVisible();
    await expect(dashboardTitle).toBeVisible();
  });

  test('should show error message with incorrect credentials', async ({ page }) => {
    // Navigate to the signin page with absolute URL
    await page.goto(`${baseURL}/signin`);

    // Test case 1: Incorrect password
    await page.getByLabel('Email Address').fill(testEmail);
    await page.getByLabel('Password').fill('wrongpassword');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Verify error message appears
    const errorMessage = page.getByText(/incorrect email or password/i);
    await expect(errorMessage).toBeVisible();

    // Verify we're still on the sign-in page
    await expect(page).toHaveURL(/.*\/signin/);

    // Test case 2: Non-existent user
    await page.getByLabel('Email Address').clear();
    await page.getByLabel('Password').clear();
    await page.getByLabel('Email Address').fill('nonexistent@example.com');
    await page.getByLabel('Password').fill('anypassword');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Verify error message appears
    await expect(errorMessage).toBeVisible();

    // Verify we're still on the sign-in page
    await expect(page).toHaveURL(/.*\/signin/);
  });

  test('should show different navigation links when signed in', async ({ page }) => {
    // Navigate to the signin page with absolute URL
    await page.goto(`${baseURL}/signin`);

    // First verify that Sign Up and Sign In links are visible before login
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Sign Up' })).toBeVisible();
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Sign In' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign Out' })).not.toBeVisible();

    // Fill in correct credentials
    await page.getByLabel('Email Address').fill(testEmail);
    await page.getByLabel('Password').fill(testPassword);

    // Submit the form
    await Promise.all([
      page.waitForURL(/.*\/dashboard/),
      page.getByRole('button', { name: /sign in/i }).click()
    ]);

    // Verify the navigation changes - Sign Up and Sign In should be gone, Sign Out should appear
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Sign Up' })).not.toBeVisible();
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Sign In' })).not.toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign Out' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();

    // Verify sign out works
    await Promise.all([
      page.waitForURL(`${baseURL}/`),
      page.getByRole('link', { name: 'Sign Out' }).click()
    ]);

    // After sign out, should see sign up and sign in links again
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Sign Up' })).toBeVisible();
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Sign In' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign Out' })).not.toBeVisible();
  });
});
