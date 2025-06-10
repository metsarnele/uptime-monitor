// @ts-check
import { expect } from '@playwright/test';
import { test } from './testSetup';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import bcryptjs from 'bcryptjs';

test.describe('Monitor Management', () => {
  const testEmail = 'monitor-test@example.com';
  const testPassword = 'securepassword123';
  /** @type {number} */
  let userId;

  test.beforeEach(async ({ page, testServer }) => {
    // Create a test user in the database
    const db = await open({
      filename: testServer.dbPath,
      driver: sqlite3.Database
    });

    // Create test user
    const hashedPassword = await bcryptjs.hash(testPassword, 10);
    const result = await db.run(
        'INSERT INTO users (email, password) VALUES (?, ?)',
        [testEmail, hashedPassword]
    );
    userId = result.lastID;

    // Create monitors table if it doesn't exist yet
    await db.exec(`
      CREATE TABLE IF NOT EXISTS monitors (
                                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                                            user_id INTEGER NOT NULL,
                                            url TEXT NOT NULL,
                                            name TEXT,
                                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                            FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    await db.close();

    // Navigate to the home page and sign in
    await page.goto(`${testServer.url}/signin`);
    await page.getByLabel('Email Address').fill(testEmail);
    await page.getByLabel('Password').fill(testPassword);
    await page.getByRole('button', { name: /sign in/i }).click();

    // Wait for dashboard to load properly
    await expect(page).toHaveURL(/.*\/dashboard/);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('should validate URL format', async ({ page, testServer }) => {
    const invalidUrl = 'not-a-valid-url';

    const urlInput = page.locator('#monitor-url');
    const addButton = page.locator('#add-monitor-btn');

    await urlInput.fill(invalidUrl);
    await addButton.click();

    // HTML5 validation should prevent form submission
    await expect(page).toHaveURL(/.*\/dashboard/);

    // Verify the invalid URL is not added to the list
    const invalidUrlText = page.getByText(invalidUrl);
    await expect(invalidUrlText).not.toBeVisible();
  });

  test('should allow adding a valid URL monitor', async ({ page, testServer }) => {
    const validUrl = 'https://example.com';

    const urlInput = page.locator('#monitor-url');
    const addButton = page.locator('#add-monitor-btn');

    await urlInput.fill(validUrl);

    // Submit form and wait for API response
    const responsePromise = page.waitForResponse(response =>
        response.url().includes('/api/monitors') && response.request().method() === 'POST'
    );

    await addButton.click();

    // Wait for the API response to complete
    const response = await responsePromise;
    expect(response.status()).toBe(200);

    // Verify the URL appears in the UI
    await expect(page.getByText(validUrl)).toBeVisible();

    // Verify in database
    const db = await open({
      filename: testServer.dbPath,
      driver: sqlite3.Database
    });

    const monitor = await db.get(
        'SELECT * FROM monitors WHERE url = ? AND user_id = ?',
        [validUrl, userId]
    );

    expect(monitor).toBeTruthy();
    expect(monitor.url).toBe(validUrl);

    await db.close();
  });

  test('should display dashboard with monitor after adding', async ({ page, testServer }) => {
    const validUrl = 'https://test-dashboard.com';

    const urlInput = page.locator('#monitor-url');
    const addButton = page.locator('#add-monitor-btn');

    await urlInput.fill(validUrl);

    // Submit and wait for response
    const responsePromise = page.waitForResponse(response =>
        response.url().includes('/api/monitors')
    );

    await addButton.click();
    await responsePromise;

    // Verify we're still on dashboard
    await expect(page).toHaveURL(/.*\/dashboard/);

    // Verify the monitor appears
    await expect(page.getByText(validUrl)).toBeVisible();

    // Verify dashboard navigation is present
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign Out' })).toBeVisible();
  });

  test('should not allow adding duplicate URLs for the same user', async ({ page, testServer }) => {
    const validUrl = 'https://duplicate-test.com';

    const urlInput = page.locator('#monitor-url');
    const addButton = page.locator('#add-monitor-btn');

    // Add the first monitor
    await urlInput.fill(validUrl);

    const firstResponsePromise = page.waitForResponse(response =>
        response.url().includes('/api/monitors')
    );

    await addButton.click();
    await firstResponsePromise;

    // Clear and try to add the same URL again
    await urlInput.clear();
    await urlInput.fill(validUrl);
    await addButton.click();

    // Check for error message (could be in notification or alert)
    const errorSelectors = [
      '.notification.error',
      '.alert-danger',
      '.error-message',
      '[data-testid="error-message"]'
    ];

    let errorFound = false;
    for (const selector of errorSelectors) {
      const errorElement = page.locator(selector);
      if (await errorElement.isVisible()) {
        errorFound = true;
        break;
      }
    }

    // Also check page content for error text
    if (!errorFound) {
      const pageContent = await page.content();
      const errorTexts = ['already exists', 'duplicate', 'already monitoring'];
      errorFound = errorTexts.some(text =>
          pageContent.toLowerCase().includes(text.toLowerCase())
      );
    }

    expect(errorFound).toBeTruthy();

    // Verify only one monitor exists in database
    const db = await open({
      filename: testServer.dbPath,
      driver: sqlite3.Database
    });

    const monitors = await db.all(
        'SELECT * FROM monitors WHERE url = ? AND user_id = ?',
        [validUrl, userId]
    );

    expect(monitors.length).toBe(1);
    await db.close();
  });
});