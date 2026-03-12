const axios = require('axios');

class FunctionsClient {
    constructor() {
        this.baseUrl = (process.env.AZURE_FUNCTIONS_URL || '').replace(/\/$/, '');
        this.functionKey = process.env.AZURE_FUNCTIONS_KEY;
        this.siteId = process.env.WATTWATCHERS_SITE_ID || 'default';
        this.enabled = !!(this.baseUrl && this.functionKey);

        if (this.enabled) {
            console.log(`[FunctionsClient] Connected to Azure Functions: ${this.baseUrl}`);
        } else {
            console.warn('[FunctionsClient] Azure Functions URL or key not set — device control disabled');
        }
    }

    getHeaders() {
        return {
            'x-functions-key': this.functionKey,
            'Content-Type': 'application/json'
        };
    }

    async request(method, path, body = null) {
        if (!this.enabled) {
            throw new Error('Azure Functions not configured. Set AZURE_FUNCTIONS_URL and AZURE_FUNCTIONS_KEY.');
        }
        try {
            const response = await axios({
                method,
                url: `${this.baseUrl}/${path}`,
                headers: this.getHeaders(),
                data: body || undefined,
                timeout: 15000
            });
            return response.data;
        } catch (error) {
            const msg = error.response?.data?.message || error.message;
            throw new Error(`Azure Functions error (${method.toUpperCase()} ${path}): ${msg}`);
        }
    }

    // ── LoRaWAN Device Management ────────────────────────────────────────

    async getLoRaWANDevices() {
        return this.request('get', 'lorawan/device');
    }

    async getLoRaWANDevice(deviceId) {
        return this.request('get', `lorawan/device/${deviceId}`);
    }

    async getLoRaWANStatus(deviceId) {
        return this.request('get', `lorawan/status/${deviceId}`);
    }

    // ── LoRaWAN Relay Control ────────────────────────────────────────────

    async getRelayStatus(deviceId) {
        return this.request('get', `lorawan/relay/${deviceId}`);
    }

    async controlRelay(deviceId, relayId, state) {
        return this.request('post', `lorawan/relay/${deviceId}`, {
            relayId: parseInt(relayId),
            state: Boolean(state)
        });
    }

    // ── LoRaWAN Digital I/O Control ──────────────────────────────────────

    async getDigitalIOStatus(deviceId) {
        return this.request('get', `lorawan/digital/${deviceId}`);
    }

    async controlDigitalIO(deviceId, pinId, state, mode = 'output') {
        return this.request('post', `lorawan/digital/${deviceId}`, {
            pinId: parseInt(pinId),
            state: Boolean(state),
            mode
        });
    }

    // ── WattWatchers Device Management ───────────────────────────────────

    async getWattwatchersDevices(siteId = null) {
        const site = siteId || this.siteId;
        return this.request('get', `wattwatchers/${site}/devices`);
    }

    async getWattwatchersDevice(deviceId, siteId = null) {
        const site = siteId || this.siteId;
        return this.request('get', `wattwatchers/${site}/devices/${deviceId}`);
    }

    // ── WattWatchers Switch Control ──────────────────────────────────────

    async getSwitchStatus(deviceId, siteId = null) {
        const site = siteId || this.siteId;
        return this.request('get', `wattwatchers/${site}/switches/${deviceId}`);
    }

    async controlSwitch(deviceId, switchId, state, siteId = null) {
        const site = siteId || this.siteId;
        if (state !== 'open' && state !== 'closed') {
            throw new Error(`Invalid switch state "${state}" — must be "open" or "closed"`);
        }
        return this.request('patch', `wattwatchers/${site}/switches/${deviceId}`, {
            switchId,
            state
        });
    }

    // ── WattWatchers Energy Data ─────────────────────────────────────────

    async getEnergyLatest(deviceId, siteId = null) {
        const site = siteId || this.siteId;
        return this.request('get', `wattwatchers/${site}/energy-latest/${deviceId}`);
    }

    async getEnergy(deviceId, fromTs, toTs, siteId = null) {
        const site = siteId || this.siteId;
        let path = `wattwatchers/${site}/energy/${deviceId}`;
        const params = [];
        if (fromTs) params.push(`fromTs=${fromTs}`);
        if (toTs) params.push(`toTs=${toTs}`);
        if (params.length) path += `?${params.join('&')}`;
        return this.request('get', path);
    }

    getStatus() {
        return {
            enabled: this.enabled,
            baseUrl: this.enabled ? this.baseUrl : null,
            siteId: this.siteId
        };
    }
}

module.exports = FunctionsClient;
