// services/emailServiceFactory.js
// Factory to provide the appropriate email service based on environment

import productionEmailService from './emailService.js';

// Dynamically import test email service only when needed
let testEmailService = null;

async function getTestEmailService() {
    if (!testEmailService) {
        const module = await import('./emailService.test.js');
        testEmailService = module.default;
    }
    return testEmailService;
}

/**
 * Returns the appropriate email service based on environment
 */
export async function getEmailService() {
    const isTestEnv = process.env.NODE_ENV === 'test' || 
                     process.env.NODE_ENV === 'ci' ||
                     process.env.EMAIL_TEST_MODE === 'true';
    
    if (isTestEnv) {
        return await getTestEmailService();
    }
    
    return productionEmailService;
}

// For backwards compatibility, export the production service as default
export default productionEmailService;
