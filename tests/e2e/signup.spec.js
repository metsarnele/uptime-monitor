// @ts-check
import { test, expect } from '@playwright/test';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import bcryptjs from 'bcryptjs';
import { getTestDbPath, initTestDatabase, getTestPort, startTestServer, waitForServer, cleanupTest } from './testSetup';
import fs from 'fs';

/**
 * @typedef {Object} TestServer
 * @property {string} url - The server URL
 * @property {Object} process - The server process
 */

test.describe('User Sign Up', () => {
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
    await initTestDatabase(dbPath);
    const port = getTestPort();

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

  test('should allow user to enter email and password in sign-up form', async ({ page }) => {
    // Go to the signup page with absolute URL
    await page.goto(`${baseURL}/signup`);

    // Verify sign-up form is present with required fields
    const emailInput = page.getByLabel('Email Address');
    const passwordInput = page.getByLabel('Password');
    const submitButton = page.getByRole('button', { name: /sign up/i });

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitButton).toBeVisible();
    
    // Verify form inputs accept values
    await emailInput.fill('test@example.com');
    await passwordInput.fill('password123');

    // Check values are entered correctly
    await expect(emailInput).toHaveValue('test@example.com');
    await expect(passwordInput).toHaveValue('password123');
  });

  test('should show confirmation and redirect to sign in page after successful sign-up', async ({ page }) => {
    // Go to the signup page with absolute URL
    await page.goto(`${baseURL}/signup`);

    // Fill out the sign-up form
    const testEmail = `test-${Date.now()}@example.com`;
    const testPassword = 'securepassword123';

    await page.getByLabel('Email Address').fill(testEmail);
    await page.getByLabel('Password').fill(testPassword);

    // Submit the form
    await page.getByRole('button', { name: /sign up/i }).click();

    // Expect to be redirected to sign-in page with a confirmation message
    await expect(page).toHaveURL(/.*\/signin/);
    const confirmationMessage = page.getByText(/account created successfully/i);
    await expect(confirmationMessage).toBeVisible();

    // Verify the sign-in form is present, but DO NOT attempt to sign in
    const signInEmailInput = page.getByLabel('Email Address');
    const signInPasswordInput = page.getByLabel('Password');
    const signInButton = page.getByRole('button', { name: /sign in/i });

    await expect(signInEmailInput).toBeVisible();
    await expect(signInPasswordInput).toBeVisible();
    await expect(signInButton).toBeVisible();
  });
  
  test('should store credentials securely in the database', async ({ page }) => {
    // Go to the signup page with absolute URL
    await page.goto(`${baseURL}/signup`);

    // Fill out the sign-up form with unique email
    const testEmail = `test-secure-${Date.now()}@example.com`;
    const testPassword = 'securepassword123';

    await page.getByLabel('Email Address').fill(testEmail);
    await page.getByLabel('Password').fill(testPassword);

    // Submit the form
    await page.getByRole('button', { name: /sign up/i }).click();

    // Wait for the registration to be processed
    await page.waitForURL(/.*\/signin/);

    // Lisame viivituse, et anda andmebaasile aega kirjutada
    await page.waitForTimeout(500);

    // Check if user exists in database and password is hashed
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    // Veendume, et andmebaasi fail on olemas
    console.log(`Checking database at: ${dbPath}`);
    console.log(`Database exists: ${fs.existsSync(dbPath)}`);

    const user = await db.get('SELECT * FROM users WHERE email = ?', [testEmail]);

    // Kui kasutajat ei leitud, logime kõik kasutajad silumiseks
    if (!user) {
      const allUsers = await db.all('SELECT email FROM users');
      console.log('All users in database:', allUsers);
    }

    // Verify user exists in database
    expect(user).toBeTruthy();

    // Verify password is hashed (not stored as plaintext)
    expect(user.password).not.toBe(testPassword);

    // Verify the hashed password is valid
    const isPasswordValid = await bcryptjs.compare(testPassword, user.password);
    expect(isPasswordValid).toBe(true);

    await db.close();
  });

  test('should not allow registration with an existing email', async ({ page }) => {
    // First, create a user with a specific email
    const testEmail = `duplicate-test-${Date.now()}@example.com`;
    const testPassword = 'securepassword123';

    // Go to the signup page
    await page.goto(`${baseURL}/signup`);

    // Fill and submit the form for the first time
    await page.getByLabel('Email Address').fill(testEmail);
    await page.getByLabel('Password').fill(testPassword);
    await page.getByRole('button', { name: /sign up/i }).click();

    // Wait for successful registration and redirection
    await expect(page).toHaveURL(/.*\/signin/);

    // Now try to register again with the same email
    await page.goto(`${baseURL}/signup`);
    await page.getByLabel('Email Address').fill(testEmail);
    await page.getByLabel('Password').fill('differentpassword123');
    await page.getByRole('button', { name: /sign up/i }).click();

    // Verify we're still on the signup page (didn't redirect to signin)
    await expect(page).toHaveURL(/.*\/signup/);

    // Verify that an error message about duplicate email is shown
    const errorMessage = page.getByText(/email already exists/i);
    await expect(errorMessage).toBeVisible();
  });
});
