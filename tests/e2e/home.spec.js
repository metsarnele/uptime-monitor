// @ts-check
import { expect } from '@playwright/test';
import { test } from './testSetup';

test.describe('Home Page', () => {
  test('should show welcome message when not logged in', async ({ page, testServer }) => {
    // Navigate to the home page
    await page.goto(`${testServer.url}/`);

    // Check if the welcome message is displayed
    const welcomeHeading = page.getByRole('heading', { name: 'Welcome to Uptime Monitor' });
    await expect(welcomeHeading).toBeVisible();

    // Check if the "sign in" and "create an account" links are visible for non-logged in users
    // Use more specific selectors to avoid ambiguity with navigation links
    const contentArea = page.locator('.card');
    const signInLink = contentArea.getByRole('link', { name: 'sign in' });
    const createAccountLink = contentArea.getByRole('link', { name: 'create an account' });

    await expect(signInLink).toBeVisible();
    await expect(createAccountLink).toBeVisible();

    // Verify that navigation bar shows Sign Up and Sign In links (not logged in state)
    const navBar = page.locator('nav');
    const navSignUp = navBar.getByRole('link', { name: 'Sign Up', exact: true });
    const navSignIn = navBar.getByRole('link', { name: 'Sign In', exact: true });

    await expect(navSignUp).toBeVisible();
    await expect(navSignIn).toBeVisible();

    // Verify Sign Out link is not visible when not logged in
    const navSignOut = page.getByRole('link', { name: 'Sign Out', exact: true });
    await expect(navSignOut).not.toBeVisible();
  });
});
