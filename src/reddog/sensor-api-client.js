/**
 * SensorAPIClient — calls Azure APIM sensor endpoints scoped per farm.
 *
 * Per-farm authentication flow:
 *   1. Look up farm in zerosumag `Site Overview` table → get Key Vault name
 *   2. Fetch sensor API key from that farm's Key Vault
 *   3. Call APIM endpoint with farm context headers + API key
 *
 * APIM URL convention:
 *   GET {SENSOR_APIM_URL}/sensors/{provider}/latest        → latest readings
 *   GET {SENSOR_APIM_URL}/sensors/{provider}/history       → historical (hours param)
 *   GET {SENSOR_APIM_URL}/sensors/all                      → all providers aggregated
 *
 * Required env vars:
 *   SENSOR_APIM_URL   — e.g. https://apim-zerosumag.azure-api.net/sensor-api
 *   SENSOR_APIM_KEY   — APIM subscription key (Red Dog's own APIM key)
 */

const axios = require('axios');
const FarmConfig = require('./farm-config');
const KeyVaultClient = require('./keyvault-client');

class SensorAPIClient {
    constructor(db) {
        this.farmConfig = new FarmConfig(db);
        this.keyVault = new KeyVaultClient();
        this.apimBaseUrl = (process.env.SENSOR_APIM_URL || '').replace(/\/$/, '');
        this.apimKey = process.env.SENSOR_APIM_KEY;
        this.enabled = !!(this.apimBaseUrl);
        this.keyVaultSecretName = process.env.SENSOR_KEYVAULT_SECRET || 'sensor-api-key';
    }

    // ── Internal helpers ───────────────────────────────────────────────────

    async _getFarmApiKey(farmName) {
        const config = await this.farmConfig.getFarmConfig(farmName);
        try {
            return await this.keyVault.getSecret(config.keyVaultName, this.keyVaultSecretName);
        } catch (err) {
            console.warn(`[SensorAPI] Could not get API key from Key Vault '${config.keyVaultName}': ${err.message}`);
            return null;
        }
    }

    _buildHeaders(farmName, apiKey) {
        const headers = {
            'X-Farm-Name': farmName,
            'X-Site-Id': farmName
        };
        if (this.apimKey) headers['Ocp-Apim-Subscription-Key'] = this.apimKey;
        if (apiKey) headers['X-Api-Key'] = apiKey;
        return headers;
    }

    async _get(endpoint, farmName, params = {}) {
        if (!this.enabled) {
            throw new Error('SENSOR_APIM_URL not configured. Set it in your .env file.');
        }
        const apiKey = await this._getFarmApiKey(farmName);
        const url = `${this.apimBaseUrl}${endpoint}`;
        const response = await axios.get(url, {
            headers: this._buildHeaders(farmName, apiKey),
            params: { siteId: farmName, ...params },
            timeout: 15000
        });
        return response.data;
    }

    // ── Public API ─────────────────────────────────────────────────────────

    /**
     * Get the latest sensor readings for a farm.
     * @param {string} farmName  - e.g. "Grassgum Farm"
     * @param {string|null} provider - e.g. "selectronic", "weather", null = all
     */
    async getLatestReadings(farmName, provider = null) {
        const endpoint = provider ? `/sensors/${provider}/latest` : '/sensors/all';
        const data = await this._get(endpoint, farmName);
        return { farmName, provider: provider || 'all', timestamp: new Date().toISOString(), data };
    }

    /**
     * Get historical sensor readings.
     * @param {string} farmName
     * @param {string} provider
     * @param {number} hours
     */
    async getHistory(farmName, provider, hours = 24) {
        const endpoint = `/sensors/${provider}/history`;
        const data = await this._get(endpoint, farmName, { hours });
        return { farmName, provider, hours, data };
    }

    /**
     * Get readings for a specific device.
     * @param {string} farmName
     * @param {string} provider
     * @param {string} deviceId
     */
    async getDeviceReadings(farmName, provider, deviceId) {
        const endpoint = `/sensors/${provider}/devices/${deviceId}`;
        const data = await this._get(endpoint, farmName);
        return { farmName, provider, deviceId, data };
    }

    /**
     * Get current readings for the default farm (from FARM_ID env var).
     */
    async getDefaultFarmReadings(provider = null) {
        const config = await this.farmConfig.getDefaultFarm();
        return this.getLatestReadings(config.name, provider);
    }

    /**
     * Aggregate latest readings across ALL active farms.
     */
    async getAllFarmsReadings(provider = null) {
        const farms = await this.farmConfig.listFarms();
        const results = await Promise.allSettled(
            farms.map(farm => this.getLatestReadings(farm.name, provider))
        );
        return results.map((r, i) => r.status === 'fulfilled'
            ? r.value
            : { farmName: farms[i].name, provider: provider || 'all', error: r.reason.message }
        );
    }

    /**
     * List all farms from Site Overview table.
     */
    async listFarms() {
        return this.farmConfig.listFarms();
    }

    /**
     * Get a farm's Key Vault name without calling the API.
     */
    async getFarmVaultName(farmName) {
        const config = await this.farmConfig.getFarmConfig(farmName);
        return config.keyVaultName;
    }
}

module.exports = SensorAPIClient;
