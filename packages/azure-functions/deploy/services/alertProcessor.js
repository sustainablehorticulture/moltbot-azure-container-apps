const { v4: uuidv4 } = require('uuid');

class AlertProcessor {
    constructor() {
        // Default alert configurations per site
        this.defaultConfigs = {
            temperature: {
                high: { threshold: 35, hysteresis: 2, enabled: true },
                low: { threshold: 5, hysteresis: 2, enabled: true }
            },
            humidity: {
                high: { threshold: 80, hysteresis: 5, enabled: true },
                low: { threshold: 30, hysteresis: 5, enabled: true }
            },
            soilMoisture: {
                low: { threshold: 30, hysteresis: 5, enabled: true }
            },
            battery: {
                low: { threshold: 20, hysteresis: 2, enabled: true }
            }
        };

        // Site-specific configurations (in production, store in database)
        this.siteConfigs = new Map();
        
        // Alert history and cooldown tracking
        this.alertHistory = new Map();
        this.cooldownPeriods = new Map();
    }

    async processAlert(alertData, siteId) {
        try {
            // Get site-specific configuration
            const config = await this.getConfig(siteId);
            
            // Find matching alert configuration
            const alertConfig = this.findAlertConfig(alertData.sensorId, config);
            
            if (!alertConfig || !alertConfig.enabled) {
                return {
                    alertId: uuidv4(),
                    shouldNotify: false,
                    reason: 'No matching configuration or disabled',
                    siteId
                };
            }

            // Check if alert should trigger
            const shouldTrigger = this.evaluateAlert(alertData, alertConfig, siteId);
            
            if (shouldTrigger.trigger) {
                // Generate alert
                const alert = {
                    alertId: uuidv4(),
                    siteId,
                    sensorId: alertData.sensorId,
                    deviceId: alertData.deviceId,
                    alertType: shouldTrigger.alertType,
                    severity: shouldTrigger.severity,
                    threshold: shouldTrigger.threshold,
                    actualValue: alertData.value,
                    message: shouldTrigger.message,
                    shouldNotify: true,
                    timestamp: new Date().toISOString()
                };

                // Update alert history and cooldown
                this.updateAlertHistory(alert);
                this.setCooldown(alertData.sensorId, alertConfig, siteId);

                return alert;
            } else {
                return {
                    alertId: uuidv4(),
                    shouldNotify: false,
                    reason: shouldTrigger.reason || 'Threshold not met or in cooldown',
                    siteId
                };
            }
        } catch (error) {
            console.error(`Error processing alert for site ${siteId}:`, error);
            throw error;
        }
    }

    findAlertConfig(sensorId, config) {
        // Extract sensor type from sensorId (e.g., "IR1OT" -> "temperature")
        const sensorType = this.getSensorType(sensorId);
        
        // Find configuration for this sensor type
        return config[sensorType] || null;
    }

    getSensorType(sensorId) {
        // Map sensor IDs to types
        const sensorMap = {
            'IR1OT': 'temperature',
            'IR2OT': 'temperature',
            'HM1RH': 'humidity',
            'HM2RH': 'humidity',
            'SM1SM': 'soilMoisture',
            'SM2SM': 'soilMoisture',
            'BT1VL': 'battery'
        };

        // Extract prefix (first 4 characters) to determine type
        const prefix = sensorId.substring(0, 4).toUpperCase();
        return sensorMap[prefix] || 'temperature'; // Default to temperature
    }

    evaluateAlert(alertData, config, siteId) {
        const { sensorId, value } = alertData;
        const sensorType = this.getSensorType(sensorId);

        // Check cooldown period
        if (this.isInCooldown(sensorId, config, siteId)) {
            return {
                trigger: false,
                reason: 'In cooldown period'
            };
        }

        // Evaluate based on sensor type
        switch (sensorType) {
            case 'temperature':
                return this.evaluateTemperatureAlert(value, config, sensorId);
            case 'humidity':
                return this.evaluateHumidityAlert(value, config, sensorId);
            case 'soilMoisture':
                return this.evaluateSoilMoistureAlert(value, config, sensorId);
            case 'battery':
                return this.evaluateBatteryAlert(value, config, sensorId);
            default:
                return {
                    trigger: false,
                    reason: 'Unknown sensor type'
                };
        }
    }

    evaluateTemperatureAlert(value, config, sensorId) {
        // Check high temperature
        if (config.high && config.high.enabled) {
            const threshold = config.high.threshold;
            const hysteresis = config.high.hysteresis;
            
            if (value > threshold) {
                return {
                    trigger: true,
                    alertType: 'high_temperature',
                    severity: value > threshold + 10 ? 'critical' : 'warning',
                    threshold: threshold,
                    message: `High temperature alert: ${value}°C (threshold: ${threshold}°C) for sensor ${sensorId}`
                };
            } else if (value > threshold - hysteresis && this.wasInHighAlert(sensorId)) {
                return {
                    trigger: true,
                    alertType: 'high_temperature',
                    severity: 'warning',
                    threshold: threshold,
                    message: `High temperature hysteresis: ${value}°C (threshold: ${threshold}°C, hysteresis: ${hysteresis}°C) for sensor ${sensorId}`
                };
            }
        }

        // Check low temperature
        if (config.low && config.low.enabled) {
            const threshold = config.low.threshold;
            const hysteresis = config.low.hysteresis;
            
            if (value < threshold) {
                return {
                    trigger: true,
                    alertType: 'low_temperature',
                    severity: value < threshold - 10 ? 'critical' : 'warning',
                    threshold: threshold,
                    message: `Low temperature alert: ${value}°C (threshold: ${threshold}°C) for sensor ${sensorId}`
                };
            } else if (value < threshold + hysteresis && this.wasInLowAlert(sensorId)) {
                return {
                    trigger: true,
                    alertType: 'low_temperature',
                    severity: 'warning',
                    threshold: threshold,
                    message: `Low temperature hysteresis: ${value}°C (threshold: ${threshold}°C, hysteresis: ${hysteresis}°C) for sensor ${sensorId}`
                };
            }
        }

        return { trigger: false, reason: 'Temperature within normal range' };
    }

    evaluateHumidityAlert(value, config, sensorId) {
        // Similar logic for humidity alerts
        if (config.high && config.high.enabled && value > config.high.threshold) {
            return {
                trigger: true,
                alertType: 'high_humidity',
                severity: 'warning',
                threshold: config.high.threshold,
                message: `High humidity alert: ${value}% (threshold: ${config.high.threshold}%) for sensor ${sensorId}`
            };
        }

        if (config.low && config.low.enabled && value < config.low.threshold) {
            return {
                trigger: true,
                alertType: 'low_humidity',
                severity: 'warning',
                threshold: config.low.threshold,
                message: `Low humidity alert: ${value}% (threshold: ${config.low.threshold}%) for sensor ${sensorId}`
            };
        }

        return { trigger: false, reason: 'Humidity within normal range' };
    }

    evaluateSoilMoistureAlert(value, config, sensorId) {
        if (config.low && config.low.enabled && value < config.low.threshold) {
            return {
                trigger: true,
                alertType: 'low_soil_moisture',
                severity: value < config.low.threshold - 20 ? 'critical' : 'warning',
                threshold: config.low.threshold,
                message: `Low soil moisture alert: ${value}% (threshold: ${config.low.threshold}%) for sensor ${sensorId}`
            };
        }

        return { trigger: false, reason: 'Soil moisture within normal range' };
    }

    evaluateBatteryAlert(value, config, sensorId) {
        if (config.low && config.low.enabled && value < config.low.threshold) {
            return {
                trigger: true,
                alertType: 'low_battery',
                severity: value < config.low.threshold - 10 ? 'critical' : 'warning',
                threshold: config.low.threshold,
                message: `Low battery alert: ${value}% (threshold: ${config.low.threshold}%) for device ${sensorId}`
            };
        }

        return { trigger: false, reason: 'Battery level normal' };
    }

    isInCooldown(sensorId, config, siteId) {
        const cooldownKey = `${siteId}-${sensorId}`;
        const lastAlert = this.alertHistory.get(cooldownKey);
        
        if (!lastAlert) return false;

        const cooldownPeriod = this.getCooldownPeriod(config);
        const timeSinceLastAlert = Date.now() - new Date(lastAlert.timestamp).getTime();
        
        return timeSinceLastAlert < cooldownPeriod;
    }

    getCooldownPeriod(config) {
        // Default cooldown periods (in milliseconds)
        const defaultCooldowns = {
            temperature: 30 * 60 * 1000, // 30 minutes
            humidity: 60 * 60 * 1000,    // 1 hour
            soilMoisture: 2 * 60 * 60 * 1000, // 2 hours
            battery: 4 * 60 * 60 * 1000  // 4 hours
        };

        // Use custom cooldown if configured, otherwise default
        return config.cooldownPeriod || defaultCooldowns.temperature || 30 * 60 * 1000;
    }

    setCooldown(sensorId, config, siteId) {
        const cooldownKey = `${siteId}-${sensorId}`;
        this.cooldownPeriods.set(cooldownKey, {
            timestamp: new Date().toISOString(),
            period: this.getCooldownPeriod(config)
        });
    }

    wasInHighAlert(sensorId) {
        const lastAlert = this.alertHistory.get(sensorId);
        return lastAlert && lastAlert.alertType === 'high_temperature';
    }

    wasInLowAlert(sensorId) {
        const lastAlert = this.alertHistory.get(sensorId);
        return lastAlert && lastAlert.alertType === 'low_temperature';
    }

    updateAlertHistory(alert) {
        const historyKey = `${alert.siteId}-${alert.sensorId}`;
        this.alertHistory.set(historyKey, alert);

        // Clean up old alerts (keep only last 1000 per site)
        if (this.alertHistory.size > 10000) {
            const keysToDelete = Array.from(this.alertHistory.keys()).slice(0, 1000);
            keysToDelete.forEach(key => this.alertHistory.delete(key));
        }
    }

    async getConfig(siteId) {
        // Return site-specific configuration or default
        return this.siteConfigs.get(siteId) || this.defaultConfigs;
    }

    async updateConfig(configData, siteId) {
        // Merge new configuration with existing
        const existingConfig = await this.getConfig(siteId);
        const updatedConfig = { ...existingConfig, ...configData };
        
        this.siteConfigs.set(siteId, updatedConfig);
        
        return updatedConfig;
    }

    async getAllConfigs() {
        // Return all site configurations
        const allConfigs = {};
        for (const [siteId, config] of this.siteConfigs) {
            allConfigs[siteId] = config;
        }
        return allConfigs;
    }

    getAlertHistory(siteId, sensorId = null, limit = 100) {
        const history = [];
        
        for (const [key, alert] of this.alertHistory) {
            if (key.startsWith(siteId)) {
                if (!sensorId || key.endsWith(sensorId)) {
                    history.push(alert);
                }
            }
        }

        // Sort by timestamp (newest first) and limit
        return history
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, limit);
    }

    getAlertStatistics(siteId, timeRange = '24h') {
        const history = this.getAlertHistory(siteId);
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
            default:
                startTime = new Date(now - 24 * 60 * 60 * 1000);
        }

        const recentAlerts = history.filter(alert => 
            new Date(alert.timestamp) >= startTime
        );

        return {
            siteId,
            timeRange,
            total: recentAlerts.length,
            byType: this.groupAlertsByType(recentAlerts),
            bySeverity: this.groupAlertsBySeverity(recentAlerts),
            bySensor: this.groupAlertsBySensor(recentAlerts)
        };
    }

    groupAlertsByType(alerts) {
        const groups = {};
        alerts.forEach(alert => {
            groups[alert.alertType] = (groups[alert.alertType] || 0) + 1;
        });
        return groups;
    }

    groupAlertsBySeverity(alerts) {
        const groups = { warning: 0, critical: 0 };
        alerts.forEach(alert => {
            groups[alert.severity] = (groups[alert.severity] || 0) + 1;
        });
        return groups;
    }

    groupAlertsBySensor(alerts) {
        const groups = {};
        alerts.forEach(alert => {
            groups[alert.sensorId] = (groups[alert.sensorId] || 0) + 1;
        });
        return groups;
    }
}

module.exports = new AlertProcessor();
