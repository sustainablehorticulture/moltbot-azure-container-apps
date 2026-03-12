const { v4: uuidv4 } = require('uuid');

// In-memory storage for demo purposes. In production, use Azure Table Storage, Cosmos DB, or SQL Database with site isolation
const devices = new Map();
const schedules = new Map();
const deviceHistory = new Map(); // Per site history

class DeviceManager {
    constructor() {
        this.initializeDefaultDevices();
    }

    initializeDefaultDevices() {
        // Default LT2222 devices for demonstration (per site)
        const defaultDevices = {
            'farm-a': [
                {
                    deviceId: 'LT2222-FA-001',
                    name: 'Greenhouse Controller A1',
                    type: 'LT2222',
                    location: 'Greenhouse A - Zone 1',
                    description: 'Primary greenhouse control unit',
                    applicationId: process.env.LORAWAN_APPLICATION_ID || 'app-farm-a',
                    devEUI: '001A2B3C4D5E6F701',
                    appEUI: '001A2B3C4D5E6F702',
                    appKey: '001A2B3C4D5E6F703001A2B3C4D5E6F703',
                    enabled: true,
                    configuration: {
                        reportInterval: 300,
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
                    }
                },
                {
                    deviceId: 'LT2222-FA-002',
                    name: 'Irrigation Controller A1',
                    type: 'LT2222',
                    location: 'Field A - Irrigation Zone 1',
                    description: 'Irrigation system control unit',
                    applicationId: process.env.LORAWAN_APPLICATION_ID || 'app-farm-a',
                    devEUI: '001A2B3C4D5E6F704',
                    appEUI: '001A2B3C4D5E6F705',
                    appKey: '001A2B3C4D5E6F706001A2B3C4D5E6F706',
                    enabled: true,
                    configuration: {
                        reportInterval: 600,
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
                    }
                }
            ],
            'farm-b': [
                {
                    deviceId: 'LT2222-FB-001',
                    name: 'Greenhouse Controller B1',
                    type: 'LT2222',
                    location: 'Greenhouse B - Zone 1',
                    description: 'Primary greenhouse control unit',
                    applicationId: process.env.LORAWAN_APPLICATION_ID || 'app-farm-b',
                    devEUI: '001A2B3C4D5E6F801',
                    appEUI: '001A2B3C4D5E6F802',
                    appKey: '001A2B3C4D5E6F803001A2B3C4D5E6F803',
                    enabled: true,
                    configuration: {
                        reportInterval: 300,
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
                    }
                }
            ]
        };

        // Initialize devices for each site
        for (const [siteId, siteDevices] of Object.entries(defaultDevices)) {
            siteDevices.forEach(device => {
                const deviceKey = `${siteId}-${device.deviceId}`;
                devices.set(deviceKey, {
                    ...device,
                    id: uuidv4(),
                    siteId,
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
                });
            });

            // Initialize history for each site
            deviceHistory.set(siteId, []);
        }
    }

    async createDevice(deviceData, siteId) {
        const deviceKey = `${siteId}-${deviceData.deviceId}`;
        
        // Check if device already exists for this site
        if (devices.has(deviceKey)) {
            throw new Error(`Device ${deviceData.deviceId} already exists for site ${siteId}`);
        }

        const device = {
            id: uuidv4(),
            ...deviceData,
            siteId,
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

        devices.set(deviceKey, device);

        return device;
    }

    async getDevice(deviceId, siteId) {
        const deviceKey = `${siteId}-${deviceId}`;
        const device = devices.get(deviceKey);
        
        if (!device) {
            throw new Error(`Device ${deviceId} not found for site ${siteId}`);
        }
        
        return device;
    }

    async getAllDevices(siteId) {
        const siteDevices = [];
        
        for (const [deviceKey, device] of devices) {
            if (device.siteId === siteId) {
                siteDevices.push({
                    ...device,
                    state: {
                        ...device.state,
                        online: this.isDeviceOnline(device)
                    }
                });
            }
        }
        
        return siteDevices;
    }

    async updateDevice(deviceId, updateData, siteId) {
        const deviceKey = `${siteId}-${deviceId}`;
        const existing = devices.get(deviceKey);
        
        if (!existing) {
            throw new Error(`Device ${deviceId} not found for site ${siteId}`);
        }

        const updated = {
            ...existing,
            ...updateData,
            id: existing.id, // Preserve ID
            deviceId, // Preserve deviceId
            siteId, // Preserve siteId
            updatedAt: new Date().toISOString()
        };

        this.validateDeviceData(updated);
        devices.set(deviceKey, updated);

        return updated;
    }

    async deleteDevice(deviceId, siteId) {
        const deviceKey = `${siteId}-${deviceId}`;
        const deleted = devices.delete(deviceKey);
        
        if (!deleted) {
            throw new Error(`Device ${deviceId} not found for site ${siteId}`);
        }

        // Also delete related schedules for this site
        for (const [scheduleId, schedule] of schedules) {
            if (schedule.siteId === siteId && schedule.deviceId === deviceId) {
                schedules.delete(scheduleId);
            }
        }

        return true;
    }

    async updateDeviceState(deviceId, stateData, siteId) {
        const deviceKey = `${siteId}-${deviceId}`;
        const device = devices.get(deviceKey);
        
        if (!device) {
            throw new Error(`Device ${deviceId} not found for site ${siteId}`);
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

        // Add to site-specific history
        const siteHistory = deviceHistory.get(siteId) || [];
        siteHistory.push({
            deviceId,
            siteId,
            timestamp: stateData.timestamp,
            data: stateData.parsedData,
            rssi: stateData.rssi,
            snr: stateData.snr
        });

        // Keep history size manageable per site
        if (siteHistory.length > 10000) {
            siteHistory.splice(0, 1000);
        }
        deviceHistory.set(siteId, siteHistory);

        return device;
    }

    async createSchedule(scheduleData, siteId) {
        const schedule = {
            id: uuidv4(),
            ...scheduleData,
            siteId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            enabled: scheduleData.enabled !== false
        };

        // Validate schedule data
        this.validateScheduleData(schedule);

        schedules.set(schedule.id, schedule);

        return schedule;
    }

    async getSchedule(scheduleId, siteId) {
        const schedule = schedules.get(scheduleId);
        
        if (!schedule) {
            throw new Error(`Schedule ${scheduleId} not found`);
        }
        
        // Verify site access
        if (schedule.siteId !== siteId) {
            throw new Error(`Access denied: Schedule ${scheduleId} belongs to different site`);
        }
        
        return schedule;
    }

    async getAllSchedules(siteId) {
        const siteSchedules = [];
        
        for (const [scheduleId, schedule] of schedules) {
            if (schedule.siteId === siteId) {
                siteSchedules.push(schedule);
            }
        }
        
        return siteSchedules;
    }

    async updateSchedule(scheduleId, updateData, siteId) {
        const existing = schedules.get(scheduleId);
        
        if (!existing) {
            throw new Error(`Schedule ${scheduleId} not found`);
        }
        
        // Verify site access
        if (existing.siteId !== siteId) {
            throw new Error(`Access denied: Schedule ${scheduleId} belongs to different site`);
        }

        const updated = {
            ...existing,
            ...updateData,
            id: existing.id, // Preserve ID
            siteId, // Preserve siteId
            updatedAt: new Date().toISOString()
        };

        this.validateScheduleData(updated);
        schedules.set(scheduleId, updated);

        return updated;
    }

    async deleteSchedule(scheduleId, siteId) {
        const schedule = schedules.get(scheduleId);
        
        if (!schedule) {
            throw new Error(`Schedule ${scheduleId} not found`);
        }
        
        // Verify site access
        if (schedule.siteId !== siteId) {
            throw new Error(`Access denied: Schedule ${scheduleId} belongs to different site`);
        }

        const deleted = schedules.delete(scheduleId);
        
        if (!deleted) {
            throw new Error(`Schedule ${scheduleId} not found`);
        }

        return true;
    }

    async getSchedulesForDevice(deviceId, siteId) {
        const deviceSchedules = [];
        
        for (const [scheduleId, schedule] of schedules) {
            if (schedule.siteId === siteId && schedule.deviceId === deviceId && schedule.enabled) {
                deviceSchedules.push(schedule);
            }
        }
        
        return deviceSchedules;
    }

    async getDeviceHistory(deviceId, siteId, limit = 100, offset = 0) {
        const siteHistory = deviceHistory.get(siteId) || [];
        const deviceHistoryFiltered = siteHistory
            .filter(entry => entry.deviceId === deviceId)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(offset, offset + limit);

        return {
            deviceId,
            siteId,
            total: siteHistory.filter(entry => entry.deviceId === deviceId).length,
            history: deviceHistoryFiltered
        };
    }

    async getDeviceStatistics(deviceId, siteId, timeRange = '24h') {
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

        const siteHistory = deviceHistory.get(siteId) || [];
        const deviceHistoryFiltered = siteHistory.filter(entry => 
            entry.deviceId === deviceId && 
            new Date(entry.timestamp) >= startTime
        );

        const device = await this.getDevice(deviceId, siteId);

        return {
            deviceId,
            siteId,
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

    async getAllDeviceStatistics(siteId) {
        const allDevices = await this.getAllDevices(siteId);
        const onlineDevices = allDevices.filter(device => this.isDeviceOnline(device));

        return {
            siteId,
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

    // Site management
    async getSiteSummary(siteId) {
        const devices = await this.getAllDevices(siteId);
        const schedules = await this.getAllSchedules(siteId);
        const stats = await this.getAllDeviceStatistics(siteId);

        return {
            siteId,
            devices: {
                total: devices.length,
                online: stats.onlineDevices,
                offline: stats.offlineDevices
            },
            schedules: {
                total: schedules.length,
                active: schedules.filter(s => s.enabled).length
            },
            lastActivity: this.getLastSiteActivity(siteId)
        };
    }

    getLastSiteActivity(siteId) {
        const siteHistory = deviceHistory.get(siteId) || [];
        if (siteHistory.length === 0) return null;
        
        const latest = siteHistory.reduce((latest, current) => 
            new Date(current.timestamp) > new Date(latest.timestamp) ? current : latest
        );
        
        return latest.timestamp;
    }

    // Cross-site operations (for admin use)
    async getAllSitesSummary() {
        const sites = new Set();
        
        for (const [deviceKey, device] of devices) {
            sites.add(device.siteId);
        }

        const summaries = {};
        for (const siteId of sites) {
            summaries[siteId] = await this.getSiteSummary(siteId);
        }

        return summaries;
    }
}

module.exports = new DeviceManager();
