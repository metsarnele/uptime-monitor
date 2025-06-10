// @ts-check
import { expect } from '@playwright/test';
import { test } from './testSetup';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import bcryptjs from 'bcryptjs';
import fs from 'fs';

test.describe('User Sign Up', () => {
  test('should allow user to enter email and password in sign-up form', async ({ page, testServer }) => {
    // Go to the signup page with absolute URL
    await page.goto(`${testServer.url}/signup`);

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

  test('should show confirmation and redirect to sign in page after successful sign-up', async ({ page, testServer }) => {
    // Go to the signup page with absolute URL
    await page.goto(`${testServer.url}/signup`);

    // Fill out the sign-up form with unique email including worker info and process ID
    const uniqueId = `${Date.now()}-${performance.now()}-${Math.random().toString(36).substring(2, 8)}-w${testServer.workerIndex}-p${process.pid}`;
    const testEmail = `test-confirmation-${uniqueId}@example.com`;
    const testPassword = 'securepassword123';

    await page.getByLabel('Email Address').fill(testEmail);
    await page.getByLabel('Password').fill(testPassword);

    // Wait for the API request to complete and navigation to happen
    const [response] = await Promise.all([
      page.waitForResponse(response => response.url().includes('/api/signup')),
      page.getByRole('button', { name: /sign up/i }).click()
    ]);

    // Check if the response was successful
    expect(response.status()).toBe(200);

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

  test('should store credentials securely in the database', async ({ page, testServer }) => {
    // Go to the signup page with absolute URL
    await page.goto(`${testServer.url}/signup`);

    // Fill out the sign-up form with unique email including worker info and process ID
    const uniqueId = `${Date.now()}-${performance.now()}-${Math.random().toString(36).substring(2, 8)}-w${testServer.workerIndex}-p${process.pid}`;
    const testEmail = `test-secure-${uniqueId}@example.com`;
    const testPassword = 'securepassword123';

    await page.getByLabel('Email Address').fill(testEmail);
    await page.getByLabel('Password').fill(testPassword);

    // Wait for the API request to complete and navigation to happen
    const [response] = await Promise.all([
      page.waitForResponse(response => response.url().includes('/api/signup')),
      page.getByRole('button', { name: /sign up/i }).click()
    ]);

    // Check if the response was successful
    expect(response.status()).toBe(200);

    // Wait for the registration to be processed
    await page.waitForURL(/.*\/signin/);

    // Lisame viivituse, et anda andmebaasile aega kirjutada
    await page.waitForTimeout(500);

    // Check if user exists in database and password is hashed
    const db = await open({
      filename: testServer.dbPath,
      driver: sqlite3.Database
    });

    // Veendume, et andmebaasi fail on olemas
    console.log(`Checking database at: ${testServer.dbPath}`);
    console.log(`Database exists: ${fs.existsSync(testServer.dbPath)}`);

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

  test('should not allow registration with an existing email', async ({ page, testServer }) => {
    // First, create a user with a specific email including worker info and process ID
    const uniqueId = `${Date.now()}-${performance.now()}-${Math.random().toString(36).substring(2, 8)}-w${testServer.workerIndex}-p${process.pid}`;
    const testEmail = `duplicate-test-${uniqueId}@example.com`;
    const testPassword = 'securepassword123';

    // Go to the signup page
    await page.goto(`${testServer.url}/signup`);

    // Fill and submit the form for the first time
    await page.getByLabel('Email Address').fill(testEmail);
    await page.getByLabel('Password').fill(testPassword);

    // Wait for the API request to complete and navigation to happen
    const [response] = await Promise.all([
      page.waitForResponse(response => response.url().includes('/api/signup')),
      page.getByRole('button', { name: /sign up/i }).click()
    ]);

    // Check if the response was successful
    expect(response.status()).toBe(200);

    // Wait for successful registration and redirection
    await expect(page).toHaveURL(/.*\/signin/);

    // Now try to register again with the same email
    await page.goto(`${testServer.url}/signup`);
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
