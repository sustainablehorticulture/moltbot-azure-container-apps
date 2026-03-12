const { v4: uuidv4 } = require('uuid');

// In-memory storage for demo purposes. In production, use Azure Table Storage, Cosmos DB, or SQL Database
const devices = new Map();
const schedules = new Map();
const deviceHistory = [];

class DeviceManager {
    constructor() {
        this.initializeDefaultDevices();
    }

    initializeDefaultDevices() {
        // Default LT2222 devices for demonstration
        const defaultDevices = [
            {
                deviceId: 'LT2222-001',
                name: 'Greenhouse Controller 1',
                type: 'LT2222',
                location: 'Greenhouse A',
                description: 'Primary greenhouse control unit',
                applicationId: process.env.LORAWAN_APPLICATION_ID || 'app-1',
                devEUI: '001A2B3C4D5E6F701',
                appEUI: '001A2B3C4D5E6F702',
                appKey: '001A2B3C4D5E6F703001A2B3C4D5E6F703',
                enabled: true,
                configuration: {
                    reportInterval: 300, // 5 minutes
                    confirmUplink: true,
                    adr: true,
                    dataRate: 3,
                    txPower: 0
                },
                capabilities: {
                    relays: 2,
                    digitalInputs: 4,
                    digitalOutputs: 4,
                    analogInputs: 2
                },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            {
                deviceId: 'LT2222-002',
                name: 'Irrigation Controller 1',
                type: 'LT2222',
                location: 'Field B',
                description: 'Irrigation system control unit',
                applicationId: process.env.LORAWAN_APPLICATION_ID || 'app-1',
                devEUI: '001A2B3C4D5E6F704',
                appEUI: '001A2B3C4D5E6F705',
                appKey: '001A2B3C4D5E6F706001A2B3C4D5E6F706',
                enabled: true,
                configuration: {
                    reportInterval: 600, // 10 minutes
                    confirmUplink: false,
                    adr: true,
                    dataRate: 2,
                    txPower: 2
                },
                capabilities: {
                    relays: 2,
                    digitalInputs: 4,
                    digitalOutputs: 4,
                    analogInputs: 2
                },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }
        ];

        defaultDevices.forEach(device => {
            devices.set(device.deviceId, {
                ...device,
                id: uuidv4(),
                state: {
                    online: false,
                    lastSeen: null,
                    batteryVoltage: null,
                    temperature: null,
                    uptime: 0,
                    relays: {
                        relay1: false,
                        relay2: false
                    },
                    digitalInputs: {
                        input1: false,
                        input2: false,
                        input3: false,
                        input4: false
                    },
                    digitalOutputs: {
                        output1: false,
                        output2: false,
                        output3: false,
                        output4: false
                    },
                    analogInputs: {
                        analog1: null,
                        analog2: null
                    },
                    signalStrength: null,
                    signalQuality: null
                }
            });
        });
    }

    async createDevice(deviceData) {
        const device = {
            id: uuidv4(),
            ...deviceData,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            state: {
                online: false,
                lastSeen: null,
                batteryVoltage: null,
                temperature: null,
                uptime: 0,
                relays: {
                    relay1: false,
                    relay2: false
                },
                digitalInputs: {
                    input1: false,
                    input2: false,
                    input3: false,
                    input4: false
                },
                digitalOutputs: {
                    output1: false,
                    output2: false,
                    output3: false,
                    output4: false
                },
                analogInputs: {
                    analog1: null,
                    analog2: null
                },
                signalStrength: null,
                signalQuality: null
            }
        };

        // Validate device data
        this.validateDeviceData(device);
        
        // Set default capabilities if not provided
        if (!device.capabilities) {
            device.capabilities = {
                relays: 2,
                digitalInputs: 4,
                digitalOutputs: 4,
                analogInputs: 2
            };
        }

        devices.set(device.deviceId, device);

        return device;
    }

    async getDevice(deviceId) {
        const device = devices.get(deviceId);
        if (!device) {
            throw new Error(`Device ${deviceId} not found`);
        }
        return device;
    }

    async getAllDevices() {
        return Array.from(devices.values()).map(device => ({
            ...device,
            state: {
                ...device.state,
                online: this.isDeviceOnline(device)
            }
        }));
    }

    async updateDevice(deviceId, updateData) {
        const existing = devices.get(deviceId);
        if (!existing) {
            throw new Error(`Device ${deviceId} not found`);
        }

        const updated = {
            ...existing,
            ...updateData,
            id: existing.id, // Preserve ID
            deviceId, // Preserve deviceId
            updatedAt: new Date().toISOString()
        };

        this.validateDeviceData(updated);
        devices.set(deviceId, updated);

        return updated;
    }

    async deleteDevice(deviceId) {
        const deleted = devices.delete(deviceId);
        if (!deleted) {
            throw new Error(`Device ${deviceId} not found`);
        }

        // Also delete related schedules
        for (const [scheduleId, schedule] of schedules) {
            if (schedule.deviceId === deviceId) {
                schedules.delete(scheduleId);
            }
        }

        return true;
    }

    async updateDeviceState(deviceId, stateData) {
        const device = devices.get(deviceId);
        if (!device) {
            throw new Error(`Device ${deviceId} not found`);
        }

        // Update device state
        device.state = {
            ...device.state,
            ...stateData.parsedData,
            lastSeen: stateData.timestamp,
            signalStrength: stateData.rssi,
            signalQuality: stateData.snr,
            online: true
        };

        device.updatedAt = new Date().toISOString();

        // Add to history
        deviceHistory.push({
            deviceId,
            timestamp: stateData.timestamp,
            data: stateData.parsedData,
            rssi: stateData.rssi,
            snr: stateData.snr
        });

        // Keep history size manageable
        if (deviceHistory.length > 10000) {
            deviceHistory.splice(0, 1000);
        }

        return device;
    }

    async createSchedule(scheduleData) {
        const schedule = {
            id: uuidv4(),
            ...scheduleData,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            enabled: scheduleData.enabled !== false
        };

        // Validate schedule data
        this.validateScheduleData(schedule);

        schedules.set(schedule.id, schedule);

        return schedule;
    }

    async getSchedule(scheduleId) {
        const schedule = schedules.get(scheduleId);
        if (!schedule) {
            throw new Error(`Schedule ${scheduleId} not found`);
        }
        return schedule;
    }

    async getAllSchedules() {
        return Array.from(schedules.values());
    }

    async updateSchedule(scheduleId, updateData) {
        const existing = schedules.get(scheduleId);
        if (!existing) {
            throw new Error(`Schedule ${scheduleId} not found`);
        }

        const updated = {
            ...existing,
            ...updateData,
            id: existing.id, // Preserve ID
            updatedAt: new Date().toISOString()
        };

        this.validateScheduleData(updated);
        schedules.set(scheduleId, updated);

        return updated;
    }

    async deleteSchedule(scheduleId) {
        const deleted = schedules.delete(scheduleId);
        if (!deleted) {
            throw new Error(`Schedule ${scheduleId} not found`);
        }

        return true;
    }

    async getSchedulesForDevice(deviceId) {
        return Array.from(schedules.values()).filter(schedule => 
            schedule.deviceId === deviceId && schedule.enabled
        );
    }

    async getDeviceHistory(deviceId, limit = 100, offset = 0) {
        const history = deviceHistory
            .filter(entry => entry.deviceId === deviceId)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(offset, offset + limit);

        return {
            deviceId,
            total: deviceHistory.filter(entry => entry.deviceId === deviceId).length,
            history
        };
    }

    async getDeviceStatistics(deviceId, timeRange = '24h') {
        const now = new Date();
        let startTime;

        switch (timeRange) {
            case '1h':
                startTime = new Date(now - 60 * 60 * 1000);
                break;
            case '24h':
                startTime = new Date(now - 24 * 60 * 60 * 1000);
                break;
            case '7d':
                startTime = new Date(now - 7 * 24 * 60 * 60 * 1000);
                break;
            case '30d':
                startTime = new Date(now - 30 * 24 * 60 * 60 * 1000);
                break;
            default:
                startTime = new Date(now - 24 * 60 * 60 * 1000);
        }

        const deviceHistoryFiltered = deviceHistory.filter(entry => 
            entry.deviceId === deviceId && 
            new Date(entry.timestamp) >= startTime
        );

        const device = devices.get(deviceId);
        if (!device) {
            throw new Error(`Device ${deviceId} not found`);
        }

        return {
            deviceId,
            timeRange,
            startTime: startTime.toISOString(),
            endTime: now.toISOString(),
            totalMessages: deviceHistoryFiltered.length,
            online: this.isDeviceOnline(device),
            lastSeen: device.state.lastSeen,
            averageSignalStrength: this.calculateAverage(deviceHistoryFiltered, 'rssi'),
            averageSignalQuality: this.calculateAverage(deviceHistoryFiltered, 'snr'),
            uptime: device.state.uptime,
            batteryVoltage: device.state.batteryVoltage,
            temperature: device.state.temperature
        };
    }

    async getAllDeviceStatistics() {
        const allDevices = Array.from(devices.values());
        const onlineDevices = allDevices.filter(device => this.isDeviceOnline(device));

        return {
            totalDevices: allDevices.length,
            onlineDevices: onlineDevices.length,
            offlineDevices: allDevices.length - onlineDevices.length,
            devices: allDevices.map(device => ({
                deviceId: device.deviceId,
                name: device.name,
                location: device.location,
                online: this.isDeviceOnline(device),
                lastSeen: device.state.lastSeen,
                batteryVoltage: device.state.batteryVoltage,
                temperature: device.state.temperature
            }))
        };
    }

    validateDeviceData(device) {
        const required = ['deviceId', 'name', 'type', 'devEUI', 'appEUI', 'appKey'];
        const missing = required.filter(field => !device[field]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required fields: ${missing.join(', ')}`);
        }

        // Validate device type
        if (device.type !== 'LT2222') {
            throw new Error(`Unsupported device type: ${device.type}`);
        }

        // Validate EUIs (should be 16 hex characters)
        const euiPattern = /^[0-9A-Fa-f]{16}$/;
        if (!euiPattern.test(device.devEUI.replace(/:/g, ''))) {
            throw new Error('Invalid devEUI format');
        }
        if (!euiPattern.test(device.appEUI.replace(/:/g, ''))) {
            throw new Error('Invalid appEUI format');
        }

        // Validate AppKey (should be 32 hex characters)
        const keyPattern = /^[0-9A-Fa-f]{32}$/;
        if (!keyPattern.test(device.appKey.replace(/:/g, ''))) {
            throw new Error('Invalid appKey format');
        }
    }

    validateScheduleData(schedule) {
        const required = ['deviceId', 'name', 'type', 'enabled'];
        const missing = required.filter(field => schedule[field] === undefined);
        
        if (missing.length > 0) {
            throw new Error(`Missing required fields: ${missing.join(', ')}`);
        }

        // Validate schedule type
        const validTypes = ['relay', 'digital', 'analog', 'batch'];
        if (!validTypes.includes(schedule.type)) {
            throw new Error(`Invalid schedule type: ${schedule.type}`);
        }

        // Validate cron expression if provided
        if (schedule.cron) {
            // Basic cron validation - in production use a proper cron parser
            const cronParts = schedule.cron.split(' ');
            if (cronParts.length !== 5) {
                throw new Error('Invalid cron expression format');
            }
        }

        // Validate actions
        if (!schedule.actions || !Array.isArray(schedule.actions) || schedule.actions.length === 0) {
            throw new Error('Schedule must have at least one action');
        }

        for (const action of schedule.actions) {
            if (!action.type || !action.parameters) {
                throw new Error('Each action must have type and parameters');
            }
        }
    }

    isDeviceOnline(device) {
        if (!device.state.lastSeen) return false;
        
        const lastSeen = new Date(device.state.lastSeen);
        const now = new Date();
        const timeDiff = (now - lastSeen) / 1000; // seconds
        
        // Consider device offline if no uplink in 30 minutes
        return timeDiff < 1800;
    }

    calculateAverage(data, field) {
        if (data.length === 0) return null;
        
        const validValues = data
            .map(entry => entry[field])
            .filter(value => value !== null && value !== undefined);
        
        if (validValues.length === 0) return null;
        
        const sum = validValues.reduce((acc, value) => acc + value, 0);
        return sum / validValues.length;
    }

    // Execute scheduled actions
    async executeScheduledActions() {
        const now = new Date();
        const executedSchedules = [];

        for (const [scheduleId, schedule] of schedules) {
            if (!schedule.enabled) continue;

            if (this.shouldExecuteSchedule(schedule, now)) {
                try {
                    const results = await this.executeScheduleActions(schedule);
                    executedSchedules.push({
                        scheduleId,
                        scheduleName: schedule.name,
                        executedAt: now.toISOString(),
                        results
                    });
                } catch (error) {
                    console.error(`Failed to execute schedule ${scheduleId}:`, error);
                    executedSchedules.push({
                        scheduleId,
                        scheduleName: schedule.name,
                        executedAt: now.toISOString(),
                        error: error.message
                    });
                }
            }
        }

        return executedSchedules;
    }

    shouldExecuteSchedule(schedule, now) {
        // Simple time-based execution - in production use a proper cron library
        if (!schedule.cron) return false;

        // For demo purposes, execute every minute if schedule is enabled
        // In production, implement proper cron evaluation
        return true;
    }

    async executeScheduleActions(schedule) {
        const lt2222Service = require('./lt2222Service');
        const results = [];

        for (const action of schedule.actions) {
            try {
                let result;

                switch (action.type) {
                    case 'relay':
                        result = await lt2222Service.controlRelay(
                            schedule.deviceId,
                            action.parameters.relayId,
                            action.parameters.state
                        );
                        break;

                    case 'digital':
                        result = await lt2222Service.controlDigitalIO(
                            schedule.deviceId,
                            action.parameters.pinId,
                            action.parameters.state,
                            action.parameters.mode
                        );
                        break;

                    default:
                        throw new Error(`Unknown action type: ${action.type}`);
                }

                results.push({
                    action,
                    result,
                    success: true
                });

            } catch (error) {
                results.push({
                    action,
                    success: false,
                    error: error.message
                });
            }
        }

        return results;
    }
}

module.exports = new DeviceManager();
