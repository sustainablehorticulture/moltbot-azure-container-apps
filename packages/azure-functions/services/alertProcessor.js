const { v4: uuidv4 } = require('uuid');

// In-memory storage for demo purposes. In production, use Azure Table Storage, Cosmos DB, or SQL Database
const alertConfigs = new Map();
const activeAlerts = new Map();
const alertHistory = [];

class AlertProcessor {
    constructor() {
        this.initializeDefaultConfigs();
    }

    initializeDefaultConfigs() {
        // Default sensor configurations for vineyard monitoring
        const defaultConfigs = [
            {
                sensorId: 'IR1OT',
                sensorName: 'IR Sensor 1 Canopy Temperature',
                alertType: 'high_temperature',
                threshold: {
                    min: null,
                    max: 35,
                    unit: '°C'
                },
                enabled: true,
                severity: 'warning',
                notifications: ['sms', 'email'],
                recipients: [
                    { type: 'sms', phone: '+1234567890', name: 'Vineyard Manager' },
                    { type: 'email', email: 'manager@vineyard.com', name: 'Vineyard Manager' }
                ],
                cooldown: 300, // 5 minutes between alerts
                hysteresis: 2, // 2°C hysteresis to prevent alert flapping
                schedule: {
                    enabled: true,
                    startTime: '06:00',
                    endTime: '20:00',
                    timezone: 'Australia/Sydney'
                }
            },
            {
                sensorId: 'RH',
                sensorName: 'Ambient Humidity',
                alertType: 'low_humidity',
                threshold: {
                    min: 30,
                    max: null,
                    unit: '%'
                },
                enabled: true,
                severity: 'info',
                notifications: ['email'],
                recipients: [
                    { type: 'email', email: 'manager@vineyard.com', name: 'Vineyard Manager' }
                ],
                cooldown: 600, // 10 minutes
                hysteresis: 5, // 5% hysteresis
                schedule: {
                    enabled: true,
                    startTime: '06:00',
                    endTime: '20:00',
                    timezone: 'Australia/Sydney'
                }
            },
            {
                sensorId: 'cwi',
                sensorName: 'Crop Water Index',
                alertType: 'water_stress',
                threshold: {
                    min: null,
                    max: 3.0,
                    unit: ''
                },
                enabled: true,
                severity: 'warning',
                notifications: ['sms', 'email'],
                recipients: [
                    { type: 'sms', phone: '+1234567890', name: 'Vineyard Manager' },
                    { type: 'email', email: 'manager@vineyard.com', name: 'Vineyard Manager' }
                ],
                cooldown: 1800, // 30 minutes
                hysteresis: 0.2,
                schedule: {
                    enabled: true,
                    startTime: '06:00',
                    endTime: '20:00',
                    timezone: 'Australia/Sydney'
                }
            }
        ];

        defaultConfigs.forEach(config => {
            alertConfigs.set(config.sensorId, {
                ...config,
                id: uuidv4(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
        });
    }

    async processAlert(alertData) {
        const {
            sensorId,
            value,
            timestamp = new Date().toISOString(),
            deviceId,
            blockName,
            siteName
        } = alertData;

        // Get alert configuration for this sensor
        const config = alertConfigs.get(sensorId);
        if (!config || !config.enabled) {
            return { processed: false, reason: 'No configuration found or disabled' };
        }

        // Check if within schedule
        if (config.schedule.enabled && !this.isWithinSchedule(config.schedule)) {
            return { processed: false, reason: 'Outside alert schedule' };
        }

        // Check cooldown period
        const lastAlert = activeAlerts.get(sensorId);
        if (lastAlert && this.isInCooldown(lastAlert, config.cooldown)) {
            return { processed: false, reason: 'In cooldown period' };
        }

        // Check threshold with hysteresis
        const thresholdCheck = this.checkThreshold(value, config.threshold, config.hysteresis, lastAlert);
        if (!thresholdCheck.triggered) {
            return { processed: false, reason: 'Threshold not met' };
        }

        // Create alert
        const alert = {
            id: uuidv4(),
            sensorId,
            sensorName: config.sensorName,
            alertType: config.alertType,
            severity: config.severity,
            value,
            threshold: thresholdCheck.effectiveThreshold,
            timestamp,
            deviceId,
            blockName: blockName || 'Unknown Block',
            siteName: siteName || 'Unknown Site',
            configId: config.id,
            acknowledged: false,
            resolved: false
        };

        // Store alert
        activeAlerts.set(sensorId, alert);
        alertHistory.push(alert);

        // Prepare notifications
        const notifications = config.notifications.map(notificationType => {
            const recipients = config.recipients.filter(r => r.type === notificationType);
            return {
                type: notificationType,
                recipients: recipients,
                message: this.generateAlertMessage(alert, config),
                subject: this.generateAlertSubject(alert, config)
            };
        });

        return {
            processed: true,
            alert,
            notifications: notifications.filter(n => n.recipients.length > 0)
        };
    }

    checkThreshold(value, threshold, hysteresis = 0, lastAlert = null) {
        const { min, max, unit } = threshold;
        
        // Apply hysteresis based on last alert direction
        let effectiveMin = min;
        let effectiveMax = max;
        
        if (lastAlert) {
            if (lastAlert.value > (max || 0)) {
                // Was above max, require going below max - hysteresis to trigger again
                effectiveMax = max - hysteresis;
            } else if (lastAlert.value < (min || 0)) {
                // Was below min, require going above min + hysteresis to trigger again
                effectiveMin = min + hysteresis;
            }
        }

        let triggered = false;
        let direction = null;

        if (max !== null && value > effectiveMax) {
            triggered = true;
            direction = 'above';
        } else if (min !== null && value < effectiveMin) {
            triggered = true;
            direction = 'below';
        }

        return {
            triggered,
            direction,
            effectiveThreshold: {
                min: effectiveMin,
                max: effectiveMax,
                unit
            }
        };
    }

    isWithinSchedule(schedule) {
        const now = new Date();
        const currentTime = this.convertToTimezone(now, schedule.timezone);
        const currentHour = currentTime.getHours();
        const currentMinute = currentTime.getMinutes();
        const currentTimeMinutes = currentHour * 60 + currentMinute;

        const [startHour, startMinute] = schedule.startTime.split(':').map(Number);
        const [endHour, endMinute] = schedule.endTime.split(':').map(Number);
        const startTimeMinutes = startHour * 60 + startMinute;
        const endTimeMinutes = endHour * 60 + endMinute;

        return currentTimeMinutes >= startTimeMinutes && currentTimeMinutes <= endTimeMinutes;
    }

    convertToTimezone(date, timezone) {
        // Simple timezone conversion - in production use moment-timezone or similar
        return new Date(date.toLocaleString("en-US", { timeZone: timezone }));
    }

    isInCooldown(lastAlert, cooldownSeconds) {
        const now = new Date();
        const lastAlertTime = new Date(lastAlert.timestamp);
        const elapsedSeconds = (now - lastAlertTime) / 1000;
        return elapsedSeconds < cooldownSeconds;
    }

    generateAlertMessage(alert, config) {
        const templates = {
            'high_temperature': `🌡️ HIGH TEMP ALERT: ${alert.blockName} - Current: ${alert.value}${config.threshold.unit}, Threshold: ${alert.threshold.max}${config.threshold.unit}. Immediate attention required!`,
            'low_humidity': `💧 LOW HUMIDITY ALERT: ${alert.blockName} - Current: ${alert.value}${config.threshold.unit}, Threshold: ${alert.threshold.min}${config.threshold.unit}. Consider irrigation.`,
            'water_stress': `🚰 WATER STRESS ALERT: ${alert.blockName} - CWI: ${alert.value}, Threshold: ${alert.threshold.max}. Increased irrigation needed.`,
            'soil_moisture': `🌱 SOIL MOISTURE ALERT: ${alert.blockName} - Current: ${alert.value}${config.threshold.unit}, Threshold: ${alert.threshold.min}${config.threshold.unit}. Irrigation recommended.`,
            'frost_warning': `❄️ FROST WARNING: ${alert.blockName} - Temperature: ${alert.value}${config.threshold.unit}. Frost protection measures advised.`,
            'sensor_offline': `📡 SENSOR OFFLINE: ${alert.blockName} - Sensor ${alert.sensorId} hasn't reported data since ${alert.timestamp}. Check connectivity.`
        };

        return templates[config.alertType] || `🍇 VINEYARD ALERT: ${alert.blockName} - ${config.alertType}: ${alert.value}${config.threshold.unit} (Threshold: ${alert.threshold.max || alert.threshold.min}${config.threshold.unit})`;
    }

    generateAlertSubject(alert, config) {
        const emoji = {
            'high_temperature': '🌡️',
            'low_humidity': '💧',
            'water_stress': '🚰',
            'soil_moisture': '🌱',
            'frost_warning': '❄️',
            'sensor_offline': '📡'
        };

        const alertEmoji = emoji[config.alertType] || '🍇';
        return `${alertEmoji} ${config.alertType.replace('_', ' ').toUpperCase()} Alert - ${alert.blockName}`;
    }

    // Configuration management methods
    async createAlertConfig(configData) {
        const config = {
            id: uuidv4(),
            ...configData,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        // Validate configuration
        this.validateConfig(config);
        alertConfigs.set(config.sensorId, config);

        return config;
    }

    async getAlertConfig(sensorId) {
        return alertConfigs.get(sensorId) || null;
    }

    async getAllAlertConfigs() {
        return Array.from(alertConfigs.values());
    }

    async updateAlertConfig(sensorId, updateData) {
        const existing = alertConfigs.get(sensorId);
        if (!existing) {
            throw new Error(`Alert configuration for sensor ${sensorId} not found`);
        }

        const updated = {
            ...existing,
            ...updateData,
            id: existing.id, // Preserve ID
            sensorId, // Preserve sensorId
            updatedAt: new Date().toISOString()
        };

        this.validateConfig(updated);
        alertConfigs.set(sensorId, updated);

        return updated;
    }

    async deleteAlertConfig(sensorId) {
        const deleted = alertConfigs.delete(sensorId);
        if (!deleted) {
            throw new Error(`Alert configuration for sensor ${sensorId} not found`);
        }

        // Also clear any active alerts for this sensor
        activeAlerts.delete(sensorId);

        return true;
    }

    validateConfig(config) {
        const required = ['sensorId', 'sensorName', 'alertType', 'threshold', 'notifications', 'recipients'];
        const missing = required.filter(field => !config[field]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required fields: ${missing.join(', ')}`);
        }

        // Validate threshold
        if (!config.threshold.min && !config.threshold.max) {
            throw new Error('Threshold must have at least min or max value');
        }

        // Validate recipients
        for (const recipient of config.recipients) {
            if (recipient.type === 'sms' && !recipient.phone) {
                throw new Error('SMS recipients must have a phone number');
            }
            if (recipient.type === 'email' && !recipient.email) {
                throw new Error('Email recipients must have an email address');
            }
        }

        // Validate notification types
        const validTypes = ['sms', 'email'];
        for (const type of config.notifications) {
            if (!validTypes.includes(type)) {
                throw new Error(`Invalid notification type: ${type}`);
            }
        }
    }

    // Alert management methods
    async acknowledgeAlert(alertId) {
        const alert = alertHistory.find(a => a.id === alertId);
        if (alert) {
            alert.acknowledged = true;
            alert.acknowledgedAt = new Date().toISOString();
            return alert;
        }
        throw new Error(`Alert ${alertId} not found`);
    }

    async resolveAlert(alertId) {
        const alert = alertHistory.find(a => a.id === alertId);
        if (alert) {
            alert.resolved = true;
            alert.resolvedAt = new Date().toISOString();
            
            // Clear from active alerts if it's the same sensor
            const activeAlert = activeAlerts.get(alert.sensorId);
            if (activeAlert && activeAlert.id === alertId) {
                activeAlerts.delete(alert.sensorId);
            }
            
            return alert;
        }
        throw new Error(`Alert ${alertId} not found`);
    }

    async getActiveAlerts() {
        return Array.from(activeAlerts.values());
    }

    async getAlertHistory(limit = 100, offset = 0) {
        return alertHistory
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(offset, offset + limit);
    }

    async getAlertStats() {
        const total = alertHistory.length;
        const active = activeAlerts.size;
        const byType = {};
        const bySeverity = {};

        alertHistory.forEach(alert => {
            byType[alert.alertType] = (byType[alert.alertType] || 0) + 1;
            bySeverity[alert.severity] = (bySeverity[alert.severity] || 0) + 1;
        });

        return {
            total,
            active,
            resolved: alertHistory.filter(a => a.resolved).length,
            acknowledged: alertHistory.filter(a => a.acknowledged).length,
            byType,
            bySeverity
        };
    }
}

module.exports = new AlertProcessor();
