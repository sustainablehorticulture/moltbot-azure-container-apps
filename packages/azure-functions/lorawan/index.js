const { app } = require('@azure/functions');

// Import LoRaWAN services
const lt2222Service = require('../services/lt2222Service');
const deviceManager = require('../services/deviceManager');
const downlinkHandler = require('../services/downlinkHandler');

// Environment variables
const LORAWAN_NETWORK_SERVER = process.env.LORAWAN_NETWORK_SERVER;
const LORAWAN_API_KEY = process.env.LORAWAN_API_KEY;
const LORAWAN_APPLICATION_ID = process.env.LORAWAN_APPLICATION_ID;

app.http('deviceControl', {
    methods: ['POST', 'GET', 'PUT', 'DELETE'],
    authLevel: 'function',
    route: 'lorawan/device/{deviceId?}',
    handler: async (request, context) => {
        context.log('LoRaWAN device control function triggered');
        
        try {
            const method = request.method.toLowerCase();
            const deviceId = request.params.deviceId;
            
            switch (method) {
                case 'get':
                    if (deviceId) {
                        const device = await deviceManager.getDevice(deviceId);
                        return {
                            status: 200,
                            jsonBody: device
                        };
                    } else {
                        const devices = await deviceManager.getAllDevices();
                        return {
                            status: 200,
                            jsonBody: devices
                        };
                    }
                    
                case 'post':
                    const deviceData = await request.json();
                    const newDevice = await deviceManager.createDevice(deviceData);
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
                    const updatedDevice = await deviceManager.updateDevice(deviceId, updateData);
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
                    await deviceManager.deleteDevice(deviceId);
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
            context.log.error('Error in device control:', error);
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

app.http('relayControl', {
    methods: ['POST', 'GET'],
    authLevel: 'function',
    route: 'lorawan/relay/{deviceId}',
    handler: async (request, context) => {
        context.log('LoRaWAN relay control function triggered');
        
        try {
            const deviceId = request.params.deviceId;
            const method = request.method.toLowerCase();
            
            if (!deviceId) {
                return {
                    status: 400,
                    jsonBody: {
                        error: 'Bad Request',
                        message: 'deviceId is required'
                    }
                };
            }
            
            switch (method) {
                case 'get':
                    const relayStatus = await lt2222Service.getRelayStatus(deviceId);
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
                    
                    const result = await lt2222Service.controlRelay(deviceId, controlData.relayId, controlData.state);
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
            
        } catch (error) {
            context.log.error('Error in relay control:', error);
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

app.http('digitalIOControl', {
    methods: ['POST', 'GET'],
    authLevel: 'function',
    route: 'lorawan/digital/{deviceId}',
    handler: async (request, context) => {
        context.log('LoRaWAN digital I/O control function triggered');
        
        try {
            const deviceId = request.params.deviceId;
            const method = request.method.toLowerCase();
            
            if (!deviceId) {
                return {
                    status: 400,
                    jsonBody: {
                        error: 'Bad Request',
                        message: 'deviceId is required'
                    }
                };
            }
            
            switch (method) {
                case 'get':
                    const ioStatus = await lt2222Service.getDigitalIOStatus(deviceId);
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
                    
                    const result = await lt2222Service.controlDigitalIO(deviceId, controlData.pinId, controlData.state, controlData.mode);
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
            
        } catch (error) {
            context.log.error('Error in digital I/O control:', error);
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

app.http('batchControl', {
    methods: ['POST'],
    authLevel: 'function',
    route: 'lorawan/batch',
    handler: async (request, context) => {
        context.log('LoRaWAN batch control function triggered');
        
        try {
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
                            result = await lt2222Service.controlRelay(operation.deviceId, operation.relayId, operation.state);
                            break;
                            
                        case 'digital':
                            result = await lt2222Service.controlDigitalIO(operation.deviceId, operation.pinId, operation.state, operation.mode);
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
                    message: 'Batch operations completed',
                    total: batchData.operations.length,
                    successful: results.filter(r => r.result?.success !== false).length,
                    failed: results.filter(r => r.result?.success === false || r.error).length,
                    results: results
                }
            };
            
        } catch (error) {
            context.log.error('Error in batch control:', error);
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

app.http('deviceStatus', {
    methods: ['GET'],
    authLevel: 'function',
    route: 'lorawan/status/{deviceId?}',
    handler: async (request, context) => {
        context.log('LoRaWAN device status function triggered');
        
        try {
            const deviceId = request.params.deviceId;
            
            if (deviceId) {
                const status = await lt2222Service.getDeviceStatus(deviceId);
                return {
                    status: 200,
                    jsonBody: status
                };
            } else {
                const allStatus = await lt2222Service.getAllDeviceStatus();
                return {
                    status: 200,
                    jsonBody: allStatus
                };
            }
            
        } catch (error) {
            context.log.error('Error getting device status:', error);
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

app.http('uplinkHandler', {
    methods: ['POST'],
    authLevel: 'function',
    route: 'lorawan/uplink',
    handler: async (request, context) => {
        context.log('LoRaWAN uplink handler function triggered');
        
        try {
            const uplinkData = await request.json();
            
            // Process uplink data from LoRaWAN network server
            const processedData = await lt2222Service.processUplink(uplinkData);
            
            // Store device state
            await deviceManager.updateDeviceState(processedData.deviceId, processedData);
            
            // Trigger alerts if needed
            if (processedData.alerts && processedData.alerts.length > 0) {
                // Queue alert notifications
                const alertQueue = {
                    deviceId: processedData.deviceId,
                    alerts: processedData.alerts,
                    timestamp: new Date().toISOString()
                };
                
                context.log('Alerts queued:', alertQueue);
            }
            
            return {
                status: 200,
                jsonBody: {
                    message: 'Uplink processed successfully',
                    processedData: processedData
                }
            };
            
        } catch (error) {
            context.log.error('Error processing uplink:', error);
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

app.http('scheduleControl', {
    methods: ['POST', 'GET', 'PUT', 'DELETE'],
    authLevel: 'function',
    route: 'lorawan/schedule/{scheduleId?}',
    handler: async (request, context) => {
        context.log('LoRaWAN schedule control function triggered');
        
        try {
            const method = request.method.toLowerCase();
            const scheduleId = request.params.scheduleId;
            
            switch (method) {
                case 'get':
                    if (scheduleId) {
                        const schedule = await deviceManager.getSchedule(scheduleId);
                        return {
                            status: 200,
                            jsonBody: schedule
                        };
                    } else {
                        const schedules = await deviceManager.getAllSchedules();
                        return {
                            status: 200,
                            jsonBody: schedules
                        };
                    }
                    
                case 'post':
                    const scheduleData = await request.json();
                    const newSchedule = await deviceManager.createSchedule(scheduleData);
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
                    const updatedSchedule = await deviceManager.updateSchedule(scheduleId, updateData);
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
                    await deviceManager.deleteSchedule(scheduleId);
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
            context.log.error('Error in schedule control:', error);
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
