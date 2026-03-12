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
const path = require('path');
const fs = require('fs');
const FarmConfig = require('./farm-config');
const KeyVaultClient = require('./keyvault-client');

class SensorAPIClient {
    constructor(db) {
        this.farmConfig = new FarmConfig(db);
        this.keyVault = new KeyVaultClient();
        this.apimBaseUrl = (process.env.SENSOR_APIM_URL || '').replace(/\/$/, '');
        this.apimKey = process.env.SENSOR_APIM_KEY;
        this.enabled = !!(this.apimBaseUrl);
        this.registry = this._loadRegistry();
    }

    _loadRegistry() {
        try {
            const registryPath = path.join(__dirname, 'sensor-providers.json');
            return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
        } catch (err) {
            console.warn('[SensorAPI] Could not load sensor-providers.json:', err.message);
            return { providers: {}, farmProviders: {} };
        }
    }

    /**
     * Get the list of providers available for a specific farm.
     * Source priority:
     *   1. `IoT Infrastructure` table in zerosumag DB (written by Trevor on provisioning)
     *   2. `farmProviders` map in sensor-providers.json (static fallback)
     *   3. All providers in the registry (last resort)
     *
     * Each provider entry may include APIMPath/KeyVaultName overrides from the DB row.
     */
    async getProvidersForFarm(farmName) {
        // 1. Try database IoT Infrastructure table
        try {
            const dbRows = await this.farmConfig.getProviders(farmName);
            if (dbRows && dbRows.length) {
                return dbRows.map(row => {
                    const registryEntry = this.registry.providers?.[row.providerId] || {};
                    return {
                        id: row.providerId,
                        ...registryEntry,
                        // DB overrides take precedence over registry defaults
                        ...(row.apimPathOverride ? { apimPath: row.apimPathOverride } : {}),
                        ...(row.keyVaultNameOverride ? { _keyVaultNameOverride: row.keyVaultNameOverride } : {})
                    };
                });
            }
        } catch (err) {
            console.warn(`[SensorAPI] DB provider lookup failed for "${farmName}": ${err.message}`);
        }

        // 2. Fall back to JSON farmProviders map
        const farmList = this.registry.farmProviders?.[farmName];
        if (farmList && farmList.length) {
            return farmList
                .map(id => ({ id, ...this.registry.providers[id] }))
                .filter(p => p.name);
        }

        // 3. Last resort — return all registered providers
        return Object.entries(this.registry.providers)
            .map(([id, info]) => ({ id, ...info }));
    }

    /**
     * Get a provider's config from the registry.
     */
    getProvider(providerId) {
        return this.registry.providers?.[providerId] || null;
    }

    // ── Internal helpers ───────────────────────────────────────────────────

    /**
     * Get the API key for a specific provider from the farm's Key Vault.
     * Each provider has its own secret (e.g. 'selectronic-api-key', 'weather-api-key').
     * Falls back to 'sensor-api-key' if provider-specific secret not found.
     */
    async _getFarmApiKey(farmName, providerId = null) {
        const config = await this.farmConfig.getFarmConfig(farmName);
        const providerInfo = providerId ? this.getProvider(providerId) : null;
        const secretName = providerInfo?.keyVaultSecret
            || process.env.SENSOR_KEYVAULT_SECRET
            || 'sensor-api-key';

        try {
            return await this.keyVault.getSecret(config.keyVaultName, secretName);
        } catch (err) {
            // Try generic fallback secret
            if (secretName !== 'sensor-api-key') {
                try {
                    return await this.keyVault.getSecret(config.keyVaultName, 'sensor-api-key');
                } catch (_) {}
            }
            console.warn(`[SensorAPI] No API key in '${config.keyVaultName}' for provider '${providerId || 'generic'}': ${err.message}`);
            return null;
        }
    }

    _buildHeaders(farmName, apiKey, providerId = null) {
        const headers = {
            'X-Farm-Name': farmName,
            'X-Site-Id': farmName
        };
        if (this.apimKey) headers['Ocp-Apim-Subscription-Key'] = this.apimKey;
        if (apiKey) headers['X-Api-Key'] = apiKey;
        if (providerId) headers['X-Provider'] = providerId;
        return headers;
    }

    async _get(endpoint, farmName, params = {}, providerId = null) {
        if (!this.enabled) {
            throw new Error('SENSOR_APIM_URL not configured. Set it in your .env file.');
        }
        const apiKey = await this._getFarmApiKey(farmName, providerId);
        const url = `${this.apimBaseUrl}${endpoint}`;
        const response = await axios.get(url, {
            headers: this._buildHeaders(farmName, apiKey, providerId),
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
        const providerInfo = provider ? this.getProvider(provider) : null;
        const endpoint = providerInfo?.apimPath
            ? `${providerInfo.apimPath}/latest`
            : (provider ? `/sensors/${provider}/latest` : '/sensors/all');
        const data = await this._get(endpoint, farmName, {}, provider);
        return { farmName, provider: provider || 'all', timestamp: new Date().toISOString(), data };
    }

    /**
     * Get historical sensor readings.
     * @param {string} farmName
     * @param {string} provider
     * @param {number} hours
     */
    async getHistory(farmName, provider, hours = 24) {
        const providerInfo = provider ? this.getProvider(provider) : null;
        const endpoint = providerInfo?.apimPath
            ? `${providerInfo.apimPath}/history`
            : `/sensors/${provider}/history`;
        const data = await this._get(endpoint, farmName, { hours }, provider);
        return { farmName, provider, hours, data };
    }

    /**
     * Get readings for a specific device.
     * @param {string} farmName
     * @param {string} provider
     * @param {string} deviceId
     */
    async getDeviceReadings(farmName, provider, deviceId) {
        const providerInfo = provider ? this.getProvider(provider) : null;
        const endpoint = providerInfo?.apimPath
            ? `${providerInfo.apimPath}/devices/${deviceId}`
            : `/sensors/${provider}/devices/${deviceId}`;
        const data = await this._get(endpoint, farmName, {}, provider);
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
     * Get latest readings for ALL providers available to a farm, in parallel.
     * Each provider uses its own Key Vault secret.
     */
    async getAllProvidersLatest(farmName) {
        const providers = await this.getProvidersForFarm(farmName);
        const results = await Promise.allSettled(
            providers.map(p => this.getLatestReadings(farmName, p.id))
        );
        return results.map((r, i) => r.status === 'fulfilled'
            ? r.value
            : { farmName, provider: providers[i].id, error: r.reason.message }
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
