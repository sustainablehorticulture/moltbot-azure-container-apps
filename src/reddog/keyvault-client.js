/**
 * KeyVaultClient — fetches secrets from Azure Key Vault.
 *
 * Authentication priority:
 *   1. Managed Identity (production / Azure Container Apps)
 *   2. Service Principal via env vars AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET (local dev)
 *
 * Usage:
 *   const kv = new KeyVaultClient();
 *   const secret = await kv.getSecret('GrassgumFarm', 'sensor-api-key');
 */

const axios = require('axios');

class KeyVaultClient {
    constructor() {
        this.tokenCache = new Map();   // vaultName → { token, expiry }
        this.secretCache = new Map();  // "vault:secret" → { value, expiry }
        this.secretCacheTTL = 10 * 60 * 1000; // 10 minutes
        this.apiVersion = '7.4';

        this.useServicePrincipal = !!(
            process.env.AZURE_TENANT_ID &&
            process.env.AZURE_CLIENT_ID &&
            process.env.AZURE_CLIENT_SECRET
        );

        console.log(`[KeyVault] Auth mode: ${this.useServicePrincipal ? 'Service Principal' : 'Managed Identity'}`);
    }

    // ── Token acquisition ──────────────────────────────────────────────────

    async _getManagedIdentityToken() {
        const response = await axios.get(
            'http://169.254.169.254/metadata/identity/oauth2/token',
            {
                params: { 'api-version': '2018-02-01', resource: 'https://vault.azure.net' },
                headers: { Metadata: 'true' },
                timeout: 5000
            }
        );
        return response.data;
    }

    async _getServicePrincipalToken() {
        const { AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET } = process.env;
        const body = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: AZURE_CLIENT_ID,
            client_secret: AZURE_CLIENT_SECRET,
            scope: 'https://vault.azure.net/.default'
        });
        const response = await axios.post(
            `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`,
            body.toString(),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        return response.data;
    }

    async _getToken() {
        const cached = this.tokenCache.get('__token__');
        if (cached && Date.now() < cached.expiry - 60000) return cached.token;

        try {
            const tokenData = this.useServicePrincipal
                ? await this._getServicePrincipalToken()
                : await this._getManagedIdentityToken();

            this.tokenCache.set('__token__', {
                token: tokenData.access_token,
                expiry: Date.now() + (tokenData.expires_in * 1000)
            });
            return tokenData.access_token;
        } catch (err) {
            throw new Error(`[KeyVault] Failed to acquire token: ${err.message}`);
        }
    }

    // ── Secret retrieval ───────────────────────────────────────────────────

    /**
     * Get a secret from a named Key Vault.
     * @param {string} vaultName  - e.g. "GrassgumFarm"
     * @param {string} secretName - e.g. "sensor-api-key"
     */
    async getSecret(vaultName, secretName) {
        const cacheKey = `${vaultName}:${secretName}`;
        const cached = this.secretCache.get(cacheKey);
        if (cached && Date.now() < cached.expiry) return cached.value;

        const token = await this._getToken();
        const url = `https://${vaultName}.vault.azure.net/secrets/${secretName}?api-version=${this.apiVersion}`;

        try {
            const response = await axios.get(url, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const value = response.data.value;
            this.secretCache.set(cacheKey, { value, expiry: Date.now() + this.secretCacheTTL });
            console.log(`[KeyVault] Fetched secret '${secretName}' from vault '${vaultName}'`);
            return value;
        } catch (err) {
            const status = err.response?.status;
            const message = err.response?.data?.error?.message || err.message;
            throw new Error(`[KeyVault] Failed to get '${secretName}' from '${vaultName}' (${status}): ${message}`);
        }
    }

    /**
     * Get multiple secrets from a vault at once.
     * @param {string} vaultName
     * @param {string[]} secretNames
     * @returns {Object} { secretName: value, ... }
     */
    async getSecrets(vaultName, secretNames) {
        const results = {};
        await Promise.all(secretNames.map(async (name) => {
            try {
                results[name] = await this.getSecret(vaultName, name);
            } catch (err) {
                console.warn(`[KeyVault] Could not fetch '${name}': ${err.message}`);
                results[name] = null;
            }
        }));
        return results;
    }

    clearCache() {
        this.tokenCache.clear();
        this.secretCache.clear();
    }
}

module.exports = KeyVaultClient;
