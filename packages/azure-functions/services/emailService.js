const sgMail = require('@sendgrid/mail');

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Azure Communication Services Email client (alternative to SendGrid)
const { EmailClient } = require("@azure/communication-email");
const emailClient = process.env.AZURE_COMMUNICATION_CONNECTION_STRING 
    ? new EmailClient(process.env.AZURE_COMMUNICATION_CONNECTION_STRING)
    : null;

class EmailService {
    constructor() {
        this.provider = process.env.EMAIL_PROVIDER || 'sendgrid'; // 'sendgrid' or 'azure'
        this.fromEmail = process.env.FROM_EMAIL || 'noreply@vineyard-monitoring.com';
        this.fromName = process.env.FROM_NAME || 'Vineyard Monitoring System';
    }

    async sendEmail(toEmail, subject, htmlContent, textContent = null, options = {}) {
        try {
            switch (this.provider) {
                case 'sendgrid':
                    return await this.sendSendGridEmail(toEmail, subject, htmlContent, textContent, options);
                case 'azure':
                    return await this.sendAzureEmail(toEmail, subject, htmlContent, textContent, options);
                default:
                    throw new Error(`Unsupported email provider: ${this.provider}`);
            }
        } catch (error) {
            console.error(`Failed to send email to ${toEmail}:`, error);
            throw error;
        }
    }

    async sendSendGridEmail(toEmail, subject, htmlContent, textContent = null, options = {}) {
        const msg = {
            to: toEmail,
            from: {
                email: this.fromEmail,
                name: this.fromName
            },
            subject: subject,
            html: htmlContent,
            text: textContent || this.htmlToText(htmlContent),
            ...options
        };

        try {
            const response = await sgMail.send(msg);
            
            return {
                success: true,
                messageId: response[0]?.headers?.['x-message-id'],
                provider: 'sendgrid',
                timestamp: new Date().toISOString(),
                statusCode: response[0]?.statusCode
            };
        } catch (error) {
            if (error.response) {
                throw new Error(`SendGrid API error: ${error.response.body}`);
            }
            throw error;
        }
    }

    async sendAzureEmail(toEmail, subject, htmlContent, textContent = null, options = {}) {
        if (!emailClient) {
            throw new Error('Azure Communication Services not configured');
        }

        try {
            const emailMessage = {
                senderAddress: this.fromEmail,
                content: {
                    subject: subject,
                    html: htmlContent,
                    plainText: textContent || this.htmlToText(htmlContent)
                },
                recipients: {
                    to: [
                        {
                            address: toEmail,
                            displayName: options.recipientName || toEmail
                        }
                    ]
                }
            };

            const response = await emailClient.beginSend(emailMessage);
            const result = await response.pollUntilDone();

            return {
                success: true,
                messageId: result.id,
                provider: 'azure',
                timestamp: new Date().toISOString(),
                status: result.status
            };
        } catch (error) {
            throw new Error(`Azure Email failed: ${error.message}`);
        }
    }

    async sendBulkEmail(emailAddresses, subject, htmlContent, textContent = null, options = {}) {
        const results = [];
        
        for (const email of emailAddresses) {
            try {
                const result = await this.sendEmail(email, subject, htmlContent, textContent, options);
                results.push({ email, ...result });
            } catch (error) {
                results.push({ 
                    email, 
                    success: false, 
                    error: error.message,
                    provider: this.provider,
                    timestamp: new Date().toISOString()
                });
            }
        }

        return {
            total: emailAddresses.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results: results
        };
    }

    htmlToText(html) {
        return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    }

    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // Vineyard-specific email templates
    async sendVineyardAlert(toEmail, alertType, sensorData, location, recipientName = null) {
        const templates = {
            'high_temperature': {
                subject: `🌡️ High Temperature Alert - ${location}`,
                html: this.generateAlertHTML('High Temperature', alertType, sensorData, location, 'warning'),
                text: `HIGH TEMPERATURE ALERT: ${location} - Current: ${sensorData.value}°C, Threshold: ${sensorData.threshold}°C. Immediate attention required!`
            },
            'low_humidity': {
                subject: `💧 Low Humidity Alert - ${location}`,
                html: this.generateAlertHTML('Low Humidity', alertType, sensorData, location, 'info'),
                text: `LOW HUMIDITY ALERT: ${location} - Current: ${sensorData.value}%, Threshold: ${sensorData.threshold}%. Consider irrigation.`
            },
            'soil_moisture': {
                subject: `🌱 Soil Moisture Alert - ${location}`,
                html: this.generateAlertHTML('Soil Moisture', alertType, sensorData, location, 'info'),
                text: `SOIL MOISTURE ALERT: ${location} - Current: ${sensorData.value}%, Threshold: ${sensorData.threshold}%. Irrigation recommended.`
            },
            'frost_warning': {
                subject: `❄️ Frost Warning - ${location}`,
                html: this.generateAlertHTML('Frost Warning', alertType, sensorData, location, 'danger'),
                text: `FROST WARNING: ${location} - Temperature: ${sensorData.value}°C. Frost protection measures advised.`
            },
            'sensor_offline': {
                subject: `📡 Sensor Offline - ${location}`,
                html: this.generateAlertHTML('Sensor Offline', alertType, sensorData, location, 'warning'),
                text: `SENSOR OFFLINE: ${location} - Sensor ${sensorData.sensorId} hasn't reported data since ${sensorData.lastSeen}. Check connectivity.`
            },
            'water_stress': {
                subject: `🚰 Water Stress Alert - ${location}`,
                html: this.generateAlertHTML('Water Stress', alertType, sensorData, location, 'warning'),
                text: `WATER STRESS ALERT: ${location} - CWI: ${sensorData.cwi}, Threshold: ${sensorData.threshold}. Increased irrigation needed.`
            }
        };

        const template = templates[alertType] || {
            subject: `🍇 Vineyard Alert - ${location}`,
            html: this.generateAlertHTML('Vineyard Alert', alertType, sensorData, location, 'primary'),
            text: `VINEYARD ALERT: ${location} - ${alertType}: ${sensorData.value} (Threshold: ${sensorData.threshold})`
        };

        return await this.sendEmail(toEmail, template.subject, template.html, template.text, { recipientName });
    }

    generateAlertHTML(alertTitle, alertType, sensorData, location, alertLevel) {
        const alertColors = {
            'danger': '#dc3545',
            'warning': '#ffc107', 
            'info': '#17a2b8',
            'primary': '#007bff'
        };

        const color = alertColors[alertLevel] || alertColors.primary;
        const timestamp = new Date().toLocaleString();

        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vineyard Alert</title>
</head>
<body style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f8f9fa;">
    <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); overflow: hidden;">
        
        <!-- Header -->
        <div style="background-color: ${color}; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">🍇 ${alertTitle}</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">${location}</p>
        </div>
        
        <!-- Content -->
        <div style="padding: 30px;">
            <div style="background-color: #f8f9fa; border-left: 4px solid ${color}; padding: 20px; margin-bottom: 20px;">
                <h3 style="margin: 0 0 10px 0; color: #333;">Alert Details</h3>
                <p style="margin: 5px 0;"><strong>Alert Type:</strong> ${alertType.replace('_', ' ').toUpperCase()}</p>
                <p style="margin: 5px 0;"><strong>Current Value:</strong> <span style="font-size: 18px; color: ${color}; font-weight: bold;">${sensorData.value}</span></p>
                <p style="margin: 5px 0;"><strong>Threshold:</strong> ${sensorData.threshold}</p>
                <p style="margin: 5px 0;"><strong>Sensor ID:</strong> ${sensorData.sensorId || 'N/A'}</p>
                <p style="margin: 5px 0;"><strong>Time:</strong> ${timestamp}</p>
            </div>
            
            <div style="margin-bottom: 20px;">
                <h3 style="margin: 0 0 10px 0; color: #333;">Recommended Actions</h3>
                <ul style="margin: 0; padding-left: 20px; color: #666;">
                    ${this.getRecommendations(alertType)}
                </ul>
            </div>
            
            <div style="text-align: center; margin-top: 30px;">
                <a href="#" style="background-color: ${color}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">View Dashboard</a>
            </div>
        </div>
        
        <!-- Footer -->
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #dee2e6;">
            <p style="margin: 0; color: #666; font-size: 14px;">This alert was sent by the Vineyard Monitoring System</p>
            <p style="margin: 5px 0 0 0; color: #999; font-size: 12px;">If you no longer wish to receive these alerts, please contact your system administrator</p>
        </div>
    </div>
</body>
</html>`;
    }

    getRecommendations(alertType) {
        const recommendations = {
            'high_temperature': '<li>Check irrigation system</li><li>Consider shade cloth if available</li><li>Monitor for heat stress symptoms</li>',
            'low_humidity': '<li>Increase irrigation frequency</li><li>Check for irrigation system leaks</li><li>Monitor plant water status</li>',
            'soil_moisture': '<li>Start irrigation immediately</li><li>Check soil moisture at different depths</li><li>Adjust irrigation schedule</li>',
            'frost_warning': '<li>Activate frost protection systems</li><li>Monitor temperature closely</li><li>Consider wind machines if available</li>',
            'sensor_offline': '<li>Check sensor power supply</li><li>Verify network connectivity</li><li>Inspect sensor for physical damage</li>',
            'water_stress': '<li>Increase irrigation duration</li><li>Check soil moisture levels</li><li>Monitor plant stress indicators</li>'
        };

        return recommendations[alertType] || '<li>Check sensor readings</li><li>Verify system status</li><li>Contact support if needed</li>';
    }

    async sendDailyReport(toEmail, reportData, recipientName = null) {
        const subject = `📊 Daily Vineyard Report - ${reportData.date}`;
        
        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Daily Vineyard Report</title>
</head>
<body style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f8f9fa;">
    <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); overflow: hidden;">
        
        <!-- Header -->
        <div style="background-color: #28a745; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">📊 Daily Vineyard Report</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">${reportData.date}</p>
        </div>
        
        <!-- Content -->
        <div style="padding: 30px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                <div style="background-color: #f8f9fa; padding: 15px; border-radius: 4px;">
                    <h4 style="margin: 0 0 10px 0; color: #333;">🌡️ Temperature</h4>
                    <p style="margin: 5px 0; font-size: 18px; font-weight: bold; color: #28a745;">${reportData.avgTemp}°C</p>
                    <p style="margin: 0; color: #666; font-size: 14px;">Average</p>
                </div>
                <div style="background-color: #f8f9fa; padding: 15px; border-radius: 4px;">
                    <h4 style="margin: 0 0 10px 0; color: #333;">💧 Humidity</h4>
                    <p style="margin: 5px 0; font-size: 18px; font-weight: bold; color: #007bff;">${reportData.avgHumidity}%</p>
                    <p style="margin: 0; color: #666; font-size: 14px;">Average</p>
                </div>
                <div style="background-color: #f8f9fa; padding: 15px; border-radius: 4px;">
                    <h4 style="margin: 0 0 10px 0; color: #333;">🌱 Soil Moisture</h4>
                    <p style="margin: 5px 0; font-size: 18px; font-weight: bold; color: #ffc107;">${reportData.soilMoisture}%</p>
                    <p style="margin: 0; color: #666; font-size: 14px;">Current Level</p>
                </div>
                <div style="background-color: #f8f9fa; padding: 15px; border-radius: 4px;">
                    <h4 style="margin: 0 0 10px 0; color: #333;">🚰 CWI</h4>
                    <p style="margin: 5px 0; font-size: 18px; font-weight: bold; color: #17a2b8;">${reportData.cwi}</p>
                    <p style="margin: 0; color: #666; font-size: 14px;">Crop Water Index</p>
                </div>
            </div>
            
            <div style="background-color: #e7f3ff; border-left: 4px solid #007bff; padding: 20px; margin-bottom: 20px;">
                <h3 style="margin: 0 0 10px 0; color: #333;">Summary</h3>
                <p style="margin: 5px 0;"><strong>Alerts Today:</strong> ${reportData.alertCount}</p>
                <p style="margin: 5px 0;"><strong>Overall Status:</strong> <span style="color: ${reportData.overallStatus === 'Good' ? '#28a745' : '#ffc107'}; font-weight: bold;">${reportData.overallStatus}</span></p>
                <p style="margin: 5px 0;"><strong>Active Sensors:</strong> ${reportData.activeSensors}/${reportData.totalSensors}</p>
            </div>
            
            <div style="text-align: center; margin-top: 30px;">
                <a href="#" style="background-color: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">View Full Dashboard</a>
            </div>
        </div>
        
        <!-- Footer -->
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #dee2e6;">
            <p style="margin: 0; color: #666; font-size: 14px;">This report was generated by the Vineyard Monitoring System</p>
        </div>
    </div>
</body>
</html>`;

        const text = `Daily Vineyard Report - ${reportData.date}

Temperature: ${reportData.avgTemp}°C (Average)
Humidity: ${reportData.avgHumidity}% (Average)
Soil Moisture: ${reportData.soilMoisture}% (Current)
CWI: ${reportData.cwi}

Summary:
- Alerts Today: ${reportData.alertCount}
- Overall Status: ${reportData.overallStatus}
- Active Sensors: ${reportData.activeSensors}/${reportData.totalSensors}

View full dashboard for detailed information.`;

        return await this.sendEmail(toEmail, subject, html, text, { recipientName });
    }
}

module.exports = new EmailService();
