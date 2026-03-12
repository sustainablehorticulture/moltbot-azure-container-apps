const twilio = require('twilio');
const { SmsClient } = require('@azure/communication-sms');

class SMSService {
    constructor() {
        this.twilioClient = null;
        this.azureClient = null;
        this.initializeClients();
    }

    initializeClients() {
        // Initialize Twilio client if credentials are available
        if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
            this.twilioClient = twilio(
                process.env.TWILIO_ACCOUNT_SID,
                process.env.TWILIO_AUTH_TOKEN
            );
        }

        // Initialize Azure Communication client if credentials are available
        if (process.env.AZURE_COMMUNICATION_CONNECTION_STRING) {
            this.azureClient = new SmsClient(process.env.AZURE_COMMUNICATION_CONNECTION_STRING);
        }
    }

    async sendSMS(phoneNumber, message, siteId = 'default') {
        const provider = process.env.SMS_PROVIDER || 'twilio';
        
        try {
            // Add site prefix to message for tracking
            const siteMessage = `[${siteId.toUpperCase()}] ${message}`;
            
            switch (provider.toLowerCase()) {
                case 'twilio':
                    return await this.sendViaTwilio(phoneNumber, siteMessage, siteId);
                case 'azure':
                    return await this.sendViaAzure(phoneNumber, siteMessage, siteId);
                default:
                    throw new Error(`Unsupported SMS provider: ${provider}`);
            }
        } catch (error) {
            console.error(`SMS sending failed for site ${siteId}:`, error);
            throw error;
        }
    }

    async sendViaTwilio(phoneNumber, message, siteId) {
        if (!this.twilioClient) {
            throw new Error('Twilio client not initialized. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.');
        }

        try {
            const result = await this.twilioClient.messages.create({
                body: message,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: phoneNumber
            });

            return {
                success: true,
                provider: 'twilio',
                messageId: result.sid,
                to: phoneNumber,
                from: process.env.TWILIO_PHONE_NUMBER,
                siteId,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                success: false,
                provider: 'twilio',
                error: error.message,
                to: phoneNumber,
                siteId,
                timestamp: new Date().toISOString()
            };
        }
    }

    async sendViaAzure(phoneNumber, message, siteId) {
        if (!this.azureClient) {
            throw new Error('Azure Communication client not initialized. Check AZURE_COMMUNICATION_CONNECTION_STRING.');
        }

        try {
            const sendResults = await this.azureClient.send({
                from: process.env.AZURE_PHONE_NUMBER,
                to: [phoneNumber],
                message: message
            });

            const result = sendResults[0]; // Azure returns array of results

            if (result.successful) {
                return {
                    success: true,
                    provider: 'azure',
                    messageId: result.messageId,
                    to: phoneNumber,
                    from: process.env.AZURE_PHONE_NUMBER,
                    siteId,
                    timestamp: new Date().toISOString()
                };
            } else {
                return {
                    success: false,
                    provider: 'azure',
                    error: result.errorMessage || 'Unknown Azure SMS error',
                    to: phoneNumber,
                    siteId,
                    timestamp: new Date().toISOString()
                };
            }
        } catch (error) {
            return {
                success: false,
                provider: 'azure',
                error: error.message,
                to: phoneNumber,
                siteId,
                timestamp: new Date().toISOString()
            };
        }
    }

    async sendBatchSMS(phoneNumbers, message, siteId = 'default') {
        const results = [];

        for (const phoneNumber of phoneNumbers) {
            try {
                const result = await this.sendSMS(phoneNumber, message, siteId);
                results.push(result);
            } catch (error) {
                results.push({
                    success: false,
                    error: error.message,
                    to: phoneNumber,
                    siteId,
                    timestamp: new Date().toISOString()
                });
            }
        }

        return {
            siteId,
            total: phoneNumbers.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results: results,
            timestamp: new Date().toISOString()
        };
    }

    validatePhoneNumber(phoneNumber) {
        // Basic phone number validation
        const phoneRegex = /^\+?[1-9]\d{1,14}$/;
        return phoneRegex.test(phoneNumber.replace(/[\s\-\(\)]/g, ''));
    }

    formatPhoneNumber(phoneNumber) {
        // Format phone number to E.164 format
        const cleaned = phoneNumber.replace(/[\s\-\(\)]/g, '');
        if (!cleaned.startsWith('+')) {
            // Add default country code if needed (you may want to make this configurable)
            return cleaned.startsWith('1') ? `+${cleaned}` : `+1${cleaned}`;
        }
        return cleaned;
    }
}

module.exports = new SMSService();
