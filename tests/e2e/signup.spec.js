// @ts-check
import { test, expect } from '@playwright/test';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import bcryptjs from 'bcryptjs';

test.describe('User Sign Up', () => {
  test('should allow user to enter email and password in sign-up form', async ({ page }) => {
    // Go to the signup page
    await page.goto('/signup');

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
    await page.goto('/signup');

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
    await page.goto('/signup');
    
    // Fill out the sign-up form with unique email
    const testEmail = `test-secure-${Date.now()}@example.com`;
    const testPassword = 'securepassword123';

    await page.getByLabel('Email Address').fill(testEmail);
    await page.getByLabel('Password').fill(testPassword);

    // Submit the form
    await page.getByRole('button', { name: /sign up/i }).click();

    // Wait for the registration to be processed
    await page.waitForURL(/.*\/signin/);

    // Check if user exists in database and password is hashed
    const db = await open({
      filename: 'database.sqlite',
      driver: sqlite3.Database
    });

    const user = await db.get('SELECT * FROM users WHERE email = ?', [testEmail]);

    // Verify user exists in database
    expect(user).toBeTruthy();

    // Verify password is hashed (not stored as plaintext)
    expect(user.password).not.toBe(testPassword);

    // Verify the hashed password is valid
    const isPasswordValid = await bcryptjs.compare(testPassword, user.password);
    expect(isPasswordValid).toBe(true);

    await db.close();
  });
});
