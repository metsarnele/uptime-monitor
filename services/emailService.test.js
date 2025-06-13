// services/emailService.test.js
// Mock email service that exactly mimics Mailgun API behavior

class MockEmailService {
    constructor() {
        this.sentEmails = [];
        this.shouldFail = false;
        this.failureReason = 'Mock failure';
        this.customErrors = new Map();
        this.networkLatency = 10; // ms
        this.apiKey = process.env.MAILGUN_API_KEY || 'mock-api-key';
        this.domain = process.env.MAILGUN_DOMAIN || 'test.example.com';
        this.baseUrl = 'https://api.eu.mailgun.net/v3';
        this.fromEmail = `Uptime Monitor <postmaster@${this.domain}>`;
    }

    /**
     * Mock implementation of sendDownNotification - matches production signature
     */
    async sendDownNotification(userEmail, monitorUrl, monitorName = null) {
        const subject = `🚨 Site Down Alert: ${monitorName || monitorUrl}`;
        const text = `
Hello,

Your monitored site is currently down:

Site: ${monitorName || 'Monitor'}
URL: ${monitorUrl}
Status: DOWN
Time: ${new Date().toLocaleString()}

We will continue monitoring and notify you when the site is back online.

Best regards,
Uptime Monitor Team
        `.trim();

        const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2 style="color: #d32f2f;">🚨 Site Down Alert</h2>
    
    <div style="background-color: #ffebee; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #d32f2f; margin-top: 0;">Site is Currently Down</h3>
        <p><strong>Site:</strong> ${monitorName || 'Monitor'}</p>
        <p><strong>URL:</strong> <a href="${monitorUrl}" style="color: #1976d2;">${monitorUrl}</a></p>
        <p><strong>Status:</strong> <span style="color: #d32f2f; font-weight: bold;">DOWN</span></p>
        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
    </div>
    
    <p>We will continue monitoring and notify you when the site is back online.</p>
    
    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
    <p style="color: #666; font-size: 14px;">
        Best regards,<br>
        Uptime Monitor Team
    </p>
</div>
        `;

        return this.sendEmail(userEmail, subject, text, html);
    }

    /**
     * Mock implementation of sendUpNotification - matches production signature
     */
    async sendUpNotification(userEmail, monitorUrl, monitorName = null, downDuration = null) {
        const subject = `✅ Site Restored: ${monitorName || monitorUrl}`;
        const text = `
Hello,

Good news! Your monitored site is back online:

Site: ${monitorName || 'Monitor'}
URL: ${monitorUrl}
Status: UP
Time: ${new Date().toLocaleString()}
${downDuration ? `Downtime: ${downDuration}` : ''}

Your site is now responding normally.

Best regards,
Uptime Monitor Team
        `.trim();

        const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2 style="color: #2e7d32;">✅ Site Restored</h2>
    
    <div style="background-color: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #2e7d32; margin-top: 0;">Site is Back Online</h3>
        <p><strong>Site:</strong> ${monitorName || 'Monitor'}</p>
        <p><strong>URL:</strong> <a href="${monitorUrl}" style="color: #1976d2;">${monitorUrl}</a></p>
        <p><strong>Status:</strong> <span style="color: #2e7d32; font-weight: bold;">UP</span></p>
        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
        ${downDuration ? `<p><strong>Downtime:</strong> ${downDuration}</p>` : ''}
    </div>
    
    <p>Your site is now responding normally.</p>
    
    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
    <p style="color: #666; font-size: 14px;">
        Best regards,<br>
        Uptime Monitor Team
    </p>
</div>
        `;

        return this.sendEmail(userEmail, subject, text, html);
    }

    /**
     * Mock implementation of sendWelcomeEmail - matches production signature
     */
    async sendWelcomeEmail(userEmail) {
        const subject = 'Welcome to Uptime Monitor!';
        const text = `
Hello,

Welcome to Uptime Monitor!

Your account has been successfully created. You can now start monitoring your websites and receive notifications when they go down.

To get started:
1. Sign in to your dashboard
2. Add your first website to monitor
3. Configure your notification preferences

If you have any questions, feel free to reach out to our support team.

Best regards,
Uptime Monitor Team
        `.trim();

        const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2 style="color: #1976d2;">Welcome to Uptime Monitor!</h2>
    
    <div style="background-color: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #1976d2; margin-top: 0;">Account Successfully Created</h3>
        <p>Your account has been successfully created. You can now start monitoring your websites and receive notifications when they go down.</p>
    </div>
    
    <h3>To get started:</h3>
    <ol>
        <li>Sign in to your dashboard</li>
        <li>Add your first website to monitor</li>
        <li>Configure your notification preferences</li>
    </ol>
    
    <p>If you have any questions, feel free to reach out to our support team.</p>
    
    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
    <p style="color: #666; font-size: 14px;">
        Best regards,<br>
        Uptime Monitor Team
    </p>
</div>
        `;

        return this.sendEmail(userEmail, subject, text, html);
    }

    /**
     * Core mock email sending that exactly mimics Mailgun API
     */
    async sendEmail(to, subject, text, html = null) {
        // Simulate network latency
        await new Promise(resolve => setTimeout(resolve, this.networkLatency));

        // Validate email format (Mailgun does this)
        if (!this._isValidEmail(to)) {
            return this._createErrorResponse(400, "parameter is not a valid address", `'to' parameter is not a valid address. please check documentation`);
        }

        // Check for custom errors set for testing
        const errorKey = `${to}:${subject}`;
        if (this.customErrors.has(errorKey)) {
            const error = this.customErrors.get(errorKey);
            return this._createErrorResponse(error.status, error.message, error.details);
        }

        // Check global failure setting
        if (this.shouldFail) {
            return this._createErrorResponse(500, this.failureReason, null);
        }

        // Simulate Mailgun's success response format
        const messageId = this._generateMailgunMessageId();
        
        // Store the email for test verification (this wouldn't exist in real Mailgun)
        const emailRecord = {
            id: messageId,
            to: to,
            from: this.fromEmail,
            subject: subject,
            text: text,
            html: html,
            timestamp: new Date().toISOString(),
            status: 'accepted',
            // Additional Mailgun-like metadata
            'message-headers': JSON.stringify([
                ['From', this.fromEmail],
                ['To', to],
                ['Subject', subject],
                ['Date', new Date().toUTCString()]
            ]),
            'recipient-variables': '{}',
            'user-variables': '{}'
        };
        
        this.sentEmails.push(emailRecord);

        // Log success like real Mailgun service
        if (process.env.NODE_ENV === 'test' || process.env.DEBUG === 'true') {
            console.log(`Email sent successfully to ${to}: ${messageId}`);
        }

        // Return exact Mailgun success format
        return { 
            success: true, 
            id: messageId,
            message: "Queued. Thank you."
        };
    }

    /**
     * Mock implementation of testConfiguration - matches production signature
     */
    async testConfiguration(testEmail) {
        return this.sendEmail(
            testEmail,
            'Mailgun Configuration Test',
            'This is a test email to verify your Mailgun configuration is working correctly.',
            '<p>This is a test email to verify your <strong>Mailgun configuration</strong> is working correctly.</p>'
        );
    }

    /**
     * Validate email format like Mailgun does (RFC5321, RFC5322, RFC6854)
     */
    _isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email) && email.length <= 320; // RFC limit
    }

    /**
     * Generate Mailgun-style message ID
     */
    _generateMailgunMessageId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 15);
        return `${timestamp}.${random}@${this.domain}`;
    }

    /**
     * Create error response in Mailgun format
     */
    _createErrorResponse(status, message, details = null) {
        const error = {
            success: false,
            error: message
        };
        
        if (details) {
            error.details = details;
        }

        // Log error like real Mailgun
        console.error(`Failed to send email: ${status} ${message}${details ? ` - ${details}` : ''}`);
        
        return error;
    }

    /**
     * Test utility methods (these wouldn't exist in real Mailgun)
     */
    getSentEmails() {
        return this.sentEmails;
    }

    getLastSentEmail() {
        return this.sentEmails[this.sentEmails.length - 1];
    }

    clearSentEmails() {
        this.sentEmails = [];
    }

    setFailure(shouldFail = true, reason = 'Mock failure') {
        this.shouldFail = shouldFail;
        this.failureReason = reason;
    }

    setCustomError(to, subject, status, message, details = null) {
        const key = `${to}:${subject}`;
        this.customErrors.set(key, { status, message, details });
    }

    clearCustomErrors() {
        this.customErrors.clear();
    }

    setNetworkLatency(ms) {
        this.networkLatency = ms;
    }

    getEmailCount() {
        return this.sentEmails.length;
    }

    findEmailsByRecipient(recipient) {
        return this.sentEmails.filter(email => email.to === recipient);
    }

    findEmailsBySubject(subject) {
        return this.sentEmails.filter(email => email.subject.includes(subject));
    }

    findEmailById(messageId) {
        return this.sentEmails.find(email => email.id === messageId);
    }

    // Simulate Mailgun events API responses
    getEmailEvents(messageId) {
        const email = this.findEmailById(messageId);
        if (!email) return [];

        return [
            {
                event: 'accepted',
                timestamp: new Date(email.timestamp).getTime() / 1000,
                id: messageId,
                recipient: email.to,
                'user-variables': {}
            },
            {
                event: 'delivered',
                timestamp: (new Date(email.timestamp).getTime() + 1000) / 1000,
                id: messageId,
                recipient: email.to,
                'delivery-status': {
                    message: 'OK',
                    code: 250
                }
            }
        ];
    }

    // Simulate specific Mailgun error scenarios
    simulateRateLimitError() {
        this.setFailure(true, 'Rate limit exceeded');
    }

    simulateInvalidDomainError() {
        this.setFailure(true, 'Domain not found');
    }

    simulateAuthenticationError() {
        this.setFailure(true, 'Forbidden - Invalid API key');
    }

    resetToSuccess() {
        this.setFailure(false);
        this.clearCustomErrors();
    }
}

export default new MockEmailService();
