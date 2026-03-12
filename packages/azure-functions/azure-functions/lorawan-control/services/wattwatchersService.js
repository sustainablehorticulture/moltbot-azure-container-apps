const axios = require('axios');

const WATTWATCHERS_API_BASE = 'https://api-v3.wattwatchers.com.au';

class WattwatchersService {
    constructor() {
        this.siteConfigs = new Map();
        this.initializeDefaultConfigs();
    }

    initializeDefaultConfigs() {
        const defaultConfig = {
            apiKey: process.env.WATTWATCHERS_API_KEY,
            deviceIds: process.env.WATTWATCHERS_DEVICE_IDS ? process.env.WATTWATCHERS_DEVICE_IDS.split(',') : []
        };
        this.siteConfigs.set('default', defaultConfig);
    }

    getSiteConfig(siteId) {
        return this.siteConfigs.get(siteId) || this.siteConfigs.get('default');
    }

    getHeaders(siteId) {
        const config = this.getSiteConfig(siteId);
        if (!config || !config.apiKey) {
            throw new Error(`Wattwatchers API key not configured for site: ${siteId}`);
        }
        return {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json'
        };
    }

    // ── Device Management ──────────────────────────────────────────────

    async listDevices(siteId) {
        try {
            const response = await axios.get(`${WATTWATCHERS_API_BASE}/devices`, {
                headers: this.getHeaders(siteId)
            });
            return {
                success: true,
                siteId,
                devices: response.data,
                total: Array.isArray(response.data) ? response.data.length : 0,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            throw new Error(`Failed to list Wattwatchers devices: ${error.response?.data?.message || error.message}`);
        }
    }

    async getDevice(deviceId, siteId) {
        try {
            const response = await axios.get(`${WATTWATCHERS_API_BASE}/devices/${deviceId}`, {
                headers: this.getHeaders(siteId)
            });
            return {
                success: true,
                siteId,
                device: response.data,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            throw new Error(`Failed to get Wattwatchers device ${deviceId}: ${error.response?.data?.message || error.message}`);
        }
    }

    // ── Switch Control ─────────────────────────────────────────────────

    async getSwitchStatus(deviceId, siteId) {
        try {
            const response = await axios.get(`${WATTWATCHERS_API_BASE}/devices/${deviceId}`, {
                headers: this.getHeaders(siteId)
            });
            const device = response.data;
            return {
                success: true,
                siteId,
                deviceId,
                switches: device.switches || [],
                latestStatus: device.latestStatus,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            throw new Error(`Failed to get switch status for ${deviceId}: ${error.response?.data?.message || error.message}`);
        }
    }

    async controlSwitch(deviceId, switchId, state, siteId) {
        // Validate state
        if (state !== 'open' && state !== 'closed') {
            throw new Error('Switch state must be "open" or "closed"');
        }

        // Build the switch ID if not fully qualified (e.g. "S1" -> "D123456_S1")
        const fullSwitchId = switchId.includes('_') ? switchId : `${deviceId}_${switchId}`;

        const payload = {
            id: deviceId,
            switches: [
                {
                    id: fullSwitchId,
                    state: state
                }
            ]
        };

        try {
            const response = await axios.patch(
                `${WATTWATCHERS_API_BASE}/devices/${deviceId}`,
                payload,
                { headers: this.getHeaders(siteId) }
            );
            return {
                success: true,
                siteId,
                deviceId,
                switchId: fullSwitchId,
                requestedState: state,
                response: response.data,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            const status = error.response?.status;
            let message = error.response?.data?.message || error.message;
            if (status === 403) {
                message = 'Switching not permitted for this API key. Contact Wattwatchers Support to enable switching.';
            } else if (status === 422) {
                message = `Unprocessable: ${message}. Check switch ID and device state.`;
            }
            throw new Error(`Failed to control switch ${fullSwitchId} on ${deviceId}: ${message}`);
        }
    }

    async controlMultipleSwitches(deviceId, switches, siteId) {
        // switches = [{ switchId: "S1", state: "open" }, { switchId: "S2", state: "closed" }]
        const switchPayload = switches.map(sw => {
            const fullSwitchId = sw.switchId.includes('_') ? sw.switchId : `${deviceId}_${sw.switchId}`;
            if (sw.state !== 'open' && sw.state !== 'closed') {
                throw new Error(`Invalid state "${sw.state}" for switch ${sw.switchId}. Must be "open" or "closed".`);
            }
            return {
                id: fullSwitchId,
                state: sw.state
            };
        });

        const payload = {
            id: deviceId,
            switches: switchPayload
        };

        try {
            const response = await axios.patch(
                `${WATTWATCHERS_API_BASE}/devices/${deviceId}`,
                payload,
                { headers: this.getHeaders(siteId) }
            );
            return {
                success: true,
                siteId,
                deviceId,
                switchesRequested: switches.length,
                response: response.data,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            const status = error.response?.status;
            let message = error.response?.data?.message || error.message;
            if (status === 403) {
                message = 'Switching not permitted for this API key. Contact Wattwatchers Support to enable switching.';
            }
            throw new Error(`Failed to control switches on ${deviceId}: ${message}`);
        }
    }

    // ── Switch Configuration ───────────────────────────────────────────

    async configureSwitchContactor(deviceId, switchId, contactorType, siteId) {
        if (contactorType !== 'NO' && contactorType !== 'NC') {
            throw new Error('contactorType must be "NO" (Normally Open) or "NC" (Normally Closed)');
        }

        const fullSwitchId = switchId.includes('_') ? switchId : `${deviceId}_${switchId}`;

        const payload = {
            id: deviceId,
            switches: [
                {
                    id: fullSwitchId,
                    contactorType: contactorType
                }
            ]
        };

        try {
            const response = await axios.patch(
                `${WATTWATCHERS_API_BASE}/devices/${deviceId}`,
                payload,
                { headers: this.getHeaders(siteId) }
            );
            return {
                success: true,
                siteId,
                deviceId,
                switchId: fullSwitchId,
                contactorType,
                response: response.data,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            throw new Error(`Failed to configure contactor for ${fullSwitchId}: ${error.response?.data?.message || error.message}`);
        }
    }

    async configureSwitchLabels(deviceId, switchId, labels, siteId) {
        const fullSwitchId = switchId.includes('_') ? switchId : `${deviceId}_${switchId}`;

        const switchConfig = { id: fullSwitchId };
        if (labels.label) switchConfig.label = labels.label;
        if (labels.closedStateLabel) switchConfig.closedStateLabel = labels.closedStateLabel;
        if (labels.openStateLabel) switchConfig.openStateLabel = labels.openStateLabel;

        const payload = {
            id: deviceId,
            switches: [switchConfig]
        };

        try {
            const response = await axios.patch(
                `${WATTWATCHERS_API_BASE}/devices/${deviceId}`,
                payload,
                { headers: this.getHeaders(siteId) }
            );
            return {
                success: true,
                siteId,
                deviceId,
                switchId: fullSwitchId,
                labels,
                response: response.data,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            throw new Error(`Failed to configure labels for ${fullSwitchId}: ${error.response?.data?.message || error.message}`);
        }
    }

    // ── Energy Data ────────────────────────────────────────────────────

    async getShortEnergy(deviceId, siteId, fromTs, toTs) {
        try {
            let url = `${WATTWATCHERS_API_BASE}/short-energy/${deviceId}`;
            const params = {};
            if (fromTs) params.fromTs = fromTs;
            if (toTs) params.toTs = toTs;

            const response = await axios.get(url, {
                headers: this.getHeaders(siteId),
                params
            });
            return {
                success: true,
                siteId,
                deviceId,
                data: response.data,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            throw new Error(`Failed to get short energy for ${deviceId}: ${error.response?.data?.message || error.message}`);
        }
    }

    async getShortEnergyLatest(deviceId, siteId) {
        try {
            const response = await axios.get(`${WATTWATCHERS_API_BASE}/short-energy/${deviceId}/latest`, {
                headers: this.getHeaders(siteId)
            });
            return {
                success: true,
                siteId,
                deviceId,
                data: response.data,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            throw new Error(`Failed to get latest short energy for ${deviceId}: ${error.response?.data?.message || error.message}`);
        }
    }

    async getLongEnergy(deviceId, siteId, fromTs, toTs) {
        try {
            let url = `${WATTWATCHERS_API_BASE}/long-energy/${deviceId}`;
            const params = {};
            if (fromTs) params.fromTs = fromTs;
            if (toTs) params.toTs = toTs;

            const response = await axios.get(url, {
                headers: this.getHeaders(siteId),
                params
            });
            return {
                success: true,
                siteId,
                deviceId,
                data: response.data,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            throw new Error(`Failed to get long energy for ${deviceId}: ${error.response?.data?.message || error.message}`);
        }
    }

    async getLongEnergyLatest(deviceId, siteId) {
        try {
            const response = await axios.get(`${WATTWATCHERS_API_BASE}/long-energy/${deviceId}/latest`, {
                headers: this.getHeaders(siteId)
            });
            return {
                success: true,
                siteId,
                deviceId,
                data: response.data,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            throw new Error(`Failed to get latest long energy for ${deviceId}: ${error.response?.data?.message || error.message}`);
        }
    }

    // ── Site Configuration ─────────────────────────────────────────────

    async addSiteConfig(siteId, config) {
        this.siteConfigs.set(siteId, config);
        return { success: true, siteId, timestamp: new Date().toISOString() };
    }

    async updateSiteConfig(siteId, config) {
        const existing = this.getSiteConfig(siteId);
        const updated = { ...existing, ...config };
        this.siteConfigs.set(siteId, updated);
        return { success: true, siteId, timestamp: new Date().toISOString() };
    }
}

module.exports = new WattwatchersService();
