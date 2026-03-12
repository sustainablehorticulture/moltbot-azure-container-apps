const { app } = require('@azure/functions');

// Import services
const smsService = require('../services/smsService');
const emailService = require('../services/emailService');
const alertProcessor = require('../services/alertProcessor');

// Multi-site alert processing with privacy isolation
app.http('alerts', {
    methods: ['POST', 'GET', 'PUT', 'DELETE'],
    authLevel: 'function',
    route: 'alerts/{action?}',
    handler: async (request, context) => {
        context.log('Multi-site alert function triggered');

        try {
            const method = request.method.toLowerCase();
            const action = request.params.action || 'process';
            const siteId = request.headers['x-site-id'] || request.query.siteId;

            // Validate site ID for privacy isolation
            if (!siteId) {
                return {
                    status: 400,
                    jsonBody: {
                        error: 'Bad Request',
                        message: 'Site ID is required (x-site-id header or siteId query parameter)'
                    }
                };
            }

            // Log with site isolation
            context.log(`Processing alert for site: ${siteId}, action: ${action}`);

            switch (action) {
                case 'process':
                    return await processAlert(request, context, siteId);

                case 'send':
                    return await sendNotification(request, context, siteId);

                case 'config':
                    return await handleConfig(request, context, siteId, method);

                case 'batch':
                    return await batchProcess(request, context, siteId);

                default:
                    return {
                        status: 404,
                        jsonBody: {
                            error: 'Not Found',
                            message: `Unknown action: ${action}. Available: process, send, config, batch`
                        }
                    };
            }

        } catch (error) {
            context.log.error(`Error in alerts function for site ${siteId}:`, error);
            return {
                status: 500,
                jsonBody: {
                    error: 'Internal Server Error',
                    message: error.message,
                    siteId: request.headers['x-site-id'] || 'unknown'
                }
            };
        }
    }
});

async function processAlert(request, context, siteId) {
    if (request.method !== 'POST') {
        return {
            status: 405,
            jsonBody: {
                error: 'Method Not Allowed',
                message: 'Only POST method is supported for alert processing'
            }
        };
    }

    const alertData = await request.json();
    
    // Validate required fields
    if (!alertData.sensorId || alertData.value === undefined) {
        return {
            status: 400,
            jsonBody: {
                error: 'Bad Request',
                message: 'Missing required fields: sensorId, value'
            }
        };
    }

    // Process alert with site isolation
    const processedAlert = await alertProcessor.processAlert(alertData, siteId);
    
    return {
        status: 200,
        jsonBody: {
            success: true,
            siteId,
            alertId: processedAlert.alertId,
            alertType: processedAlert.alertType,
            severity: processedAlert.severity,
            message: processedAlert.message,
            shouldNotify: processedAlert.shouldNotify,
            timestamp: new Date().toISOString()
        }
    };
}

async function sendNotification(request, context, siteId) {
    if (request.method !== 'POST') {
        return {
            status: 405,
            jsonBody: {
                error: 'Method Not Allowed',
                message: 'Only POST method is supported for sending notifications'
            }
        };
    }

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

    let results = [];

    try {
        switch (notificationData.type.toLowerCase()) {
            case 'sms':
                results = await Promise.all(
                    notificationData.recipients.map(recipient => 
                        smsService.sendSMS(recipient.phone, notificationData.message, siteId)
                    )
                );
                break;

            case 'email':
                results = await Promise.all(
                    notificationData.recipients.map(recipient => 
                        emailService.sendEmail(
                            recipient.email, 
                            notificationData.subject || 'Alert Notification',
                            notificationData.message,
                            siteId
                        )
                    )
                );
                break;

            case 'both':
                const smsResults = await Promise.all(
                    notificationData.recipients.filter(r => r.phone).map(recipient => 
                        smsService.sendSMS(recipient.phone, notificationData.message, siteId)
                    )
                );
                const emailResults = await Promise.all(
                    notificationData.recipients.filter(r => r.email).map(recipient => 
                        emailService.sendEmail(
                            recipient.email, 
                            notificationData.subject || 'Alert Notification',
                            notificationData.message,
                            siteId
                        )
                    )
                );
                results = [...smsResults, ...emailResults];
                break;

            default:
                return {
                    status: 400,
                    jsonBody: {
                        error: 'Bad Request',
                        message: 'Invalid notification type. Supported: sms, email, both'
                    }
                };
        }

        return {
            status: 200,
            jsonBody: {
                success: true,
                siteId,
                type: notificationData.type,
                sent: results.filter(r => r.success).length,
                failed: results.filter(r => !r.success).length,
                results: results,
                timestamp: new Date().toISOString()
            }
        };

    } catch (error) {
        context.log.error(`Failed to send notification for site ${siteId}:`, error);
        return {
            status: 500,
            jsonBody: {
                error: 'Notification Failed',
                message: error.message,
                siteId
            }
        };
    }
}

async function handleConfig(request, context, siteId, method) {
    switch (method) {
        case 'get':
            const config = await alertProcessor.getConfig(siteId);
            return {
                status: 200,
                jsonBody: {
                    siteId,
                    configurations: config,
                    timestamp: new Date().toISOString()
                }
            };

        case 'post':
            const configData = await request.json();
            const newConfig = await alertProcessor.updateConfig(configData, siteId);
            return {
                status: 201,
                jsonBody: {
                    success: true,
                    siteId,
                    configuration: newConfig,
                    timestamp: new Date().toISOString()
                }
            };

        case 'put':
            const updateData = await request.json();
            const updatedConfig = await alertProcessor.updateConfig(updateData, siteId);
            return {
                status: 200,
                jsonBody: {
                    success: true,
                    siteId,
                    configuration: updatedConfig,
                    timestamp: new Date().toISOString()
                }
            };

        default:
            return {
                status: 405,
                jsonBody: {
                    error: 'Method Not Allowed',
                    message: 'Only GET, POST, PUT methods are supported for config'
                }
            };
    }
}

async function batchProcess(request, context, siteId) {
    if (request.method !== 'POST') {
        return {
            status: 405,
            jsonBody: {
                error: 'Method Not Allowed',
                message: 'Only POST method is supported for batch processing'
            }
        };
    }

    const batchData = await request.json();
    
    if (!batchData.alerts || !Array.isArray(batchData.alerts)) {
        return {
            status: 400,
            jsonBody: {
                error: 'Bad Request',
                message: 'Missing or invalid alerts array'
            }
        };
    }

    const results = [];

    for (const alert of batchData.alerts) {
        try {
            const result = await alertProcessor.processAlert(alert, siteId);
            results.push({
                alert: alert,
                success: true,
                result: result,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            results.push({
                alert: alert,
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    return {
        status: 200,
        jsonBody: {
            success: true,
            siteId,
            total: batchData.alerts.length,
            processed: results.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results: results,
            timestamp: new Date().toISOString()
        }
    };
}
