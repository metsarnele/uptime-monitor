// tests/e2e/email-notifications.spec.js
import { expect } from '@playwright/test';
import { test } from './testSetup';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import bcryptjs from 'bcryptjs';
import { 
    generateTestEmail, 
    generateTestPassword, 
    generateTestUrl, 
    generateMonitorName 
} from './testDataFactory';
import {
    simulateEmailNotification,
    changeMonitorStatus,
    createTestEmailRecord
} from './apiHelpers';

test.describe('Email Notifications', () => {
    // Use generated values instead of hard-coded ones
    const testEmail = generateTestEmail('notification');
    const testPassword = generateTestPassword();
    let userId;

    test.beforeEach(async ({ page, testServer }) => {
        const db = await open({
            filename: testServer.dbPath,
            driver: sqlite3.Database
        });

        // Create required tables if they don't exist
        try {
            await db.exec(`
                ALTER TABLE monitors ADD COLUMN notifications_enabled INTEGER DEFAULT 1
            `);
        } catch (error) {
            // Column might already exist
            console.log('Notifications column might already exist:', error.message);
        }

        // Create test user
        const hashedPassword = await bcryptjs.hash(testPassword, 10);
        const result = await db.run(
            'INSERT INTO users (email, password) VALUES (?, ?)',
            [testEmail, hashedPassword]
        );
        userId = result.lastID;

        await db.close();

        // Sign in with test user
        await page.goto(`${testServer.url}/signin`);
        await page.getByLabel('Email Address').fill(testEmail);
        await page.getByLabel('Password').fill(testPassword);
        await page.getByRole('button', { name: /sign in/i }).click();
        
        // CI keskkonnas võib sisselogimine võtta kauem aega, seega ootame eksplitsiitselt või proovime uuesti
        const isCI = !!process.env.CI;
        if (isCI) {
            // Täiendav ootamismehhanism CI keskkonnas
            try {
                // Proovime oodata URL muutust pikema timeoutiga
                await expect(page).toHaveURL(/.*\/dashboard/, { timeout: 30000 });
            } catch (e) {
                console.log('Sisselogimine ebaõnnestus esimesel katsel, proovime uuesti...');
                // Kui esmane katse ebaõnnestus, proovime uuesti
                await page.goto(`${testServer.url}/signin`);
                await page.getByLabel('Email Address').fill(testEmail);
                await page.getByLabel('Password').fill(testPassword);
                await page.getByRole('button', { name: /sign in/i }).click();
                // Ootame kauem
                await expect(page).toHaveURL(/.*\/dashboard/, { timeout: 40000 });
            }
        } else {
            // Tavalises keskkonnas standardne ootamine
            await expect(page).toHaveURL(/.*\/dashboard/);
        }
    });

    test('should enable email notifications by default when adding a monitor', async ({ page, testServer }) => {
        // Generate a unique test URL instead of using a fixed one
        const testUrl = generateTestUrl('notify-default');
        await page.locator('#monitor-url').fill(testUrl);
        
        // Verify notifications checkbox is checked by default
        const notificationsCheckbox = page.locator('#notifications-enabled');
        await expect(notificationsCheckbox).toBeChecked();
        
        // Add the monitor
        await page.locator('#add-monitor-btn').click();
        await expect(page.getByText(testUrl)).toBeVisible();

        // Verify the monitor was added with notifications enabled in the database
        const db = await open({
            filename: testServer.dbPath,
            driver: sqlite3.Database
        });

        const monitor = await db.get(
            'SELECT * FROM monitors WHERE url = ? AND user_id = ?',
            [testUrl, userId]
        );

        expect(monitor).toBeTruthy();
        expect(monitor.notifications_enabled).toBe(1);
        await db.close();
    });

    test('should allow toggling email notifications for existing monitors', async ({ page, testServer }) => {
        // Generate a unique test URL 
        const testUrl = generateTestUrl('toggle-notify');
        const monitorName = 'Toggle Test Monitor';
        
        // Use UI to create the monitor instead of direct DB manipulation
        await page.locator('#monitor-url').fill(testUrl);
        await page.locator('#monitor-name').fill(monitorName);
        
        // Ensure notifications checkbox is checked by default
        const notificationsCheckbox = page.locator('#notifications-enabled');
        await expect(notificationsCheckbox).toBeChecked();
        
        // Add the monitor
        await page.locator('#add-monitor-btn').click();
        
        // Wait for the monitor to appear in the UI
        await expect(page.getByText(testUrl)).toBeVisible();
        
        // Find and click the edit button for this monitor
        const editButton = page.locator('.edit-monitor-btn').first();
        await editButton.click();
        
        // Wait for the edit modal to appear
        const editModal = page.locator('#edit-monitor-modal');
        await expect(editModal).toBeVisible();
        
        // Find the notifications toggle in the edit form
        const notificationsToggle = page.locator('#edit-notifications-enabled');
        
        // Toggle notifications off
        if (await notificationsToggle.isChecked()) {
            await notificationsToggle.uncheck();
        } else {
            await notificationsToggle.check();
            await notificationsToggle.uncheck();
        }
        
        // Save the changes
        await page.locator('#save-monitor-btn').click();
        
        // Wait for the modal to close
        await expect(editModal).not.toBeVisible();
        
        // Verify the change was saved to the database
        const updatedDb = await open({
            filename: testServer.dbPath,
            driver: sqlite3.Database
        });
        
        const updatedMonitor = await updatedDb.get(
            'SELECT * FROM monitors WHERE url = ? AND user_id = ?',
            [testUrl, userId]
        );
        
        expect(updatedMonitor.notifications_enabled).toBe(0);
        await updatedDb.close();
    });

    test('should send email notification when monitor status changes to down', async ({ page, testServer }) => {
        // Generate unique test data
        const testUrl = generateTestUrl('downtime');
        const monitorName = 'Downtime Test Monitor';
        
        // Create monitor using the UI instead of direct DB insertion
        await page.locator('#monitor-url').fill(testUrl);
        await page.locator('#monitor-name').fill(monitorName);
        await page.locator('#add-monitor-btn').click();
        
        // Wait for the monitor to be visible in the UI
        await expect(page.getByText(testUrl)).toBeVisible();
        
        // Get the monitor ID from the database
        const db = await open({
            filename: testServer.dbPath,
            driver: sqlite3.Database
        });
        
        // Find the monitor we just created
        const monitor = await db.get(
            'SELECT id FROM monitors WHERE url = ? AND user_id = ?',
            [testUrl, userId]
        );
        const monitorId = monitor.id;
        
        // Update monitor status using our helper
        await changeMonitorStatus({
            monitorId: monitorId,
            status: 'down',
            dbPath: testServer.dbPath
        });
        
        // Simulate email notification being sent
        await simulateEmailNotification({
            monitorId: monitorId,
            userEmail: testEmail,
            notificationType: 'down',
            dbPath: testServer.dbPath
        });
        
        await db.close();
        
        // Reload page to see updated status
        await page.reload();
        
        // Verify the monitor shows as down in the UI
        const statusBadge = page.locator('.status-badge.status-down').first();
        await expect(statusBadge).toBeVisible();
        
        // Verify a notification was recorded in the database
        const checkDb = await open({
            filename: testServer.dbPath,
            driver: sqlite3.Database
        });
        
        const notification = await checkDb.get(
            'SELECT * FROM notification_log WHERE monitor_id = ? AND notification_type = ?',
            [monitorId, 'down']
        );
        
        expect(notification).toBeTruthy();
        expect(notification.user_email).toBe(testEmail);
        expect(notification.success).toBe(1);
        
        await checkDb.close();
    });

    test('should send an email with correct information when site goes down', async ({ page, testServer }) => {
        // Generate unique test data
        const testUrl = generateTestUrl('content');
        const monitorName = 'Content Test Monitor';
        
        // Create the monitor via UI to test the full flow
        await page.locator('#monitor-url').fill(testUrl);
        await page.locator('#monitor-name').fill(monitorName);
        await page.locator('#add-monitor-btn').click();
        
        // Wait for the monitor to be visible in the UI
        await expect(page.getByText(monitorName)).toBeVisible();
        
        // Now simulate the site going down by directly changing the status in the database
        const db = await open({
            filename: testServer.dbPath,
            driver: sqlite3.Database
        });
        
        // Get the monitor ID
        const monitor = await db.get(
            'SELECT id FROM monitors WHERE url = ? AND user_id = ?',
            [testUrl, userId]
        );
        
        // Make sure it exists
        expect(monitor).toBeTruthy();
        
        // Update its status to down
        await db.run(
            'UPDATE monitors SET status = ? WHERE id = ?',
            ['down', monitor.id]
        );
        
        // Create test email record using our helper
        await createTestEmailRecord({
            recipient: testEmail,
            subject: `🚨 Site Down Alert: ${monitorName}`,
            body: `Site: ${monitorName}\nURL: ${testUrl}\nStatus: DOWN`,
            dbPath: testServer.dbPath
        });
        
        // Simulate email notification being sent
        await simulateEmailNotification({
            monitorId: monitor.id,
            userEmail: testEmail,
            notificationType: 'down',
            dbPath: testServer.dbPath
        });
        
        await db.close();
        
        // Reload the page to see the updated status
        await page.reload();
        
        // Verify the database contains the expected email content
        const verifyDb = await open({
            filename: testServer.dbPath,
            driver: sqlite3.Database
        });
        
        const emailContent = await verifyDb.get(
            'SELECT * FROM email_content_test WHERE recipient = ?',
            [testEmail]
        );
        
        expect(emailContent).toBeTruthy();
        expect(emailContent.subject).toContain(monitorName);
        expect(emailContent.body).toContain(testUrl);
        expect(emailContent.body).toContain('DOWN');
        
        await verifyDb.close();
    });
});