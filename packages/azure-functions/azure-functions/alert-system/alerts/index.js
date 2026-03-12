const { app } = require('@azure/functions');

// Import services
const smsService = require('../services/smsService');
const emailService = require('../services/emailService');
const alertProcessor = require('../services/alertProcessor');
const pendingActions = require('../services/pendingActions');

// Multi-site alert processing with privacy isolation
app.http('alertSystem', {
    methods: ['POST', 'GET', 'PUT', 'DELETE'],
    authLevel: 'function',
    route: 'alerts/{action?}',
    handler: async (request, context) => {
        context.log('Multi-site alert system function triggered');

        try {
            const method = request.method.toLowerCase();
            const action = request.params.action || 'process';
            const url = new URL(request.url);
            const siteId = request.headers.get('x-site-id') || url.searchParams.get('siteId');

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

                case 'history':
                    return await getAlertHistory(request, context, siteId);

                case 'statistics':
                    return await getAlertStatistics(request, context, siteId);

                case 'actionable':
                    return await sendActionableAlert(request, context, siteId);

                case 'pending-actions':
                    return await getPendingActions(request, context, siteId);

                default:
                    return {
                        status: 404,
                        jsonBody: {
                            error: 'Not Found',
                            message: `Unknown action: ${action}. Available: process, send, config, batch, history, statistics`
                        }
                    };
            }

        } catch (error) {
            context.log.error(`Error in alert system function:`, error);
            return {
                status: 500,
                jsonBody: {
                    error: 'Internal Server Error',
                    message: error.message,
                    siteId: request.headers.get('x-site-id') || 'unknown'
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

async function getAlertHistory(request, context, siteId) {
    if (request.method !== 'get') {
        return {
            status: 405,
            jsonBody: {
                error: 'Method Not Allowed',
                message: 'Only GET method is supported for alert history'
            }
        };
    }

    const sensorId = request.query.sensorId;
    const limit = parseInt(request.query.limit) || 100;

    try {
        const history = alertProcessor.getAlertHistory(siteId, sensorId, limit);
        
        return {
            status: 200,
            jsonBody: {
                siteId,
                sensorId: sensorId || 'all',
                history: history,
                total: history.length,
                timestamp: new Date().toISOString()
            }
        };
    } catch (error) {
        return {
            status: 500,
            jsonBody: {
                error: 'Failed to get alert history',
                message: error.message,
                siteId
            }
        };
    }
}

async function getAlertStatistics(request, context, siteId) {
    if (request.method !== 'get') {
        return {
            status: 405,
            jsonBody: {
                error: 'Method Not Allowed',
                message: 'Only GET method is supported for alert statistics'
            }
        };
    }

    const timeRange = request.query.timeRange || '24h';

    try {
        const statistics = alertProcessor.getAlertStatistics(siteId, timeRange);
        
        return {
            status: 200,
            jsonBody: {
                ...statistics,
                timestamp: new Date().toISOString()
            }
        };
    } catch (error) {
        return {
            status: 500,
            jsonBody: {
                error: 'Failed to get alert statistics',
                message: error.message,
                siteId
            }
        };
    }
}

async function sendActionableAlert(request, context, siteId) {
    if (request.method !== 'POST') {
        return {
            status: 405,
            jsonBody: { error: 'Method Not Allowed', message: 'Only POST is supported' }
        };
    }

    const body = await request.json();

    // Validate required fields
    if (!body.phone || !body.message || !body.yesAction) {
        return {
            status: 400,
            jsonBody: {
                error: 'Bad Request',
                message: 'Required fields: phone, message, yesAction. Optional: noAction, expiresInMinutes',
                example: {
                    phone: '+61467413589',
                    message: 'High temp in greenhouse! Reply YES to turn on cooling fan.',
                    yesAction: {
                        type: 'lorawan-relay',
                        siteId: 'grassgumfarm',
                        deviceId: 'grassgumfarmiocontrol1',
                        relayId: 1,
                        state: true,
                        description: 'Turn on cooling fan'
                    },
                    noAction: null,
                    expiresInMinutes: 30
                }
            }
        };
    }

    try {
        // Create the pending action
        const pendingAction = pendingActions.createPendingAction(
            body.phone,
            siteId,
            body.yesAction,
            body.noAction || null,
            body.expiresInMinutes || 30
        );

        // Build the SMS message with reply instruction
        const yesDescription = body.yesAction.description || body.yesAction.type;
        const replyInstruction = `\nReply YES to: ${yesDescription}\nReply NO to dismiss.`;
        const fullMessage = body.message + replyInstruction;

        // Send the SMS
        const smsResult = await smsService.sendSMS(body.phone, fullMessage, siteId);

        context.log(`Actionable alert sent to ${body.phone} for site ${siteId}, action ID: ${pendingAction.id}`);

        return {
            status: 200,
            jsonBody: {
                success: true,
                siteId,
                actionId: pendingAction.id,
                phone: body.phone,
                expiresAt: pendingAction.expiresAt,
                smsResult,
                timestamp: new Date().toISOString()
            }
        };

    } catch (error) {
        context.log.error(`Failed to send actionable alert for site ${siteId}:`, error);
        return {
            status: 500,
            jsonBody: {
                error: 'Failed to send actionable alert',
                message: error.message,
                siteId
            }
        };
    }
}

async function getPendingActions(request, context, siteId) {
    if (request.method !== 'GET') {
        return {
            status: 405,
            jsonBody: { error: 'Method Not Allowed', message: 'Only GET is supported' }
        };
    }

    const url = new URL(request.url);
    const includeHistory = url.searchParams.get('history') === 'true';

    const pending = pendingActions.getPendingActionsForSite(siteId);
    const result = {
        siteId,
        pending,
        pendingCount: pending.length,
        timestamp: new Date().toISOString()
    };

    if (includeHistory) {
        result.history = pendingActions.getActionHistory(siteId);
    }

    return { status: 200, jsonBody: result };
}
