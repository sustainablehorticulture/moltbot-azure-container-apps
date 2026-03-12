const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

class LT2222Service {
    constructor() {
        // Site-specific network server configurations
        this.siteConfigs = new Map();
        this.initializeDefaultConfigs();
    }

    initializeDefaultConfigs() {
        // Default configuration template
        const defaultConfig = {
            networkServerUrl: process.env.LORAWAN_NETWORK_SERVER,
            apiKey: process.env.LORAWAN_API_KEY,
            applicationId: process.env.LORAWAN_APPLICATION_ID
        };

        // In production, load site-specific configs from database
        this.siteConfigs.set('default', defaultConfig);
    }

    getSiteConfig(siteId) {
        return this.siteConfigs.get(siteId) || this.siteConfigs.get('default');
    }

    async controlRelay(deviceId, relayId, state, siteId = 'default') {
        try {
            const config = this.getSiteConfig(siteId);
            
            // Validate relay ID
            if (relayId < 1 || relayId > 2) {
                throw new Error(`Invalid relay ID. Must be 1-2 for LT2222 device`);
            }

            // Validate state
            if (typeof state !== 'boolean') {
                throw new Error('Relay state must be boolean (true/false)');
            }

            // Create downlink command for LT2222
            const command = this.createRelayCommand(relayId, state);
            
            // Send downlink via LoRaWAN network server
            const downlinkResult = await this.sendDownlink(deviceId, command, config, siteId);
            
            // Update device state (in production, update database)
            await this.updateDeviceRelayState(deviceId, relayId, state, siteId);
            
            return {
                success: true,
                deviceId,
                siteId,
                relayId,
                state,
                command: command,
                downlinkResult,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            console.error(`Failed to control relay ${relayId} on device ${deviceId} for site ${siteId}:`, error);
            throw error;
        }
    }

    async controlDigitalIO(deviceId, pinId, state, mode = 'output', siteId = 'default') {
        try {
            const config = this.getSiteConfig(siteId);
            
            // Validate pin ID
            if (pinId < 1 || pinId > 4) {
                throw new Error(`Invalid pin ID. Must be 1-4 for LT2222 digital I/O`);
            }

            // Validate mode
            const supportedModes = ['input', 'output', 'pullup', 'pulldown'];
            if (!supportedModes.includes(mode)) {
                throw new Error(`Invalid mode. Supported modes: ${supportedModes.join(', ')}`);
            }

            // Create downlink command for digital I/O
            const command = this.createDigitalIOCommand(pinId, state, mode);
            
            // Send downlink via LoRaWAN network server
            const downlinkResult = await this.sendDownlink(deviceId, command, config, siteId);
            
            // Update device state
            await this.updateDeviceDigitalState(deviceId, pinId, state, mode, siteId);
            
            return {
                success: true,
                deviceId,
                siteId,
                pinId,
                state,
                mode,
                command: command,
                downlinkResult,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            console.error(`Failed to control digital I/O pin ${pinId} on device ${deviceId} for site ${siteId}:`, error);
            throw error;
        }
    }

    createRelayCommand(relayId, state) {
        // LT2222 relay control command format
        // Byte 0: Command type (0x01 for relay control)
        // Byte 1: Relay mask (bit 0 = relay 1, bit 1 = relay 2)
        // Byte 2: Relay state (bit 0 = relay 1 state, bit 1 = relay 2 state)
        
        const relayMask = 1 << (relayId - 1);
        const relayState = state ? relayMask : 0;
        
        const payload = Buffer.from([
            0x01,           // Relay control command
            relayMask,      // Which relay to control
            relayState      // Relay state
        ]);
        
        return {
            type: 'relay',
            payload: payload.toString('hex'),
            payloadSize: payload.length,
            confirmed: true,
            fPort: 2
        };
    }

    createDigitalIOCommand(pinId, state, mode) {
        // LT2222 digital I/O control command format
        // Byte 0: Command type (0x02 for digital I/O control)
        // Byte 1: Pin mask (bits 0-3 for pins 1-4)
        // Byte 2: Pin state (bits 0-3 for pin states)
        // Byte 3: Pin mode (bits 0-3 for pin modes: 00=input, 01=output, 10=pullup, 11=pulldown)
        
        const pinMask = 1 << (pinId - 1);
        const pinState = state ? pinMask : 0;
        
        // Convert mode to bits
        const modeBits = {
            'input': 0b00,
            'output': 0b01,
            'pullup': 0b10,
            'pulldown': 0b11
        };
        
        const pinMode = modeBits[mode] << ((pinId - 1) * 2);
        
        const payload = Buffer.from([
            0x02,           // Digital I/O control command
            pinMask,        // Which pin to control
            pinState,       // Pin state
            pinMode         // Pin mode
        ]);
        
        return {
            type: 'digital',
            payload: payload.toString('hex'),
            payloadSize: payload.length,
            confirmed: true,
            fPort: 3
        };
    }

    async sendDownlink(deviceId, command, config, siteId) {
        try {
            if (!config.networkServerUrl || !config.apiKey) {
                throw new Error('LoRaWAN network server not configured for site: ' + siteId);
            }

            const url = `${config.networkServerUrl}/api/v3/downlink`;
            
            const downlinkMessage = {
                device: deviceId,
                application: config.applicationId,
                payload: command.payload,
                confirmed: command.confirmed,
                fPort: command.fPort
            };
            
            const headers = {
                'Authorization': `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json'
            };
            
            const response = await axios.post(url, downlinkMessage, { headers });
            
            return {
                success: true,
                messageId: response.data.id || uuidv4(),
                response: response.data,
                siteId,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            console.error(`Failed to send downlink for site ${siteId}:`, error);
            throw new Error(`Downlink failed: ${error.message}`);
        }
    }

    async processUplink(uplinkData, siteId = 'default') {
        try {
            const deviceId = uplinkData.device || uplinkData.devEUI;
            const payloadHex = uplinkData.data || uplinkData.payload;
            const fPort = uplinkData.fPort || 1;
            
            // Parse uplink payload based on fPort
            let parsedData;
            
            switch (fPort) {
                case 1:
                    parsedData = this.parseStatusUplink(payloadHex);
                    break;
                case 2:
                    parsedData = this.parseRelayStatusUplink(payloadHex);
                    break;
                case 3:
                    parsedData = this.parseDigitalIOStatusUplink(payloadHex);
                    break;
                case 4:
                    parsedData = this.parseAnalogUplink(payloadHex);
                    break;
                default:
                    parsedData = this.parseGenericUplink(payloadHex);
            }
            
            // Process and analyze data
            const processedData = {
                deviceId,
                siteId,
                fPort,
                payload: payloadHex,
                parsedData,
                timestamp: new Date().toISOString(),
                rssi: uplinkData.rssi,
                snr: uplinkData.snr,
                alerts: this.generateAlerts(parsedData, siteId)
            };
            
            // Update device state (in production, update database)
            await this.updateDeviceState(deviceId, processedData, siteId);
            
            return processedData;
            
        } catch (error) {
            console.error(`Failed to process uplink for site ${siteId}:`, error);
            throw new Error(`Uplink processing failed: ${error.message}`);
        }
    }

    parseStatusUplink(payloadHex) {
        // LT2222 status uplink format (fPort 1)
        const payload = Buffer.from(payloadHex, 'hex');
        
        if (payload.length < 10) {
            throw new Error('Invalid status uplink payload length');
        }
        
        const statusFlags = payload[0];
        const relayStates = payload[1];
        const digitalInputs = payload[2];
        const digitalOutputs = payload[3];
        const uptime = payload.readUInt32BE(4);
        const batteryVoltage = payload[8] / 10.0;
        const temperature = payload.readInt8(9);
        
        return {
            deviceFlags: this.parseDeviceFlags(statusFlags),
            relays: {
                relay1: !!(relayStates & 0x01),
                relay2: !!(relayStates & 0x02)
            },
            digitalInputs: {
                input1: !!(digitalInputs & 0x01),
                input2: !!(digitalInputs & 0x02),
                input3: !!(digitalInputs & 0x04),
                input4: !!(digitalInputs & 0x08)
            },
            digitalOutputs: {
                output1: !!(digitalOutputs & 0x01),
                output2: !!(digitalOutputs & 0x02),
                output3: !!(digitalOutputs & 0x04),
                output4: !!(digitalOutputs & 0x08)
            },
            uptime,
            batteryVoltage,
            temperature
        };
    }

    parseRelayStatusUplink(payloadHex) {
        const payload = Buffer.from(payloadHex, 'hex');
        return {
            relayStates: payload[0] & 0x03,
            timestamp: new Date().toISOString()
        };
    }

    parseDigitalIOStatusUplink(payloadHex) {
        const payload = Buffer.from(payloadHex, 'hex');
        return {
            inputStates: payload[0] & 0x0F,
            outputStates: (payload[0] >> 4) & 0x0F,
            timestamp: new Date().toISOString()
        };
    }

    parseAnalogUplink(payloadHex) {
        const payload = Buffer.from(payloadHex, 'hex');
        
        if (payload.length < 4) {
            throw new Error('Invalid analog uplink payload length');
        }
        
        return {
            analog1: payload.readUInt16BE(0) / 100.0,
            analog2: payload.readUInt16BE(2) / 100.0,
            timestamp: new Date().toISOString()
        };
    }

    parseGenericUplink(payloadHex) {
        return {
            rawPayload: payloadHex,
            length: payloadHex.length / 2,
            timestamp: new Date().toISOString()
        };
    }

    parseDeviceFlags(statusFlags) {
        const flags = {
            powerSupply: !!(statusFlags & 0x01),
            batteryLow: !!(statusFlags & 0x02),
            overcurrent: !!(statusFlags & 0x04),
            overtemperature: !!(statusFlags & 0x08),
            communicationError: !!(statusFlags & 0x10),
            configurationError: !!(statusFlags & 0x20),
            watchdogReset: !!(statusFlags & 0x40),
            tamperDetect: !!(statusFlags & 0x80)
        };
        
        return flags;
    }

    generateAlerts(parsedData, siteId) {
        const alerts = [];
        
        // Battery low alert
        if (parsedData.batteryVoltage && parsedData.batteryVoltage < 3.0) {
            alerts.push({
                type: 'battery_low',
                severity: 'warning',
                message: `Battery voltage low: ${parsedData.batteryVoltage}V`,
                value: parsedData.batteryVoltage,
                threshold: 3.0,
                siteId
            });
        }
        
        // Temperature alert
        if (parsedData.temperature && (parsedData.temperature < -10 || parsedData.temperature > 60)) {
            alerts.push({
                type: 'temperature_extreme',
                severity: 'critical',
                message: `Extreme temperature: ${parsedData.temperature}°C`,
                value: parsedData.temperature,
                threshold: parsedData.temperature < -10 ? -10 : 60,
                siteId
            });
        }
        
        // Device flag alerts
        if (parsedData.deviceFlags) {
            if (parsedData.deviceFlags.batteryLow) {
                alerts.push({
                    type: 'device_battery_low',
                    severity: 'warning',
                    message: 'Device battery low',
                    siteId
                });
            }
            
            if (parsedData.deviceFlags.overcurrent) {
                alerts.push({
                    type: 'overcurrent',
                    severity: 'critical',
                    message: 'Overcurrent detected',
                    siteId
                });
            }
            
            if (parsedData.deviceFlags.overtemperature) {
                alerts.push({
                    type: 'overtemperature',
                    severity: 'critical',
                    message: 'Device overtemperature',
                    siteId
                });
            }
            
            if (parsedData.deviceFlags.communicationError) {
                alerts.push({
                    type: 'communication_error',
                    severity: 'warning',
                    message: 'Communication error',
                    siteId
                });
            }
        }
        
        return alerts;
    }

    async updateDeviceState(deviceId, data, siteId) {
        // In production, update database with site isolation
        console.log(`Updated device state for site ${siteId}, device ${deviceId}:`, data);
        
        return {
            deviceId,
            siteId,
            lastUpdated: new Date().toISOString(),
            data
        };
    }

    async updateDeviceRelayState(deviceId, relayId, state, siteId) {
        console.log(`Updated relay ${relayId} state for site ${siteId}, device ${deviceId}: ${state}`);
        
        return {
            deviceId,
            siteId,
            relayId,
            state,
            timestamp: new Date().toISOString()
        };
    }

    async updateDeviceDigitalState(deviceId, pinId, state, mode, siteId) {
        console.log(`Updated digital pin ${pinId} state for site ${siteId}, device ${deviceId}: state=${state}, mode=${mode}`);
        
        return {
            deviceId,
            siteId,
            pinId,
            state,
            mode,
            timestamp: new Date().toISOString()
        };
    }

    async getRelayStatus(deviceId, siteId = 'default') {
        try {
            // In production, query database with site isolation
            return {
                deviceId,
                siteId,
                relays: {
                    relay1: false,
                    relay2: false
                },
                lastUpdated: new Date().toISOString()
            };
            
        } catch (error) {
            throw new Error(`Failed to get relay status: ${error.message}`);
        }
    }

    async getDigitalIOStatus(deviceId, siteId = 'default') {
        try {
            return {
                deviceId,
                siteId,
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
                lastUpdated: new Date().toISOString()
            };
            
        } catch (error) {
            throw new Error(`Failed to get digital I/O status: ${error.message}`);
        }
    }

    async getDeviceStatus(deviceId, siteId = 'default') {
        try {
            return {
                deviceId,
                siteId,
                online: this.isDeviceOnline(deviceId, siteId),
                lastSeen: new Date().toISOString(),
                batteryVoltage: null,
                temperature: null,
                uptime: 0,
                deviceFlags: {},
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
                signalStrength: null,
                signalQuality: null
            };
            
        } catch (error) {
            throw new Error(`Failed to get device status: ${error.message}`);
        }
    }

    async getAllDeviceStatus(siteId = 'default') {
        try {
            // In production, query all devices for this site
            return {
                siteId,
                devices: [],
                total: 0,
                online: 0,
                offline: 0
            };
            
        } catch (error) {
            throw new Error(`Failed to get all device status: ${error.message}`);
        }
    }

    isDeviceOnline(deviceId, siteId) {
        // In production, check last seen time from database
        return true; // Default to online for demo
    }

    // Site configuration management
    async addSiteConfig(siteId, config) {
        this.siteConfigs.set(siteId, config);
        return config;
    }

    async updateSiteConfig(siteId, config) {
        const existing = this.getSiteConfig(siteId);
        const updated = { ...existing, ...config };
        this.siteConfigs.set(siteId, updated);
        return updated;
    }

    async removeSiteConfig(siteId) {
        return this.siteConfigs.delete(siteId);
    }

    async getAllSiteConfigs() {
        const configs = {};
        for (const [siteId, config] of this.siteConfigs) {
            configs[siteId] = config;
        }
        return configs;
    }
}

module.exports = new LT2222Service();
