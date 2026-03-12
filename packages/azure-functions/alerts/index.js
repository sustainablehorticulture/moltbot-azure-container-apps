const { app } = require('@azure/functions');

// Environment variables
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL;
const AZURE_COMMUNICATION_CONNECTION_STRING = process.env.AZURE_COMMUNICATION_CONNECTION_STRING;

// Import notification services
const smsService = require('../services/smsService');
const emailService = require('../services/emailService');
const alertProcessor = require('../services/alertProcessor');

app.http('alertProcessor', {
    methods: ['POST'],
    authLevel: 'function',
    route: 'alerts/process',
    handler: async (request, context) => {
        context.log('Alert processing function triggered');
        
        try {
            const alertData = await request.json();
            
            // Validate alert data
            if (!alertData.sensorId || !alertData.value || !alertData.threshold) {
                return {
                    status: 400,
                    jsonBody: {
                        error: 'Bad Request',
                        message: 'Missing required fields: sensorId, value, threshold'
                    }
                };
            }
            
            // Process the alert
            const processedAlert = await alertProcessor.processAlert(alertData);
            
            // Queue notifications
            const notificationQueue = {
                alertId: processedAlert.id,
                notifications: processedAlert.notifications
            };
            
            return {
                status: 200,
                jsonBody: {
                    message: 'Alert processed successfully',
                    alertId: processedAlert.id,
                    notificationsQueued: processedAlert.notifications.length
                }
            };
            
        } catch (error) {
            context.log.error('Error processing alert:', error);
            return {
                status: 500,
                jsonBody: {
                    error: 'Internal Server Error',
                    message: error.message
                }
            };
        }
    }
});

app.http('sendNotification', {
    methods: ['POST'],
    authLevel: 'function',
    route: 'alerts/send',
    handler: async (request, context) => {
        context.log('Send notification function triggered');
        
        try {
            const notificationData = await request.json();
            
            // Validate notification data
            if (!notificationData.type || !notificationData.recipients || !notificationData.message) {
                return {
                    status: 400,
                    jsonBody: {
                        error: 'Bad Request',
                        message: 'Missing required fields: type, recipients, message'
                    }
                };
            }
            
            const results = [];
            
            // Send notifications based on type
            for (const recipient of notificationData.recipients) {
                try {
                    if (notificationData.type === 'sms') {
                        const result = await smsService.sendSMS(recipient.phone, notificationData.message);
                        results.push({ recipient: recipient.phone, type: 'sms', success: true, result });
                    } else if (notificationData.type === 'email') {
                        const result = await emailService.sendEmail(recipient.email, notificationData.subject, notificationData.message);
                        results.push({ recipient: recipient.email, type: 'email', success: true, result });
                    }
                } catch (error) {
                    context.log.error(`Failed to send ${notificationData.type} to ${notificationData.type === 'sms' ? recipient.phone : recipient.email}:`, error);
                    results.push({ 
                        recipient: notificationData.type === 'sms' ? recipient.phone : recipient.email, 
                        type: notificationData.type, 
                        success: false, 
                        error: error.message 
                    });
                }
            }
            
            return {
                status: 200,
                jsonBody: {
                    message: 'Notifications processed',
                    results: results
                }
            };
            
        } catch (error) {
            context.log.error('Error sending notifications:', error);
            return {
                status: 500,
                jsonBody: {
                    error: 'Internal Server Error',
                    message: error.message
                }
            };
        }
    }
});

app.http('configureAlerts', {
    methods: ['POST', 'GET', 'PUT', 'DELETE'],
    authLevel: 'function',
    route: 'alerts/config/{sensorId?}',
    handler: async (request, context) => {
        context.log('Alert configuration function triggered');
        
        try {
            const method = request.method.toLowerCase();
            const sensorId = request.params.sensorId;
            
            switch (method) {
                case 'get':
                    if (sensorId) {
                        const config = await alertProcessor.getAlertConfig(sensorId);
                        return {
                            status: 200,
                            jsonBody: config
                        };
                    } else {
                        const allConfigs = await alertProcessor.getAllAlertConfigs();
                        return {
                            status: 200,
                            jsonBody: allConfigs
                        };
                    }
                    
                case 'post':
                    const configData = await request.json();
                    const newConfig = await alertProcessor.createAlertConfig(configData);
                    return {
                        status: 201,
                        jsonBody: newConfig
                    };
                    
                case 'put':
                    if (!sensorId) {
                        return {
                            status: 400,
                            jsonBody: {
                                error: 'Bad Request',
                                message: 'sensorId is required for PUT requests'
                            }
                        };
                    }
                    const updateData = await request.json();
                    const updatedConfig = await alertProcessor.updateAlertConfig(sensorId, updateData);
                    return {
                        status: 200,
                        jsonBody: updatedConfig
                    };
                    
                case 'delete':
                    if (!sensorId) {
                        return {
                            status: 400,
                            jsonBody: {
                                error: 'Bad Request',
                                message: 'sensorId is required for DELETE requests'
                            }
                        };
                    }
                    await alertProcessor.deleteAlertConfig(sensorId);
                    return {
                        status: 204,
                        jsonBody: null
                    };
                    
                default:
                    return {
                        status: 405,
                        jsonBody: {
                            error: 'Method Not Allowed',
                            message: 'Only GET, POST, PUT, DELETE methods are supported'
                        }
                    };
            }
            
        } catch (error) {
            context.log.error('Error in alert configuration:', error);
            return {
                status: 500,
                jsonBody: {
                    error: 'Internal Server Error',
                    message: error.message
                }
            };
        }
    }
});

app.http('testNotifications', {
    methods: ['POST'],
    authLevel: 'function',
    route: 'alerts/test',
    handler: async (request, context) => {
        context.log('Test notification function triggered');
        
        try {
            const testData = await request.json();
            
            // Send test notifications
            const results = [];
            
            if (testData.testSMS && testData.phone) {
                try {
                    const result = await smsService.sendSMS(testData.phone, 'Test SMS from Vineyard Monitoring System');
                    results.push({ type: 'sms', success: true, result });
                } catch (error) {
                    results.push({ type: 'sms', success: false, error: error.message });
                }
            }
            
            if (testData.testEmail && testData.email) {
                try {
                    const result = await emailService.sendEmail(testData.email, 'Test Email', 'This is a test email from the Vineyard Monitoring System');
                    results.push({ type: 'email', success: true, result });
                } catch (error) {
                    results.push({ type: 'email', success: false, error: error.message });
                }
            }
            
            return {
                status: 200,
                jsonBody: {
                    message: 'Test notifications completed',
                    results: results
                }
            };
            
        } catch (error) {
            context.log.error('Error in test notifications:', error);
            return {
                status: 500,
                jsonBody: {
                    error: 'Internal Server Error',
                    message: error.message
                }
            };
        }
    }
});
