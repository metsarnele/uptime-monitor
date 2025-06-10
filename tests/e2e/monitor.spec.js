// @ts-check
import { expect } from '@playwright/test';
import { test } from './testSetup';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import bcryptjs from 'bcryptjs';

test.describe('Monitor Management', () => {
  // Test data for a pre-registered user
  const testEmail = 'monitor-test@example.com';
  const testPassword = 'securepassword123';
  /** @type {number} */
  let userId;

  // Helper function to check for text in page with retries
  async function checkPageContentWithRetries(page, text, maxRetries = 3, retryInterval = 500) {
    let retries = 0;
    let found = false;
    
    while (retries < maxRetries && !found) {
      const pageContent = await page.content();
      found = pageContent.includes(text);
      
      if (!found) {
        await page.waitForTimeout(retryInterval);
        retries++;
      }
    }
    
    return found;
  }
  
  // Setup: Create a test user before each test
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

    // Verify we're on the dashboard page
    await expect(page).toHaveURL(/.*\/dashboard/);
    
    // Wait for the dashboard to fully load
    await page.waitForSelector('h1:has-text("Dashboard")');
    await page.waitForSelector('#add-monitor-form');
  });

  test('should validate URL format', async ({ page, testServer }) => {
    // Try to add an invalid URL
    const invalidUrl = 'not-a-valid-url';
    
    // Find the URL input field and submit button
    const urlInput = page.locator('#monitor-url');
    const addButton = page.locator('#add-monitor-btn');

    // Fill with invalid URL and attempt to submit
    await urlInput.fill(invalidUrl);
    
    // Try to submit - HTML5 validation will prevent actual submission
    await addButton.click();
    
    // HTML5 validation should prevent form submission 
    // Check if we're still on the dashboard with no new monitor added
    await expect(page).toHaveURL(/.*\/dashboard/);

    // Verify the invalid URL is not added to the list
    const monitorsList = page.locator('#sites-list');
    const monitorItems = await page.getByText(invalidUrl).all();
    expect(monitorItems.length).toBe(0);
  });

  
  test('should allow adding a valid URL monitor', async ({ page, testServer }) => {
    // Test adding a valid URL monitor
    const validUrl = 'https://example.com';
    const monitorName = 'Example Site';
    
    // Find the URL input field, name field, and submit button
    const urlInput = page.locator('#monitor-url');
    const nameInput = page.locator('#monitor-name');
    const addButton = page.locator('#add-monitor-btn');

    // Fill with valid URL and monitor name
    await urlInput.fill(validUrl);
    if (await nameInput.isVisible()) {
      await nameInput.fill(monitorName);
    }
    
    // Try to submit with waiting for response
    try {
      await Promise.all([
        page.waitForResponse(response => response.url().includes('/api/monitors'), { timeout: 5000 }),
        addButton.click()
      ]);
    } catch (error) {
      // If we can't catch the response, just click the button
      await addButton.click();
    }
    
    // Wait for the network to be idle and page to stabilize
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
      // If network doesn't become idle, continue anyway
      console.log('Network did not become idle, continuing test');
    });
    
    // Wait for the sites list to be visible
    await page.waitForSelector('#sites-list', { timeout: 5000 });
    
    // Check if the URL appears in the UI
    await expect(page.getByText(validUrl)).toBeVisible({ timeout: 5000 });
    
    // Check database
    const db = await open({
      filename: testServer.dbPath,
      driver: sqlite3.Database
    });
    
    // Check if monitor was added to database
    const monitor = await db.get('SELECT * FROM monitors WHERE url = ? AND user_id = ?', [validUrl, userId]);
    
    // Verify the monitor exists and has correct data
    expect(monitor).toBeTruthy();
    expect(monitor.url).toBe(validUrl);
    if (await nameInput.isVisible() && monitor.name) {
      expect(monitor.name).toBe(monitorName);
    }
    
    await db.close();
  });

  test('should display dashboard with monitor after adding', async ({ page, testServer }) => {
    // First add a valid monitor
    const validUrl = 'https://test-dashboard.com';
    const monitorName = 'Dashboard Test Site';
    
    // Find and fill the form
    const urlInput = page.locator('#monitor-url');
    const nameInput = page.locator('#monitor-name');
    const addButton = page.locator('#add-monitor-btn');
    
    await urlInput.fill(validUrl);
    if (await nameInput.isVisible()) {
      await nameInput.fill(monitorName);
    }
    
    // Submit the form and wait for response
    await Promise.all([
      page.waitForResponse(response => response.url().includes('/api/monitors')),
      addButton.click()
    ]).catch(async () => {
      // If waiting for response fails, still click the button
      await addButton.click();
    });
    
    // Make sure we're still on the dashboard
    await expect(page).toHaveURL(/.*\/dashboard/);
    
    // Verify the dashboard has loaded
    await page.waitForSelector('h1:has-text("Dashboard")');
    
    // Verify the sites-list element exists
    const monitorsList = page.locator('#sites-list');
    await expect(monitorsList).toBeVisible();
    
    // Check that the URL is displayed
    const monitorItem = page.getByText(validUrl);
    await expect(monitorItem).toBeVisible();
    
    // If there's a name field, check that too
    if (await nameInput.isVisible()) {
      const nameItem = page.getByText(monitorName);
      await expect(nameItem).toBeVisible();
    }
    
    // Verify the dashboard has proper navigation elements
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign Out' })).toBeVisible();
  });

  test('should not allow adding duplicate URLs for the same user', async ({ page, testServer }) => {
    // First add a valid monitor
    const validUrl = 'https://duplicate-test.com';
    
    // Find the form fields
    const urlInput = page.locator('#monitor-url');
    const addButton = page.locator('#add-monitor-btn');
    
    // Add the first monitor
    await urlInput.fill(validUrl);
    await Promise.all([
      page.waitForResponse(response => response.url().includes('/api/monitors'))
        .catch(() => {}), // Ignore timeout
      addButton.click()
    ]);
    
    // Now try to add the same URL again
    await urlInput.fill(validUrl);
    await addButton.click();
    
    // Check for error message
    const errorTexts = ['already exists', 'duplicate', 'already monitoring'];
    
    // Check page content for error messages
    const pageContent = await page.content();
    let errorFound = errorTexts.some(text => pageContent.includes(text));
    
    // Also check for error elements
    if (!errorFound) {
      const errorMessage = page.locator('.notification.error, .alert-danger, .error-message');
      errorFound = await errorMessage.isVisible().catch(() => false);
    }
    
    // Expect to find an error indication
    expect(errorFound).toBeTruthy();
    
    // Verify there's still only one instance of the monitor in the database
    const db = await open({
      filename: testServer.dbPath,
      driver: sqlite3.Database
    });
    
    const monitors = await db.all('SELECT * FROM monitors WHERE url = ? AND user_id = ?', [validUrl, userId]);
    expect(monitors.length).toBeLessThanOrEqual(1);
    
    await db.close();
  });
});
