// @ts-check
import { expect } from '@playwright/test';
import { test } from './testSetup';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import bcryptjs from 'bcryptjs';

test.describe('User Sign In', () => {
  // Test data for a pre-registered user
  const testEmail = 'signin-test@example.com';
  const testPassword = 'securepassword123';

  // Setup: Create a test user before each test
  test.beforeEach(async ({ testServer }) => {
    // Create a test user in the database
    const db = await open({
      filename: testServer.dbPath,
      driver: sqlite3.Database
    });

    const hashedPassword = await bcryptjs.hash(testPassword, 10);
    await db.run(
      'INSERT INTO users (email, password) VALUES (?, ?)',
      [testEmail, hashedPassword]
    );
    await db.close();
  });

  test('should allow user to enter email and password to access account', async ({ page, testServer }) => {
    // Navigate to the signin page with absolute URL
    await page.goto(`${testServer.url}/signin`);

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

  test('should redirect to dashboard with correct credentials', async ({ page, testServer }) => {
    // Navigate to the signin page with absolute URL
    await page.goto(`${testServer.url}/signin`);

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

  test('should show error message with incorrect credentials', async ({ page, testServer }) => {
    // Navigate to the signin page with absolute URL
    await page.goto(`${testServer.url}/signin`);

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

  test('should show different navigation links when signed in', async ({ page, testServer }) => {
    // Navigate to the signin page with absolute URL
    await page.goto(`${testServer.url}/signin`);

    // First verify that Sign Up and Sign In links are visible before login
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Sign Up' })).toBeVisible();
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Sign In' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign Out' })).not.toBeVisible();

    // Fill in correct credentials
    await page.getByLabel('Email Address').fill(testEmail);
    await page.getByLabel('Password').fill(testPassword);

    // Submit the form and wait for API response
    const [response] = await Promise.all([
      page.waitForResponse(response => response.url().includes('/api/signin')),
      page.getByRole('button', { name: /sign in/i }).click()
    ]);

    // Check if the response was successful
    expect(response.status()).toBe(200);

    // Wait for redirection to dashboard
    await expect(page).toHaveURL(/.*\/dashboard/);

    // Verify the navigation changes - Sign Up and Sign In should be gone, Sign Out should appear
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Sign Up' })).not.toBeVisible();
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Sign In' })).not.toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign Out' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();

    // Verify sign out works
    await Promise.all([
      page.waitForURL(`${testServer.url}/`),
      page.getByRole('link', { name: 'Sign Out' }).click()
    ]);

    // After sign out, should see sign up and sign in links again
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Sign Up' })).toBeVisible();
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Sign In' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign Out' })).not.toBeVisible();
  });
});
