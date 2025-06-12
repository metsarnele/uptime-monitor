// tests/e2e/email-notifications.spec.js
import { expect } from '@playwright/test';
import { test } from './testSetup';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import bcryptjs from 'bcryptjs';

test.describe('Email Notifications', () => {
    const testEmail = 'notification-test@example.com';
    const testPassword = 'securepassword123';
    let userId;

    test.beforeEach(async ({ page, testServer }) => {
        const db = await open({
            filename: testServer.dbPath,
            driver: sqlite3.Database
        });

        // check if users table exists, if not create it
        try {
            // try to create users table
            await db.exec(`
                ALTER TABLE monitors ADD COLUMN email_notifications INTEGER DEFAULT 0
            `);
        } catch (error) {
            // if the column already exists, it will throw an error
            console.log('Email notifications column might already exist:', error.message);
        }

        const hashedPassword = await bcryptjs.hash(testPassword, 10);
        const result = await db.run(
            'INSERT INTO users (email, password) VALUES (?, ?)',
            [testEmail, hashedPassword]
        );
        userId = result.lastID;

        await db.close();

        await page.goto(`${testServer.url}/signin`);
        await page.getByLabel('Email Address').fill(testEmail);
        await page.getByLabel('Password').fill(testPassword);
        await page.getByRole('button', { name: /sign in/i }).click();
        await expect(page).toHaveURL(/.*\/dashboard/);
    });

    test('should allow enabling email notifications for monitors', async ({ page, testServer }) => {
        // add a monitor
        const testUrl = 'https://example-notifications.com';
        await page.locator('#monitor-url').fill(testUrl);
        await page.locator('#add-monitor-btn').click();
        await expect(page.getByText(testUrl)).toBeVisible();

        // search for the monitor
        const emailToggle = page.locator('[data-testid="email-notifications-toggle"]').first();
        await expect(emailToggle).toBeVisible();

        // allow email notifications
        await emailToggle.check();

        // verify the toggle is checked database
        const db = await open({
            filename: testServer.dbPath,
            driver: sqlite3.Database
        });

        const monitor = await db.get(
            'SELECT * FROM monitors WHERE url = ? AND user_id = ?',
            [testUrl, userId]
        );

        expect(monitor.email_notifications).toBe(1);
        await db.close();
    });
});