// tests/e2e/apiHelpers.js

import { open } from 'sqlite';
import sqlite3 from 'sqlite3';

/**
 * Helper functions to interact with the API services
 * for testing purposes.
 */

/**
 * Simulates an email notification being sent for a monitor
 * @param {Object} options - Options for the notification
 * @param {number} options.monitorId - ID of the monitor
 * @param {string} options.userEmail - Email of the user to notify
 * @param {string} options.notificationType - Type of notification (down, up, etc)
 * @param {string} options.dbPath - Path to the test database
 * @returns {Promise<Object>} - The created notification log entry
 */
export async function simulateEmailNotification({
  monitorId,
  userEmail,
  notificationType = 'down',
  dbPath
}) {
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // Create notification log entry
  const result = await db.run(`
    INSERT INTO notification_log (monitor_id, user_email, notification_type, success)
    VALUES (?, ?, ?, ?)
  `, [monitorId, userEmail, notificationType, 1]);

  // Get the inserted notification
  const notification = await db.get(
    'SELECT * FROM notification_log WHERE id = ?',
    [result.lastID]
  );

  await db.close();
  return notification;
}

/**
 * Simulates a monitor status change
 * @param {Object} options - Options for the status change
 * @param {number} options.monitorId - ID of the monitor
 * @param {string} options.status - New status (up, down, pending)
 * @param {string} options.dbPath - Path to the test database
 * @returns {Promise<Object>} - The updated monitor
 */
export async function changeMonitorStatus({
  monitorId,
  status,
  dbPath
}) {
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // Update monitor status
  await db.run(
    'UPDATE monitors SET status = ? WHERE id = ?',
    [status, monitorId]
  );

  // Add to status history
  await db.run(`
    INSERT INTO monitor_status_history (monitor_id, status)
    VALUES (?, ?)
  `, [monitorId, status]);

  // Get the updated monitor
  const monitor = await db.get(
    'SELECT * FROM monitors WHERE id = ?',
    [monitorId]
  );

  await db.close();
  return monitor;
}

/**
 * Creates a test email record to verify email content
 * @param {Object} options - Options for the test email
 * @param {string} options.recipient - Email recipient
 * @param {string} options.subject - Email subject
 * @param {string} options.body - Email body
 * @param {string} options.dbPath - Path to the test database
 * @returns {Promise<Object>} - The created email test record
 */
export async function createTestEmailRecord({
  recipient,
  subject,
  body,
  dbPath
}) {
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // Insert email content test record
  const result = await db.run(`
    INSERT INTO email_content_test (recipient, subject, body)
    VALUES (?, ?, ?)
  `, [recipient, subject, body]);

  // Get the inserted record
  const emailRecord = await db.get(
    'SELECT * FROM email_content_test WHERE id = ?',
    [result.lastID]
  );

  await db.close();
  return emailRecord;
}
