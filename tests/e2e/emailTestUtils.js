// tests/e2e/emailTestUtils.js
// Email testing utilities for Mailgun-compatible mock service

import { getEmailService } from '../../services/emailServiceFactory.js';

/**
 * Get the mock email service for testing
 * @returns {Promise<Object>} Mock email service instance
 */
export async function getMockEmailService() {
    const emailService = await getEmailService();
    
    if (!emailService.getSentEmails) {
        throw new Error('Email service is not in test mode. Ensure NODE_ENV=test or EMAIL_TEST_MODE=true');
    }
    
    return emailService;
}

/**
 * Wait for email to be sent and return it
 * @param {Object} mockEmailService - Mock email service instance
 * @param {string} recipient - Email recipient to wait for
 * @param {number} timeout - Timeout in milliseconds (default: 5000)
 * @returns {Promise<Object>} The sent email
 */
export async function waitForEmail(mockEmailService, recipient, timeout = 5000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        const emails = mockEmailService.findEmailsByRecipient(recipient);
        if (emails.length > 0) {
            return emails[emails.length - 1]; // Return the most recent email
        }
        
        // Wait 100ms before checking again
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    throw new Error(`Timeout waiting for email to ${recipient} after ${timeout}ms`);
}

/**
 * Wait for email with specific subject to be sent
 * @param {Object} mockEmailService - Mock email service instance
 * @param {string} recipient - Email recipient to wait for
 * @param {string} subjectContains - Text that should be in the subject
 * @param {number} timeout - Timeout in milliseconds (default: 5000)
 * @returns {Promise<Object>} The sent email
 */
export async function waitForEmailWithSubject(mockEmailService, recipient, subjectContains, timeout = 5000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        const emails = mockEmailService.findEmailsByRecipient(recipient);
        const matchingEmail = emails.find(email => email.subject.includes(subjectContains));
        if (matchingEmail) {
            return matchingEmail;
        }
        
        // Wait 100ms before checking again
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    throw new Error(`Timeout waiting for email to ${recipient} with subject containing "${subjectContains}" after ${timeout}ms`);
}

/**
 * Assert that an email was sent with specific properties
 * @param {Object} mockEmailService - Mock email service instance
 * @param {Object} expectedEmail - Expected email properties
 */
export function assertEmailSent(mockEmailService, expectedEmail) {
    const emails = mockEmailService.getSentEmails();
    
    const matchingEmail = emails.find(email => {
        return Object.keys(expectedEmail).every(key => {
            if (key === 'subject') {
                return expectedEmail.subject ? email.subject.includes(expectedEmail.subject) : true;
            }
            if (key === 'to' || key === 'recipient') {
                return email.to === expectedEmail[key];
            }
            if (key === 'subjectContains') {
                return email.subject.includes(expectedEmail.subjectContains);
            }
            if (key === 'textContains') {
                return email.text && email.text.includes(expectedEmail.textContains);
            }
            if (key === 'htmlContains') {
                return email.html && email.html.includes(expectedEmail.htmlContains);
            }
            return email[key] === expectedEmail[key];
        });
    });
    
    if (!matchingEmail) {
        const emailSummary = emails.map(e => `"${e.subject}" to ${e.to} (ID: ${e.id})`).join('\n');
        throw new Error(
            `Expected email not found. Expected: ${JSON.stringify(expectedEmail)}\n` +
            `Actual emails sent:\n${emailSummary}`
        );
    }
    
    return matchingEmail;
}

/**
 * Assert that a specific number of emails were sent
 * @param {Object} mockEmailService - Mock email service instance
 * @param {number} expectedCount - Expected number of emails
 */
export function assertEmailCount(mockEmailService, expectedCount) {
    const actualCount = mockEmailService.getEmailCount();
    if (actualCount !== expectedCount) {
        const emails = mockEmailService.getSentEmails();
        const emailSummary = emails.map(e => `"${e.subject}" to ${e.to}`).join('\n');
        throw new Error(
            `Expected ${expectedCount} emails but found ${actualCount}.\n` +
            `Emails sent:\n${emailSummary}`
        );
    }
}

/**
 * Assert that no emails were sent
 * @param {Object} mockEmailService - Mock email service instance
 */
export function assertNoEmailsSent(mockEmailService) {
    assertEmailCount(mockEmailService, 0);
}

/**
 * Assert that email was sent successfully (no errors)
 * @param {Object} result - Result from email service send method
 */
export function assertEmailSuccess(result) {
    if (!result.success) {
        throw new Error(`Email sending failed: ${result.error}`);
    }
    
    // Verify Mailgun-style response format
    if (!result.id || !result.message) {
        throw new Error('Email result missing Mailgun-style response format');
    }
    
    if (result.message !== "Queued. Thank you.") {
        throw new Error(`Unexpected success message: ${result.message}`);
    }
}

/**
 * Assert that email sending failed with specific error
 * @param {Object} result - Result from email service send method
 * @param {string} expectedError - Expected error message (partial match)
 */
export function assertEmailFailure(result, expectedError = null) {
    if (result.success) {
        throw new Error(`Email should have failed but succeeded with ID: ${result.id}`);
    }
    
    if (expectedError && !result.error.includes(expectedError)) {
        throw new Error(`Expected error containing "${expectedError}" but got: ${result.error}`);
    }
}

/**
 * Clear all sent emails from the mock service
 * @param {Object} mockEmailService - Mock email service instance
 */
export function clearSentEmails(mockEmailService) {
    mockEmailService.clearSentEmails();
}

/**
 * Set up email service to simulate failures
 * @param {Object} mockEmailService - Mock email service instance
 * @param {boolean} shouldFail - Whether emails should fail
 * @param {string} reason - Failure reason
 */
export function simulateEmailFailure(mockEmailService, shouldFail = true, reason = 'Simulated failure') {
    mockEmailService.setFailure(shouldFail, reason);
}

/**
 * Simulate specific Mailgun error scenarios
 * @param {Object} mockEmailService - Mock email service instance
 * @param {string} errorType - Type of error to simulate
 */
export function simulateMailgunError(mockEmailService, errorType) {
    switch (errorType) {
        case 'rate_limit':
            mockEmailService.simulateRateLimitError();
            break;
        case 'invalid_domain':
            mockEmailService.simulateInvalidDomainError();
            break;
        case 'authentication':
            mockEmailService.simulateAuthenticationError();
            break;
        case 'invalid_email':
            // This is handled automatically by the mock service
            break;
        default:
            throw new Error(`Unknown error type: ${errorType}`);
    }
}

/**
 * Set custom error for specific email/subject combination
 * @param {Object} mockEmailService - Mock email service instance
 * @param {string} to - Email recipient
 * @param {string} subject - Email subject
 * @param {number} status - HTTP status code
 * @param {string} message - Error message
 * @param {string} details - Optional error details
 */
export function setCustomEmailError(mockEmailService, to, subject, status, message, details = null) {
    mockEmailService.setCustomError(to, subject, status, message, details);
}

/**
 * Reset email service to successful state
 * @param {Object} mockEmailService - Mock email service instance
 */
export function resetEmailService(mockEmailService) {
    mockEmailService.resetToSuccess();
    mockEmailService.clearSentEmails();
}

/**
 * Get email events for testing (simulates Mailgun events API)
 * @param {Object} mockEmailService - Mock email service instance
 * @param {string} messageId - Mailgun message ID
 * @returns {Array} Array of email events
 */
export function getEmailEvents(mockEmailService, messageId) {
    return mockEmailService.getEmailEvents(messageId);
}

/**
 * Test email content validation
 * @param {Object} email - Email object from mock service
 * @param {Object} expectations - Expected content
 */
export function validateEmailContent(email, expectations) {
    if (expectations.subject && !email.subject.includes(expectations.subject)) {
        throw new Error(`Expected subject to contain "${expectations.subject}" but got: ${email.subject}`);
    }
    
    if (expectations.textContains && (!email.text || !email.text.includes(expectations.textContains))) {
        throw new Error(`Expected text to contain "${expectations.textContains}" but got: ${email.text?.slice(0, 100)}...`);
    }
    
    if (expectations.htmlContains && (!email.html || !email.html.includes(expectations.htmlContains))) {
        throw new Error(`Expected HTML to contain "${expectations.htmlContains}" but got: ${email.html?.slice(0, 100)}...`);
    }
    
    if (expectations.from && email.from !== expectations.from) {
        throw new Error(`Expected from "${expectations.from}" but got: ${email.from}`);
    }
    
    if (expectations.to && email.to !== expectations.to) {
        throw new Error(`Expected to "${expectations.to}" but got: ${email.to}`);
    }
}
