const { app } = require('@azure/functions');

// Import LoRaWAN services
const lt2222Service = require('../services/lt2222Service');
const deviceManager = require('../services/deviceManager');
const ttnService = require('../services/ttnService');

// Multi-site LoRaWAN device control with privacy isolation
app.http('lorawanControl', {
    methods: ['POST', 'GET', 'PUT', 'DELETE'],
    authLevel: 'function',
    route: 'sites/{siteId}/{category}/{deviceId?}',
    handler: async (request, context) => {
        context.log('LoRaWAN Control function triggered');

        try {
            const method = request.method.toLowerCase();
            const { siteId, category, deviceId } = request.params;

            // Validate site ID for privacy isolation
            if (!siteId) {
                return {
                    status: 400,
                    jsonBody: {
                        error: 'Bad Request',
                        message: 'Site ID is required in the route'
                    }
                };
            }

            // Log with site isolation
            context.log(`Processing LoRaWAN request for site: ${siteId}, category: ${category}, device: ${deviceId || 'all'}`);

            // Route to appropriate handler based on category
            switch (category) {
                case 'devices':
                    return await handleDeviceManagement(request, context, siteId, deviceId, method);

                case 'relays':
                    return await handleRelayControl(request, context, siteId, deviceId, method);

                case 'digital':
                    return await handleDigitalIO(request, context, siteId, deviceId, method);

                case 'batch':
                    return await handleBatchOperations(request, context, siteId, method);

                case 'status':
                    return await handleDeviceStatus(request, context, siteId, deviceId);

                case 'uplink':
                    return await handleUplink(request, context, siteId);

                case 'latest':
                    return await handleLatest(request, context, siteId, deviceId);

                case 'schedules':
                    return await handleScheduleManagement(request, context, siteId, deviceId, method);

                default:
                    return {
                        status: 404,
                        jsonBody: {
                            error: 'Not Found',
                            message: `Unknown category: ${category}. Available: devices, relays, digital, batch, status, uplink, schedules`
                        }
                    };
            }

        } catch (error) {
            context.log.error(`Error in LoRaWAN Control function for site ${siteId}:`, error);
            return {
                status: 500,
                jsonBody: {
                    error: 'Internal Server Error',
                    message: error.message,
                    siteId: siteId || 'unknown'
                }
            };
        }
    }
});

async function handleDeviceManagement(request, context, siteId, deviceId, method) {
    switch (method) {
        case 'get':
            if (deviceId) {
                const device = await deviceManager.getDevice(deviceId, siteId);
                return {
                    status: 200,
                    jsonBody: device
                };
            } else {
                const devices = await deviceManager.getAllDevices(siteId);
                return {
                    status: 200,
                    jsonBody: {
                        siteId,
                        devices: devices,
                        total: devices.length,
                        timestamp: new Date().toISOString()
                    }
                };
            }

        case 'post':
            const deviceData = await request.json();
            const newDevice = await deviceManager.createDevice(deviceData, siteId);
            return {
                status: 201,
                jsonBody: newDevice
            };

        case 'put':
            if (!deviceId) {
                return {
                    status: 400,
                    jsonBody: {
                        error: 'Bad Request',
                        message: 'deviceId is required for PUT requests'
                    }
                };
            }
            const updateData = await request.json();
            const updatedDevice = await deviceManager.updateDevice(deviceId, updateData, siteId);
            return {
                status: 200,
                jsonBody: updatedDevice
            };

        case 'delete':
            if (!deviceId) {
                return {
                    status: 400,
                    jsonBody: {
                        error: 'Bad Request',
                        message: 'deviceId is required for DELETE requests'
                    }
                };
            }
            await deviceManager.deleteDevice(deviceId, siteId);
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
}

async function handleRelayControl(request, context, siteId, deviceId, method) {
    if (!deviceId) {
        return {
            status: 400,
            jsonBody: {
                error: 'Bad Request',
                message: 'deviceId is required for relay control'
            }
        };
    }

    switch (method) {
        case 'get':
            const relayStatus = await lt2222Service.getRelayStatus(deviceId, siteId);
            return {
                status: 200,
                jsonBody: relayStatus
            };

        case 'post':
            const controlData = await request.json();

            // Validate control data
            if (!controlData.relayId || controlData.state === undefined) {
                return {
                    status: 400,
                    jsonBody: {
                        error: 'Bad Request',
                        message: 'Missing required fields: relayId, state'
                    }
                };
            }

            const result = await lt2222Service.controlRelay(deviceId, controlData.relayId, controlData.state, siteId);
            return {
                status: 200,
                jsonBody: result
            };

        default:
            return {
                status: 405,
                jsonBody: {
                    error: 'Method Not Allowed',
                    message: 'Only GET and POST methods are supported'
                }
            };
    }
}

async function handleDigitalIO(request, context, siteId, deviceId, method) {
    if (!deviceId) {
        return {
            status: 400,
            jsonBody: {
                error: 'Bad Request',
                message: 'deviceId is required for digital I/O control'
            }
        };
    }

    switch (method) {
        case 'get':
            const ioStatus = await lt2222Service.getDigitalIOStatus(deviceId, siteId);
            return {
                status: 200,
                jsonBody: ioStatus
            };

        case 'post':
            const controlData = await request.json();

            // Validate control data
            if (!controlData.pinId || controlData.state === undefined) {
                return {
                    status: 400,
                    jsonBody: {
                        error: 'Bad Request',
                        message: 'Missing required fields: pinId, state'
                    }
                };
            }

            const result = await lt2222Service.controlDigitalIO(deviceId, controlData.pinId, controlData.state, controlData.mode, siteId);
            return {
                status: 200,
                jsonBody: result
            };

        default:
            return {
                status: 405,
                jsonBody: {
                    error: 'Method Not Allowed',
                    message: 'Only GET and POST methods are supported'
                }
            };
    }
}

async function handleBatchOperations(request, context, siteId, method) {
    if (method !== 'post') {
        return {
            status: 405,
            jsonBody: {
                error: 'Method Not Allowed',
                message: 'Only POST method is supported for batch operations'
            }
        };
    }

    const batchData = await request.json();

    // Validate batch data
    if (!batchData.operations || !Array.isArray(batchData.operations)) {
        return {
            status: 400,
            jsonBody: {
                error: 'Bad Request',
                message: 'Missing or invalid operations array'
            }
        };
    }

    const results = [];

    for (const operation of batchData.operations) {
        try {
            let result;

            switch (operation.type) {
                case 'relay':
                    result = await lt2222Service.controlRelay(operation.deviceId, operation.relayId, operation.state, siteId);
                    break;

                case 'digital':
                    result = await lt2222Service.controlDigitalIO(operation.deviceId, operation.pinId, operation.state, operation.mode, siteId);
                    break;

                default:
                    result = {
                        success: false,
                        error: `Unknown operation type: ${operation.type}`
                    };
            }

            results.push({
                operation: operation,
                result: result,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            results.push({
                operation: operation,
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    return {
        status: 200,
        jsonBody: {
            siteId,
            message: 'Batch operations completed',
            total: batchData.operations.length,
            successful: results.filter(r => r.result?.success !== false).length,
            failed: results.filter(r => r.result?.success === false || r.error).length,
            results: results,
            timestamp: new Date().toISOString()
        }
    };
}

async function handleDeviceStatus(request, context, siteId, deviceId) {
    if (deviceId) {
        const status = await lt2222Service.getDeviceStatus(deviceId, siteId);
        return {
            status: 200,
            jsonBody: status
        };
    } else {
        const allStatus = await lt2222Service.getAllDeviceStatus(siteId);
        return {
            status: 200,
            jsonBody: {
                siteId,
                devices: allStatus,
                timestamp: new Date().toISOString()
            }
        };
    }
}

async function handleUplink(request, context, siteId) {
    if (request.method !== 'post') {
        return {
            status: 405,
            jsonBody: {
                error: 'Method Not Allowed',
                message: 'Only POST method is supported for uplink processing'
            }
        };
    }

    const uplinkData = await request.json();

    // Process uplink data from LoRaWAN network server
    const processedData = await lt2222Service.processUplink(uplinkData, siteId);

    // Store device state with site isolation
    await deviceManager.updateDeviceState(processedData.deviceId, processedData, siteId);

    // Trigger alerts if needed
    if (processedData.alerts && processedData.alerts.length > 0) {
        // Queue alert notifications for this site
        context.log(`Alerts queued for site ${siteId}:`, processedData.alerts);
    }

    return {
        status: 200,
        jsonBody: {
            siteId,
            message: 'Uplink processed successfully',
            processedData: processedData,
            timestamp: new Date().toISOString()
        }
    };
}

async function handleScheduleManagement(request, context, siteId, scheduleId, method) {
    switch (method) {
        case 'get':
            if (scheduleId) {
                const schedule = await deviceManager.getSchedule(scheduleId, siteId);
                return {
                    status: 200,
                    jsonBody: schedule
                };
            } else {
                const schedules = await deviceManager.getAllSchedules(siteId);
                return {
                    status: 200,
                    jsonBody: {
                        siteId,
                        schedules: schedules,
                        total: schedules.length,
                        timestamp: new Date().toISOString()
                    }
                };
            }

        case 'post':
            const scheduleData = await request.json();
            const newSchedule = await deviceManager.createSchedule(scheduleData, siteId);
            return {
                status: 201,
                jsonBody: newSchedule
            };

        case 'put':
            if (!scheduleId) {
                return {
                    status: 400,
                    jsonBody: {
                        error: 'Bad Request',
                        message: 'scheduleId is required for PUT requests'
                    }
                };
            }
            const updateData = await request.json();
            const updatedSchedule = await deviceManager.updateSchedule(scheduleId, updateData, siteId);
            return {
                status: 200,
                jsonBody: updatedSchedule
            };

        case 'delete':
            if (!scheduleId) {
                return {
                    status: 400,
                    jsonBody: {
                        error: 'Bad Request',
                        message: 'scheduleId is required for DELETE requests'
                    }
                };
            }
            await deviceManager.deleteSchedule(scheduleId, siteId);
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
}

async function handleLatest(request, context, siteId, deviceId) {
    try {
        if (deviceId) {
            const reading = await ttnService.getDeviceLatest(siteId, deviceId);
            if (!reading) {
                return {
                    status: 404,
                    jsonBody: { error: 'Not Found', message: `No stored uplink found for device ${deviceId}`, siteId, deviceId }
                };
            }
            return { status: 200, jsonBody: { siteId, deviceId, reading, timestamp: new Date().toISOString() } };
        } else {
            const readings = await ttnService.getAllLatest(siteId);
            return {
                status: 200,
                jsonBody: { siteId, readings, total: readings.length, timestamp: new Date().toISOString() }
            };
        }
    } catch (e) {
        context.log.error('TTN latest error:', e.message);
        return { status: 500, jsonBody: { error: 'TTN fetch failed', message: e.message, siteId } };
    }
}
