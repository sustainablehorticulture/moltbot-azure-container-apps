const sgMail = require('@sendgrid/mail');
const { EmailClient } = require('@azure/communication-email');

class EmailService {
    constructor() {
        this.sendGridClient = null;
        this.azureClient = null;
        this.initializeClients();
    }

    initializeClients() {
        // Initialize SendGrid client if API key is available
        if (process.env.SENDGRID_API_KEY) {
            sgMail.setApiKey(process.env.SENDGRID_API_KEY);
            this.sendGridClient = sgMail;
        }

        // Initialize Azure Communication client if connection string is available
        if (process.env.AZURE_COMMUNICATION_CONNECTION_STRING) {
            this.azureClient = new EmailClient(process.env.AZURE_COMMUNICATION_CONNECTION_STRING);
        }
    }

    async sendEmail(toEmail, subject, message, siteId = 'default') {
        const provider = process.env.EMAIL_PROVIDER || 'sendgrid';
        
        try {
            // Add site prefix to subject for tracking
            const siteSubject = `[${siteId.toUpperCase()}] ${subject}`;
            
            switch (provider.toLowerCase()) {
                case 'sendgrid':
                    return await this.sendViaSendGrid(toEmail, siteSubject, message, siteId);
                case 'azure':
                    return await this.sendViaAzure(toEmail, siteSubject, message, siteId);
                default:
                    throw new Error(`Unsupported email provider: ${provider}`);
            }
        } catch (error) {
            console.error(`Email sending failed for site ${siteId}:`, error);
            throw error;
        }
    }

    async sendViaSendGrid(toEmail, subject, message, siteId) {
        if (!this.sendGridClient) {
            throw new Error('SendGrid client not initialized. Check SENDGRID_API_KEY.');
        }

        try {
            const msg = {
                to: toEmail,
                from: process.env.FROM_EMAIL,
                subject: subject,
                text: message,
                html: this.generateHTMLMessage(message, siteId)
            };

            const result = await this.sendGridClient.send(msg);

            return {
                success: true,
                provider: 'sendgrid',
                messageId: result.headers['x-message-id'],
                to: toEmail,
                from: process.env.FROM_EMAIL,
                subject: subject,
                siteId,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                success: false,
                provider: 'sendgrid',
                error: error.message,
                to: toEmail,
                siteId,
                timestamp: new Date().toISOString()
            };
        }
    }

    async sendViaAzure(toEmail, subject, message, siteId) {
        if (!this.azureClient) {
            throw new Error('Azure Communication client not initialized. Check AZURE_COMMUNICATION_CONNECTION_STRING.');
        }

        try {
            const emailMessage = {
                senderAddress: process.env.FROM_EMAIL,
                content: {
                    subject: subject,
                    plainText: message,
                    html: this.generateHTMLMessage(message, siteId)
                },
                recipients: {
                    to: [{ address: toEmail }]
                }
            };

            const result = await this.azureClient.beginSend(emailMessage);
            const response = await result.pollUntilDone();

            return {
                success: true,
                provider: 'azure',
                messageId: response.id,
                to: toEmail,
                from: process.env.FROM_EMAIL,
                subject: subject,
                siteId,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                success: false,
                provider: 'azure',
                error: error.message,
                to: toEmail,
                siteId,
                timestamp: new Date().toISOString()
            };
        }
    }

    async sendBatchEmail(emails, subject, message, siteId = 'default') {
        const results = [];

        for (const email of emails) {
            try {
                const result = await this.sendEmail(email, subject, message, siteId);
                results.push(result);
            } catch (error) {
                results.push({
                    success: false,
                    error: error.message,
                    to: email,
                    siteId,
                    timestamp: new Date().toISOString()
                });
            }
        }

        return {
            siteId,
            total: emails.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results: results,
            timestamp: new Date().toISOString()
        };
    }

    generateHTMLMessage(message, siteId) {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Agricultural Alert - ${siteId}</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                }
                .header {
                    background: #2c3e50;
                    color: white;
                    padding: 20px;
                    text-align: center;
                    border-radius: 5px 5px 0 0;
                }
                .content {
                    background: #f9f9f9;
                    padding: 20px;
                    border: 1px solid #ddd;
                    border-top: none;
                }
                .footer {
                    background: #ecf0f1;
                    padding: 15px;
                    text-align: center;
                    border: 1px solid #ddd;
                    border-top: none;
                    border-radius: 0 0 5px 5px;
                    font-size: 12px;
                    color: #7f8c8d;
                }
                .alert-info {
                    background: #e8f4fd;
                    border-left: 4px solid #3498db;
                    padding: 10px;
                    margin: 10px 0;
                }
                .timestamp {
                    font-size: 12px;
                    color: #7f8c8d;
                    margin-top: 15px;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h2>🚜 Agricultural Alert System</h2>
                <p>Site: ${siteId.toUpperCase()}</p>
            </div>
            <div class="content">
                <div class="alert-info">
                    <strong>Alert Message:</strong><br>
                    ${message.replace(/\n/g, '<br>')}
                </div>
                <div class="timestamp">
                    Sent: ${new Date().toLocaleString()}
                </div>
            </div>
            <div class="footer">
                <p>This is an automated message from your Agricultural Monitoring System.</p>
                <p>If you have questions, please contact your system administrator.</p>
            </div>
        </body>
        </html>
        `;
    }

    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    async sendAlertEmail(recipients, alertData, siteId = 'default') {
        const { alertType, severity, message, deviceId, timestamp } = alertData;
        
        const subject = `${severity.toUpperCase()}: ${alertType} Alert`;
        const emailMessage = `
Alert Details:
- Type: ${alertType}
- Severity: ${severity}
- Device: ${deviceId || 'Unknown'}
- Message: ${message}
- Time: ${timestamp || new Date().toISOString()}

This alert was generated for site: ${siteId}

Please take appropriate action based on your standard operating procedures.
        `.trim();

        const emails = Array.isArray(recipients) ? recipients : [recipients];
        return await this.sendBatchEmail(emails, subject, emailMessage, siteId);
    }
}

module.exports = new EmailService();
