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

test.describe('Monitor Management', () => {
  // Test data for a pre-registered user
  const testEmail = 'monitor-test@example.com';
  const testPassword = 'securepassword123';
  /** @type {string} */
  let dbPath;
  /** @type {TestServer} */
  let server;
  /** @type {string} */
  let baseURL;
  /** @type {number|undefined} */
  let userId;

  // Setup: Create a test database and start a server before each test
  test.beforeEach(async ({ page, context }) => {
    // Create unique test database and server for this test
    dbPath = getTestDbPath();
    const db = await initTestDatabase(dbPath);
    const port = getTestPort();

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

    // Start server for this test
    server = await startTestServer(dbPath, port);
    baseURL = server.url;

    // Wait for server to be ready
    await waitForServer(baseURL);

    // Navigate to the home page and sign in
    await page.goto(`${baseURL}/signin`);
    await page.getByLabel('Email Address').fill(testEmail);
    await page.getByLabel('Password').fill(testPassword);
    await page.getByRole('button', { name: /sign in/i }).click();

    // Verify we're on the dashboard page
    await expect(page).toHaveURL(/.*\/dashboard/);
    
    // Wait for the dashboard to fully load
    await page.waitForSelector('h1:has-text("Dashboard")');
    await page.waitForSelector('#add-monitor-form');
  });

  // Clean up after each test
  test.afterEach(async () => {
    try {
      await cleanupTest(dbPath, server.process);
    } catch (error) {
      console.error('Error during test cleanup:', error);
    }
  });

  test('should allow adding a valid URL monitor', async ({ page }) => {
    // Verify we're on the dashboard
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
    
    // Wait for the form to be fully loaded
    await page.waitForTimeout(500);
    
    // Check if the add monitor form exists
    const addMonitorForm = page.locator('#add-monitor-form');
    await expect(addMonitorForm).toBeVisible();
    
    // Find the URL input field and submit button
    const urlInput = page.locator('#monitor-url');
    const addButton = page.locator('#add-monitor-btn');
    
    await expect(urlInput).toBeVisible();
    await expect(addButton).toBeVisible();

    // Add a new monitor
    const testUrl = 'https://example.com';
    await urlInput.fill(testUrl);
    
    // Submit the form
    await addButton.click();
    
    // Wait for the AJAX request to complete and notification to appear
    await page.waitForTimeout(1000);
    
    // Wait for the page to reload and stabilize
    await page.reload({ waitUntil: 'networkidle' });
    
    // Verify we're still on the dashboard (but page has reloaded)
    await expect(page).toHaveURL(/.*\/dashboard/);
    
    // Wait for the sites list to be visible
    await page.waitForSelector('#sites-list');
    
    // Check if the newly added monitor is in the list
    const monitorText = await page.textContent('#sites-list');
    expect(monitorText).toContain(testUrl);
  });

  test('should display dashboard with monitor after adding', async ({ page }) => {
    // Add a monitor first
    const testUrl = 'https://example.com';
    
    // Wait for the form to be fully loaded
    await page.waitForTimeout(500);
    
    // Find the URL input field and submit button
    const urlInput = page.locator('#monitor-url');
    const addButton = page.locator('#add-monitor-btn');

    await urlInput.fill(testUrl);
    
    // Submit the form
    await addButton.click();
    
    // Wait for the AJAX request to complete and notification to appear
    await page.waitForTimeout(1000);
    
    // Wait for the page to reload and stabilize
    await page.reload({ waitUntil: 'networkidle' });
    
    // Verify we're still on the dashboard
    await expect(page).toHaveURL(/.*\/dashboard/);
    
    // Wait for the sites list to be visible
    await page.waitForSelector('#sites-list');

    // Check if the monitor URL is visible in the list
    const monitorText = await page.textContent('#sites-list');
    expect(monitorText).toContain(testUrl);

    // Navigate away and back to dashboard to ensure persistence
    await page.goto(`${baseURL}/`);
    await page.getByRole('link', { name: /dashboard/i }).click();
    
    // Verify we're back on the dashboard
    await expect(page).toHaveURL(/.*\/dashboard/);
    
    // Verify the monitor is still in the list
    const monitorsList = page.locator('#sites-list');
    await expect(monitorsList.getByText(testUrl)).toBeVisible();
  });

  test('should validate URL format', async ({ page }) => {
    // Try to add an invalid URL
    const invalidUrl = 'not-a-valid-url';
    
    // Wait for the form to be fully loaded
    await page.waitForTimeout(500);
    
    // Find the URL input field and submit button
    const urlInput = page.locator('#monitor-url');
    const addButton = page.locator('#add-monitor-btn');

    await urlInput.fill(invalidUrl);
    
    // Click the button (no navigation expected for invalid URL)
    await addButton.click();
    
    // Wait a moment for any error messages to appear
    await page.waitForTimeout(500);
    
    // Check for error message in the page content
    const pageContent = await page.content();
    expect(pageContent.toLowerCase()).toContain('please enter a valid url');

    // Verify we're still on the dashboard
    await expect(page).toHaveURL(/.*\/dashboard/);

    // Verify the invalid URL is not added to the list
    const monitorsList = page.getByRole('list', { name: /monitors/i });
    await expect(monitorsList.getByText(invalidUrl)).not.toBeVisible();
  });

  test('should not allow adding duplicate URLs for the same user', async ({ page }) => {
    // Add a monitor first
    const testUrl = 'https://example.com';
    
    // Wait for the form to be fully loaded
    await page.waitForTimeout(500);
    
    // Find the URL input field and submit button
    const urlInput = page.locator('#monitor-url');
    const addButton = page.locator('#add-monitor-btn');

    await urlInput.fill(testUrl);
    
    // Submit the form
    await addButton.click();
    
    // Wait for the AJAX request to complete and notification to appear
    await page.waitForTimeout(1000);
    
    // Wait for the page to reload and stabilize
    await page.reload({ waitUntil: 'networkidle' });
    
    // Verify we're still on the dashboard
    await expect(page).toHaveURL(/.*\/dashboard/);
    
    // Wait for the sites list to be visible
    await page.waitForSelector('#sites-list');
    
    // Verify the monitor is in the list
    const monitorText = await page.textContent('#sites-list');
    expect(monitorText).toContain(testUrl);
    
    // Try to add the same URL again
    await urlInput.fill(testUrl);
    
    // Click the button (no navigation expected for duplicate URL)
    await addButton.click();
    
    // Wait a moment for any error messages to appear
    await page.waitForTimeout(500);
    
    // Check for error message in the page content
    const pageContent = await page.content();
    expect(pageContent.toLowerCase()).toContain('you are already monitoring this url');

    // Verify we're still on the dashboard
    await expect(page).toHaveURL(/.*\/dashboard/);

    // Verify the URL appears only once in the list
    const monitorsList = page.locator('#sites-list');
    const monitorItems = await page.getByText(testUrl).all();
    expect(monitorItems.length).toBe(1);
  });
});
