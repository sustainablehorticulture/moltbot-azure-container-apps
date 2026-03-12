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
            'grassgumfarm': [
                {
                    deviceId: 'grassgumfarmiocontrol1',
                    name: 'Grass Gum Farm IO Controller 1',
                    type: 'LT2222',
                    location: 'Grass Gum Farm - Main Site',
                    description: 'Primary farm IO control unit',
                    applicationId: process.env.LORAWAN_APPLICATION_ID || 'grassgumfarm',
                    devEUI: 'A84041B4D1826850',
                    appEUI: '0000000000000000',
                    appKey: 'A84041B4D1826850A84041B4D1826850',
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
            ],
            'farm-a': [
                {
                    deviceId: 'LT2222-FA-001',
                    name: 'Greenhouse Controller A1',
                    type: 'LT2222',
                    location: 'Greenhouse A - Zone 1',
                    description: 'Primary greenhouse control unit',
                    applicationId: process.env.LORAWAN_APPLICATION_ID || 'app-farm-a',
                    devEUI: '001A2B3C4D5E6F70',
                    appEUI: '001A2B3C4D5E6F70',
                    appKey: '001A2B3C4D5E6F70001A2B3C4D5E6F70',
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

        this.validateDeviceData(device);
        
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
            id: existing.id,
            deviceId,
            siteId,
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

        device.state = {
            ...device.state,
            ...stateData.parsedData,
            lastSeen: stateData.timestamp,
            signalStrength: stateData.rssi,
            signalQuality: stateData.snr,
            online: true
        };

        device.updatedAt = new Date().toISOString();

        const siteHistory = deviceHistory.get(siteId) || [];
        siteHistory.push({
            deviceId,
            siteId,
            timestamp: stateData.timestamp,
            data: stateData.parsedData,
            rssi: stateData.rssi,
            snr: stateData.snr
        });

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

        this.validateScheduleData(schedule);
        schedules.set(schedule.id, schedule);
        return schedule;
    }

    async getSchedule(scheduleId, siteId) {
        const schedule = schedules.get(scheduleId);
        
        if (!schedule) {
            throw new Error(`Schedule ${scheduleId} not found`);
        }
        
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
        
        if (existing.siteId !== siteId) {
            throw new Error(`Access denied: Schedule ${scheduleId} belongs to different site`);
        }

        const updated = {
            ...existing,
            ...updateData,
            id: existing.id,
            siteId,
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

    validateDeviceData(device) {
        const required = ['deviceId', 'name', 'type', 'devEUI', 'appEUI', 'appKey'];
        const missing = required.filter(field => !device[field]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required fields: ${missing.join(', ')}`);
        }

        if (device.type !== 'LT2222') {
            throw new Error(`Unsupported device type: ${device.type}`);
        }

        const euiPattern = /^[0-9A-Fa-f]{16}$/;
        if (!euiPattern.test(device.devEUI.replace(/:/g, ''))) {
            throw new Error('Invalid devEUI format');
        }
        if (!euiPattern.test(device.appEUI.replace(/:/g, ''))) {
            throw new Error('Invalid appEUI format');
        }

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

        const validTypes = ['relay', 'digital', 'analog', 'batch'];
        if (!validTypes.includes(schedule.type)) {
            throw new Error(`Invalid schedule type: ${schedule.type}`);
        }

        if (schedule.cron) {
            const cronParts = schedule.cron.split(' ');
            if (cronParts.length !== 5) {
                throw new Error('Invalid cron expression format');
            }
        }

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
        const timeDiff = (now - lastSeen) / 1000;
        
        return timeDiff < 1800;
    }

    async getSiteSummary(siteId) {
        const devices = await this.getAllDevices(siteId);
        const schedules = await this.getAllSchedules(siteId);

        return {
            siteId,
            devices: {
                total: devices.length,
                online: devices.filter(d => this.isDeviceOnline(d)).length,
                offline: devices.filter(d => !this.isDeviceOnline(d)).length
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
}

module.exports = new DeviceManager();
