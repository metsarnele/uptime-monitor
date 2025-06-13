// services/emailService.js
import fetch from 'node-fetch';

class EmailService {
    constructor() {
        this.apiKey = process.env.MAILGUN_API_KEY;
        this.domain = process.env.MAILGUN_DOMAIN || 'mg.brigitakasemets.me';
        this.baseUrl = 'https://api.eu.mailgun.net/v3';
        this.fromEmail = `Uptime Monitor <postmaster@${this.domain}>`;
        
        // Test mode detection
        this.isTestMode = process.env.NODE_ENV === 'test' || 
                         process.env.NODE_ENV === 'ci' ||
                         process.env.EMAIL_TEST_MODE === 'true';
    }

    /**
     * Send email notification when a monitor goes down
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
     * Send email notification when a monitor comes back up
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
     * Send welcome email to new users
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
     * Core method to send emails via Mailgun API
     */
    async sendEmail(to, subject, text, html = null) {
        // In test mode, log the email but don't actually send it
        if (this.isTestMode) {
            console.log(`[TEST MODE] Would send email to ${to}: ${subject}`);
            if (process.env.DEBUG === 'true') {
                console.log(`Body preview: ${text.slice(0, 100)}...`);
            }
            return { 
                success: true, 
                messageId: `test-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
                testMode: true 
            };
        }

        if (!this.apiKey) {
            console.warn('Mailgun API key not configured. Email will not be sent.');
            if (process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true') {
                console.log('Would have sent email:');
                console.log(`To: ${to}`);
                console.log(`Subject: ${subject}`);
                console.log(`Body: ${text.slice(0, 100)}...`);
            }
            return { success: false, error: 'Email service not configured (MAILGUN_API_KEY missing)' };
        }

        try {
            const formData = new URLSearchParams();
            formData.append('from', this.fromEmail);
            formData.append('to', to);
            formData.append('subject', subject);
            formData.append('text', text);
            
            if (html) {
                formData.append('html', html);
            }

            const response = await fetch(`${this.baseUrl}/${this.domain}/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${Buffer.from(`api:${this.apiKey}`).toString('base64')}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData
            });

            if (response.ok) {
                try {
                    const result = await response.json();
                    console.log(`Email sent successfully to ${to}: ${result.id}`);
                    return { success: true, messageId: result.id };
                } catch (parseError) {
                    // Handle case where response is successful but not JSON
                    console.log(`Email likely sent successfully to ${to}, but response was not JSON`);
                    return { success: true, message: 'Email sent successfully' };
                }
            } else {
                try {
                    // Try to get the error as text first
                    const errorText = await response.text();
                    
                    // Then try to parse it as JSON if possible
                    try {
                        const errorJson = JSON.parse(errorText);
                        console.error('Failed to send email:', errorJson);
                        return { success: false, error: errorJson.message || 'Failed to send email' };
                    } catch {
                        // If it's not JSON, use the text directly
                        console.error('Failed to send email:', errorText);
                        return { success: false, error: errorText || `Failed to send email: ${response.status}` };
                    }
                } catch (parseError) {
                    console.error('Failed to parse error response:', parseError);
                    return { success: false, error: `Failed to send email: ${response.status} ${response.statusText}` };
                }
            }
        } catch (error) {
            console.error('Error sending email:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Test email configuration
     */
    async testConfiguration(testEmail) {
        return this.sendEmail(
            testEmail,
            'Mailgun Configuration Test',
            'This is a test email to verify your Mailgun configuration is working correctly.',
            '<p>This is a test email to verify your <strong>Mailgun configuration</strong> is working correctly.</p>'
        );
    }
}

export default new EmailService();