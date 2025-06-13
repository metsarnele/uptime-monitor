// tests/e2e/testDataFactory.js

/**
 * Test data factory for generating consistent test data
 */

/**
 * Generates a unique test email
 * @param {string} prefix - Optional prefix for the email
 * @returns {string} - A unique test email
 */
export function generateTestEmail(prefix = 'test') {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}@example.test`;
}

/**
 * Generates a secure test password
 * @returns {string} - A randomly generated password
 */
export function generateTestPassword() {
  const length = 12 + Math.floor(Math.random() * 8); // 12-20 characters
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
  let password = '';
  
  // Ensure at least one of each type
  password += chars.substring(0, 26).charAt(Math.floor(Math.random() * 26)); // uppercase
  password += chars.substring(26, 52).charAt(Math.floor(Math.random() * 26)); // lowercase
  password += chars.substring(52, 62).charAt(Math.floor(Math.random() * 10)); // digit
  password += chars.substring(62).charAt(Math.floor(Math.random() * 10)); // special
  
  // Fill the rest randomly
  for (let i = 4; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  // Shuffle the password characters
  return password.split('').sort(() => 0.5 - Math.random()).join('');
}

/**
 * Generates a test URL
 * @param {string} prefix - Optional prefix for the domain
 * @returns {string} - A unique test URL
 */
export function generateTestUrl(prefix = 'test') {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `https://${prefix}-${timestamp}-${random}.example.test`;
}

/**
 * Generates a monitor name
 * @param {string} prefix - Optional prefix for the monitor name
 * @returns {string} - A unique monitor name
 */
export function generateMonitorName(prefix = 'Monitor') {
  const timestamp = Date.now().toString().slice(-4);
  const random = Math.random().toString(36).substring(2, 5);
  return `${prefix} ${timestamp}-${random}`;
}

/**
 * Creates a test user object with all needed properties
 * @param {Object} overrides - Optional property overrides
 * @returns {Object} - A test user object
 */
export function createTestUser(overrides = {}) {
  return {
    email: generateTestEmail('user'),
    password: generateTestPassword(),
    ...overrides
  };
}

/**
 * Creates a test monitor object with all needed properties
 * @param {Object} overrides - Optional property overrides
 * @returns {Object} - A test monitor object
 */
export function createTestMonitor(overrides = {}) {
  return {
    url: generateTestUrl(),
    name: generateMonitorName(),
    notificationsEnabled: true,
    status: 'up',
    ...overrides
  };
}
