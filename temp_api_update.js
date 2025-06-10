app.post('/api/monitors', requireAuth, async (req, res) => {
    try {
        const { url } = req.body;
        
        // Validate URL format
        const urlRegex = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\w \.-]*)*\/?$/;
        if (!urlRegex.test(url)) {
            return res.status(400).json({ success: false, message: 'Please enter a valid URL' });
        }

        // Check if user is already monitoring this URL
        const existingMonitor = await db.get(
            'SELECT * FROM monitors WHERE user_id = ? AND url = ?',
            [req.user.userId, url]
        );

        if (existingMonitor) {
            return res.status(400).json({ success: false, message: 'You are already monitoring this URL' });
        }

        // Add the new monitor with pending status
        const result = await db.run(
            'INSERT INTO monitors (user_id, url, status) VALUES (?, ?, ?)',
            [req.user.userId, url, 'pending']
        );
        
        // Get the ID of the newly inserted monitor
        const monitorId = result.lastID;
        
        // Import the checkUrl function
        const { checkUrl } = await import('./services/monitorService.js');
        
        // Check the URL status asynchronously (don't wait for it to complete)
        checkUrl(url).then(async (statusResult) => {
            try {
                // Update the monitor with the status result
                await db.run(
                    'UPDATE monitors SET status = ?, last_checked = CURRENT_TIMESTAMP, response_time = ? WHERE id = ?',
                    [statusResult.status, statusResult.responseTime, monitorId]
                );
                
                // Add to status history
                await db.run(
                    'INSERT INTO status_history (monitor_id, status, response_time) VALUES (?, ?, ?)',
                    [monitorId, statusResult.status, statusResult.responseTime]
                );
                
                console.log(`Initial status check for monitor ${monitorId} completed: ${statusResult.status}`);
            } catch (err) {
                console.error(`Error updating initial status for monitor ${monitorId}:`, err);
            }
        }).catch(err => {
            console.error(`Error checking URL for monitor ${monitorId}:`, err);
        });

        res.json({ success: true, message: 'Monitor added successfully' });
    } catch (error) {
        console.error('Error adding monitor:', error);
        res.status(500).json({ success: false, message: 'Failed to add monitor' });
    }
});
