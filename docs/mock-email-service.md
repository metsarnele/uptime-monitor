# Mock Email Service Documentation

## Overview

Our mock email service is designed to work **exactly like the Mailgun API** for testing purposes. It provides identical method signatures, response formats, error handling, and behavior patterns as the real Mailgun service.

## 🎯 Features

### ✅ **100% API Compatible**
- Identical method signatures as production Mailgun service
- Same response format: `{ success: true, id: "messageId", message: "Queued. Thank you." }`
- Same error format: `{ success: false, error: "error message", details: "..." }`
- Mailgun-style message IDs: `timestamp.random@domain.com`

### ✅ **Production Method Support**
- `sendDownNotification(email, url, name)` - Site down alerts
- `sendUpNotification(email, url, name, duration)` - Site restored alerts  
- `sendWelcomeEmail(email)` - Welcome emails for new users
- `sendEmail(to, subject, text, html)` - Generic email sending
- `testConfiguration(email)` - Test email configuration

### ✅ **Comprehensive Error Simulation**
- Email validation (invalid format detection)
- Rate limiting errors
- Authentication failures
- Custom errors for specific email/subject combinations
- Network latency simulation

### ✅ **Advanced Testing Features**
- Email content verification (text, HTML, headers)
- Email counting and filtering
- Event simulation (accepted, delivered events)
- Search by recipient, subject, or message ID

## 🚀 Usage

### Basic Setup

```javascript
import { getMockEmailService } from './tests/e2e/emailTestUtils.js';

// Get the mock service (automatically used when EMAIL_TEST_MODE=true)
const emailService = await getMockEmailService();
```

### Sending Emails

```javascript
// Production methods work exactly the same
const result = await emailService.sendDownNotification(
    'user@example.com',
    'https://example.com',
    'My Website'
);

// Check result (same as Mailgun)
if (result.success) {
    console.log(`Email sent with ID: ${result.id}`);
    // result.message === "Queued. Thank you."
} else {
    console.error(`Failed: ${result.error}`);
}
```

### Testing Email Delivery

```javascript
import { 
    assertEmailSent, 
    assertEmailSuccess, 
    waitForEmail,
    validateEmailContent 
} from './tests/e2e/emailTestUtils.js';

// Send email and verify success
const result = await emailService.sendWelcomeEmail('test@example.com');
assertEmailSuccess(result);

// Wait for and verify email was received
const email = await waitForEmail(emailService, 'test@example.com');
validateEmailContent(email, {
    subject: 'Welcome to Uptime Monitor!',
    textContains: 'successfully created',
    htmlContains: 'Account Successfully Created'
});

// Check how many emails were sent
const emailCount = emailService.getEmailCount();
console.log(`Total emails sent: ${emailCount}`);
```

### Error Testing

```javascript
import { 
    simulateEmailFailure, 
    simulateMailgunError,
    assertEmailFailure 
} from './tests/e2e/emailTestUtils.js';

// Test rate limiting
simulateMailgunError(emailService, 'rate_limit');
const result = await emailService.sendEmail('test@example.com', 'Subject', 'Body');
assertEmailFailure(result, 'Rate limit exceeded');

// Test invalid email format
const invalidResult = await emailService.sendEmail('invalid-email', 'Subject', 'Body');
assertEmailFailure(invalidResult, 'parameter is not a valid address');

// Custom error for specific cases
setCustomEmailError(
    emailService,
    'problem@example.com',
    'Problem Subject',
    422,
    'Custom validation error'
);
```

### Email Search & Filtering

```javascript
// Find emails by recipient
const userEmails = emailService.findEmailsByRecipient('user@example.com');

// Find emails by subject content
const invoiceEmails = emailService.findEmailsBySubject('Invoice');

// Find specific email by message ID
const email = emailService.findEmailById('messageId123');

// Get all sent emails
const allEmails = emailService.getSentEmails();
```

## 🔧 Configuration

### Environment Variables

```bash
# Enable mock email service
EMAIL_TEST_MODE=true
NODE_ENV=test

# Optional: Customize domain for message IDs
MAILGUN_DOMAIN=test.example.com
```

### Advanced Configuration

```javascript
// Set network latency for realistic testing
emailService.setNetworkLatency(100); // 100ms delay

// Simulate specific errors
emailService.simulateRateLimitError();
emailService.simulateAuthenticationError();
emailService.simulateInvalidDomainError();

// Reset to working state
emailService.resetToSuccess();
emailService.clearSentEmails();
```

## 📋 Test Examples

### Example 1: Basic Email Test

```javascript
test('should send welcome email', async () => {
    const emailService = await getMockEmailService();
    
    const result = await emailService.sendWelcomeEmail('newuser@example.com');
    
    assertEmailSuccess(result);
    assertEmailSent(emailService, {
        to: 'newuser@example.com',
        subject: 'Welcome to Uptime Monitor!'
    });
});
```

### Example 2: Site Monitoring Test

```javascript
test('should send down notification', async () => {
    const emailService = await getMockEmailService();
    
    const result = await emailService.sendDownNotification(
        'admin@example.com',
        'https://mysite.com',
        'Production Site'
    );
    
    assertEmailSuccess(result);
    
    const email = await waitForEmail(emailService, 'admin@example.com');
    validateEmailContent(email, {
        subject: '🚨 Site Down Alert: Production Site',
        textContains: 'currently down',
        htmlContains: 'Site is Currently Down'
    });
});
```

### Example 3: Error Handling Test

```javascript
test('should handle rate limiting', async () => {
    const emailService = await getMockEmailService();
    
    simulateMailgunError(emailService, 'rate_limit');
    
    const result = await emailService.sendEmail(
        'test@example.com',
        'Subject',
        'Body'
    );
    
    assertEmailFailure(result, 'Rate limit exceeded');
});
```

## 🏗️ Architecture

### Service Factory Pattern

The email service uses a factory pattern to automatically switch between production Mailgun and mock service:

```javascript
// services/emailServiceFactory.js
export async function getEmailService() {
    const isTestEnv = process.env.NODE_ENV === 'test' || 
                     process.env.EMAIL_TEST_MODE === 'true';
    
    if (isTestEnv) {
        return await getTestEmailService(); // Mock service
    }
    
    return productionEmailService; // Real Mailgun
}
```

### Mock Service Features

The mock service (`emailService.test.js`) includes:

- **Mailgun Response Format**: Exact JSON structure as real API
- **Message ID Generation**: Domain-based IDs like `timestamp.random@domain.com`
- **Email Validation**: RFC-compliant email format checking
- **Error Simulation**: Rate limits, auth failures, invalid emails
- **Event Tracking**: Accept/deliver events like Mailgun Events API
- **Content Storage**: Full email content for verification

## 🚀 Benefits

### For Development
- ✅ **No API Keys Required** - Works without real Mailgun credentials
- ✅ **Fast Testing** - No network requests, instant responses
- ✅ **Offline Development** - Works without internet connection
- ✅ **Cost-Free** - No charges for test emails

### For CI/CD
- ✅ **Reliable** - No external dependencies or rate limits
- ✅ **Secure** - No sensitive credentials in CI environment
- ✅ **Predictable** - Consistent behavior across test runs
- ✅ **Comprehensive** - Test success and failure scenarios

### For Testing
- ✅ **Content Verification** - Inspect actual email content
- ✅ **Error Scenarios** - Test failure handling thoroughly
- ✅ **Performance** - Simulate network delays and timeouts
- ✅ **Integration** - Works seamlessly with existing test frameworks

## 🔄 Migration

Switching between mock and production is automatic based on environment:

```javascript
// This code works identically in both environments
import emailService from './services/emailServiceFactory.js';

const result = await emailService.sendWelcomeEmail('user@example.com');
if (result.success) {
    console.log('Email sent successfully!');
}
```

**Production Environment:**
- Uses real Mailgun API
- Sends actual emails
- Returns real message IDs

**Test Environment:**
- Uses mock service  
- Stores emails in memory
- Returns mock message IDs
- Identical API interface

This approach provides **seamless testing without code changes** and ensures your email functionality works correctly in both development and production! 🎉
