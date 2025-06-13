// services/monitorService.js
import fetch from 'node-fetch';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import emailService from './emailService.js';

class MonitorService {
    constructor() {
        this.db = null;
        this.monitoringInterval = null;
        this.isRunning = false;
        this.checkIntervalMs = process.env.MONITORING_INTERVAL 
            ? parseInt(process.env.MONITORING_INTERVAL, 10) 
            : 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Initialize the monitoring service
     */
    async initialize(database) {
        this.db = database;
        
        // Create additional tables for monitoring
        await this.createMonitoringTables();
        
        console.log('Monitor service initialized');
    }

    /**
     * Create required database tables
     */
    async createMonitoringTables() {
        await this.db.exec(`
            -- Add status and notification columns to monitors table
            ALTER TABLE monitors ADD COLUMN status TEXT DEFAULT 'pending';
            ALTER TABLE monitors ADD COLUMN last_checked DATETIME;
            ALTER TABLE monitors ADD COLUMN response_time INTEGER;
            ALTER TABLE monitors ADD COLUMN notifications_enabled BOOLEAN DEFAULT 1;
            ALTER TABLE monitors ADD COLUMN last_notification_sent DATETIME;
        `).catch(() => {
            // Columns may already exist, ignore error
        });

        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS monitor_status_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                monitor_id INTEGER NOT NULL,
                status TEXT NOT NULL,
                response_time INTEGER,
                checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                error_message TEXT,
                FOREIGN KEY (monitor_id) REFERENCES monitors(id)
            );
            
            CREATE TABLE IF NOT EXISTS notification_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                monitor_id INTEGER NOT NULL,
                user_email TEXT NOT NULL,
                notification_type TEXT NOT NULL, -- 'down', 'up'
                sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                success BOOLEAN DEFAULT 0,
                error_message TEXT,
                FOREIGN KEY (monitor_id) REFERENCES monitors(id)
            );
        `);
    }

    /**
     * Start the monitoring service
     */
    startMonitoring() {
        if (this.isRunning) {
            console.log('Monitoring service is already running');
            return;
        }

        this.isRunning = true;
        console.log(`Starting monitoring service with ${this.checkIntervalMs / 1000}s interval`);
        
        // Run initial check
        this.checkAllMonitors();
        
        // Set up recurring checks
        this.monitoringInterval = setInterval(() => {
            this.checkAllMonitors();
        }, this.checkIntervalMs);
    }

    /**
     * Stop the monitoring service
     */
    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        this.isRunning = false;
        console.log('Monitoring service stopped');
    }

    /**
     * Check all monitors in the database
     */
    async checkAllMonitors() {
        try {
            const monitors = await this.db.all(`
                SELECT m.*, u.email as user_email 
                FROM monitors m 
                JOIN users u ON m.user_id = u.id
            `);

            console.log(`Checking ${monitors.length} monitors...`);

            for (const monitor of monitors) {
                await this.checkMonitor(monitor);
                // Add small delay between checks to avoid overwhelming
                await this.sleep(1000);
            }

            console.log(`Completed checking ${monitors.length} monitors`);
        } catch (error) {
            console.error('Error checking monitors:', error);
        }
    }

    /**
     * Check a single monitor
     */
    async checkMonitor(monitor) {
        const startTime = Date.now();
        let status = 'down';
        let responseTime = null;
        let errorMessage = null;

        try {
            const result = await this.checkUrl(monitor.url);
            status = result.status;
            responseTime = result.responseTime;
            errorMessage = result.error;
        } catch (error) {
            console.error(`Error checking monitor ${monitor.id}:`, error);
            errorMessage = error.message;
        }

        // Update monitor status
        await this.updateMonitorStatus(monitor.id, status, responseTime, errorMessage);

        // Check if we need to send notifications
        await this.handleStatusChange(monitor, status, errorMessage);

        // Log the status check
        await this.logStatusCheck(monitor.id, status, responseTime, errorMessage);
    }

    /**
     * Check if a URL is accessible
     */
    async checkUrl(url) {
        const startTime = Date.now();
        
        try {
            // Ensure URL has protocol
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                url = 'https://' + url;
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

            const response = await fetch(url, {
                method: 'GET',
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Uptime-Monitor/1.0'
                },
                redirect: 'follow',
                follow: 5
            });

            clearTimeout(timeoutId);
            const responseTime = Date.now() - startTime;

            return {
                status: response.ok ? 'up' : 'down',
                responseTime,
                statusCode: response.status,
                error: response.ok ? null : `HTTP ${response.status}`
            };
        } catch (error) {
            const responseTime = Date.now() - startTime;
            
            return {
                status: 'down',
                responseTime,
                error: error.name === 'AbortError' ? 'Timeout' : error.message
            };
        }
    }

    /**
     * Update monitor status in database
     */
    async updateMonitorStatus(monitorId, status, responseTime, errorMessage) {
        await this.db.run(`
            UPDATE monitors 
            SET status = ?, last_checked = CURRENT_TIMESTAMP, response_time = ?
            WHERE id = ?
        `, [status, responseTime, monitorId]);
    }

    /**
     * Handle status changes and send notifications if needed
     */
    async handleStatusChange(monitor, newStatus, errorMessage) {
        const previousStatus = monitor.status;
        
        // Only send notifications if status actually changed and notifications are enabled
        if (previousStatus !== newStatus && monitor.notifications_enabled) {
            if (newStatus === 'down' && previousStatus === 'up') {
                // Site went down
                await this.sendDownNotification(monitor, errorMessage);
                
                // Record the exact time when status changed to down
                await this.db.run(`
                    UPDATE monitors 
                    SET last_notification_sent = CURRENT_TIMESTAMP 
                    WHERE id = ?
                `, [monitor.id]);
            } else if (newStatus === 'up' && previousStatus === 'down') {
                // Site came back up
                await this.sendUpNotification(monitor);
            }
        }
    }

    /**
     * Send down notification
     */
    async sendDownNotification(monitor, errorMessage) {
        try {
            const result = await emailService.sendDownNotification(
                monitor.user_email,
                monitor.url,
                monitor.name
            );

            await this.logNotification(
                monitor.id,
                monitor.user_email,
                'down',
                result.success,
                result.error
            );

            if (result.success) {
                // Update last notification sent time
                await this.db.run(`
                    UPDATE monitors 
                    SET last_notification_sent = CURRENT_TIMESTAMP 
                    WHERE id = ?
                `, [monitor.id]);
            }
        } catch (error) {
            console.error(`Failed to send down notification for monitor ${monitor.id}:`, error);
        }
    }

    /**
     * Send up notification
     */
    async sendUpNotification(monitor) {
        try {
            // Calculate downtime based on status history
            let downDuration = null;
            
            // Get the most recent down event from history
            const lastDownEvent = await this.db.get(`
                SELECT checked_at 
                FROM monitor_status_history 
                WHERE monitor_id = ? AND status = 'down'
                ORDER BY checked_at DESC 
                LIMIT 1
            `, [monitor.id]);
            
            if (lastDownEvent && lastDownEvent.checked_at) {
                const downTime = new Date() - new Date(lastDownEvent.checked_at);
                downDuration = this.formatDuration(downTime);
            } else if (monitor.last_notification_sent) {
                // Fallback to last notification time if no history found
                const downTime = new Date() - new Date(monitor.last_notification_sent);
                downDuration = this.formatDuration(downTime);
            }

            const result = await emailService.sendUpNotification(
                monitor.user_email,
                monitor.url,
                monitor.name,
                downDuration
            );

            await this.logNotification(
                monitor.id,
                monitor.user_email,
                'up',
                result.success,
                result.error
            );
        } catch (error) {
            console.error(`Failed to send up notification for monitor ${monitor.id}:`, error);
        }
    }

    /**
     * Log status check to history
     */
    async logStatusCheck(monitorId, status, responseTime, errorMessage) {
        await this.db.run(`
            INSERT INTO monitor_status_history 
            (monitor_id, status, response_time, error_message)
            VALUES (?, ?, ?, ?)
        `, [monitorId, status, responseTime, errorMessage]);
    }

    /**
     * Log notification attempt
     */
    async logNotification(monitorId, userEmail, type, success, errorMessage) {
        await this.db.run(`
            INSERT INTO notification_log 
            (monitor_id, user_email, notification_type, success, error_message)
            VALUES (?, ?, ?, ?, ?)
        `, [monitorId, userEmail, type, success ? 1 : 0, errorMessage]);
    }

    /**
     * Format duration in a human-readable way
     */
    formatDuration(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
            return `${days} day${days !== 1 ? 's' : ''} ${hours % 24} hour${(hours % 24) !== 1 ? 's' : ''}`;
        } else if (hours > 0) {
            return `${hours} hour${hours !== 1 ? 's' : ''} ${minutes % 60} minute${(minutes % 60) !== 1 ? 's' : ''}`;
        } else if (minutes > 0) {
            return `${minutes} minute${minutes !== 1 ? 's' : ''} ${seconds % 60} second${(seconds % 60) !== 1 ? 's' : ''}`;
        } else {
            return `${seconds} second${seconds !== 1 ? 's' : ''}`;
        }
    }

    /**
     * Utility function to sleep
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get monitor statistics
     */
    async getMonitorStats(monitorId, hours = 24) {
        const stats = await this.db.get(`
            SELECT 
                COUNT(*) as total_checks,
                SUM(CASE WHEN status = 'up' THEN 1 ELSE 0 END) as up_checks,
                SUM(CASE WHEN status = 'down' THEN 1 ELSE 0 END) as down_checks,
                AVG(response_time) as avg_response_time,
                MIN(response_time) as min_response_time,
                MAX(response_time) as max_response_time
            FROM monitor_status_history 
            WHERE monitor_id = ? 
            AND checked_at > datetime('now', '-${hours} hours')
        `, [monitorId]);

        if (stats.total_checks > 0) {
            stats.uptime_percentage = (stats.up_checks / stats.total_checks * 100).toFixed(2);
        } else {
            stats.uptime_percentage = 0;
        }

        return stats;
    }
}

export default new MonitorService();