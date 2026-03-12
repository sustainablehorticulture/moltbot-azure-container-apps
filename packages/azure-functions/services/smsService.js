const twilio = require('twilio');

// Initialize Twilio client
const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

// Azure Communication Services SMS client (alternative to Twilio)
const { SmsClient } = require("@azure/communication-sms");
const smsClient = process.env.AZURE_COMMUNICATION_CONNECTION_STRING 
    ? new SmsClient(process.env.AZURE_COMMUNICATION_CONNECTION_STRING)
    : null;

class SMSService {
    constructor() {
        this.provider = process.env.SMS_PROVIDER || 'twilio'; // 'twilio' or 'azure'
    }

    async sendSMS(phoneNumber, message, options = {}) {
        try {
            switch (this.provider) {
                case 'twilio':
                    return await this.sendTwilioSMS(phoneNumber, message, options);
                case 'azure':
                    return await this.sendAzureSMS(phoneNumber, message, options);
                default:
                    throw new Error(`Unsupported SMS provider: ${this.provider}`);
            }
        } catch (error) {
            console.error(`Failed to send SMS to ${phoneNumber}:`, error);
            throw error;
        }
    }

    async sendTwilioSMS(phoneNumber, message, options = {}) {
        try {
            const twilioMessage = await twilioClient.messages.create({
                body: message,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: this.formatPhoneNumber(phoneNumber),
                ...options
            });

            return {
                success: true,
                messageId: twilioMessage.sid,
                status: twilioMessage.status,
                provider: 'twilio',
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            throw new Error(`Twilio SMS failed: ${error.message}`);
        }
    }

    async sendAzureSMS(phoneNumber, message, options = {}) {
        if (!smsClient) {
            throw new Error('Azure Communication Services not configured');
        }

        try {
            const sendResults = await smsClient.send({
                from: process.env.AZURE_PHONE_NUMBER,
                to: [this.formatPhoneNumber(phoneNumber)],
                message: message
            });

            const result = sendResults[0]; // Azure returns array for multiple recipients

            return {
                success: result.successful,
                messageId: result.messageId,
                status: result.successful ? 'sent' : 'failed',
                provider: 'azure',
                timestamp: new Date().toISOString(),
                errorCode: result.successful ? null : result.errorMessage
            };
        } catch (error) {
            throw new Error(`Azure SMS failed: ${error.message}`);
        }
    }

    async sendBulkSMS(phoneNumbers, message, options = {}) {
        const results = [];
        
        for (const phoneNumber of phoneNumbers) {
            try {
                const result = await this.sendSMS(phoneNumber, message, options);
                results.push({ phoneNumber, ...result });
            } catch (error) {
                results.push({ 
                    phoneNumber, 
                    success: false, 
                    error: error.message,
                    provider: this.provider,
                    timestamp: new Date().toISOString()
                });
            }
        }

        return {
            total: phoneNumbers.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results: results
        };
    }

    formatPhoneNumber(phoneNumber) {
        // Remove any non-digit characters and ensure proper format
        let cleaned = phoneNumber.replace(/\D/g, '');
        
        // Add country code if missing (assuming US/Canada format)
        if (cleaned.length === 10) {
            cleaned = '+1' + cleaned;
        } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
            cleaned = '+' + cleaned;
        } else if (!cleaned.startsWith('+')) {
            cleaned = '+' + cleaned;
        }
        
        return cleaned;
    }

    validatePhoneNumber(phoneNumber) {
        const phoneRegex = /^\+?[1-9]\d{1,14}$/;
        return phoneRegex.test(this.formatPhoneNumber(phoneNumber));
    }

    async getDeliveryStatus(messageId, provider = this.provider) {
        try {
            switch (provider) {
                case 'twilio':
                    const message = await twilioClient.messages(messageId).fetch();
                    return {
                        messageId: message.sid,
                        status: message.status,
                        errorCode: message.errorCode,
                        errorMessage: message.errorMessage,
                        dateCreated: message.dateCreated,
                        dateUpdated: message.dateUpdated,
                        provider: 'twilio'
                    };
                    
                case 'azure':
                    // Azure SMS doesn't provide detailed status tracking like Twilio
                    return {
                        messageId: messageId,
                        status: 'delivered', // Assumption for Azure
                        provider: 'azure',
                        note: 'Azure Communication Services provides limited status tracking'
                    };
                    
                default:
                    throw new Error(`Unsupported provider: ${provider}`);
            }
        } catch (error) {
            throw new Error(`Failed to get delivery status: ${error.message}`);
        }
    }

    // Vineyard-specific alert templates
    async sendVineyardAlert(phoneNumber, alertType, sensorData, location) {
        const templates = {
            'high_temperature': {
                message: `🌡️ HIGH TEMP ALERT: ${location} - Current: ${sensorData.value}°C, Threshold: ${sensorData.threshold}°C. Immediate attention required!`
            },
            'low_humidity': {
                message: `💧 LOW HUMIDITY ALERT: ${location} - Current: ${sensorData.value}%, Threshold: ${sensorData.threshold}%. Consider irrigation.`
            },
            'soil_moisture': {
                message: `🌱 SOIL MOISTURE ALERT: ${location} - Current: ${sensorData.value}%, Threshold: ${sensorData.threshold}%. Irrigation recommended.`
            },
            'frost_warning': {
                message: `❄️ FROST WARNING: ${location} - Temperature: ${sensorData.value}°C. Frost protection measures advised.`
            },
            'sensor_offline': {
                message: `📡 SENSOR OFFLINE: ${location} - Sensor ${sensorData.sensorId} hasn't reported data since ${sensorData.lastSeen}. Check connectivity.`
            },
            'water_stress': {
                message: `🚰 WATER STRESS ALERT: ${location} - CWI: ${sensorData.cwi}, Threshold: ${sensorData.threshold}. Increased irrigation needed.`
            }
        };

        const template = templates[alertType] || {
            message: `🍇 VINEYARD ALERT: ${location} - ${alertType}: ${sensorData.value} (Threshold: ${sensorData.threshold})`
        };

        return await this.sendSMS(phoneNumber, template.message);
    }

    async sendDailySummary(phoneNumber, summaryData) {
        const message = `📊 Daily Vineyard Summary - ${summaryData.date}
        
🌡️ Avg Temp: ${summaryData.avgTemp}°C
💧 Avg Humidity: ${summaryData.avgHumidity}%
🌱 Soil Moisture: ${summaryData.soilMoisture}%
🚰 CWI: ${summaryData.cwi}

Alerts Today: ${summaryData.alertCount}
Status: ${summaryData.overallStatus}

Reply STOP to unsubscribe`;

        return await this.sendSMS(phoneNumber, message);
    }
}

module.exports = new SMSService();
