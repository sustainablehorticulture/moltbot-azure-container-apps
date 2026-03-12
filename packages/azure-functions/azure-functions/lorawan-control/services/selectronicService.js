const axios = require('axios');

const SELECT_LIVE_BASE = 'https://select.live/cgi-bin/solarmonweb';
const SESSION_TTL_MS = 25 * 60 * 1000; // 25 minutes (select.live sessions ~30 min)
const KV_API_VERSION = '7.4';

/**
 * SelectronicService
 *
 * Handles authentication and data fetching from Selectronic SP PRO via select.live.
 * Credentials are read from Azure Key Vault per farm using Managed Identity.
 *
 * Key Vault secrets required (per farm vault):
 *   - selectronic-site-id
 *   - selectronic-username
 *   - selectronic-password
 */
class SelectronicService {
    constructor() {
        this.sessionCache = new Map();  // farmName → { cookie, expiry }
        this.credCache = new Map();     // farmName → { siteId, username, password }
        this.kvTokenCache = null;       // { token, expiry }
    }

    // ── Key Vault ─────────────────────────────────────────────────────────

    _vaultName(farmName) {
        return farmName.replace(/\s+/g, '');
    }

    async _getKVToken() {
        if (this.kvTokenCache && Date.now() < this.kvTokenCache.expiry - 60000) {
            return this.kvTokenCache.token;
        }

        const useSpn = !!(process.env.AZURE_TENANT_ID && process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET);

        let tokenData;
        if (useSpn) {
            const body = new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: process.env.AZURE_CLIENT_ID,
                client_secret: process.env.AZURE_CLIENT_SECRET,
                scope: 'https://vault.azure.net/.default'
            });
            const res = await axios.post(
                `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
                body.toString(),
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );
            tokenData = res.data;
        } else {
            const res = await axios.get(
                'http://169.254.169.254/metadata/identity/oauth2/token',
                {
                    params: { 'api-version': '2018-02-01', resource: 'https://vault.azure.net' },
                    headers: { Metadata: 'true' },
                    timeout: 5000
                }
            );
            tokenData = res.data;
        }

        this.kvTokenCache = {
            token: tokenData.access_token,
            expiry: Date.now() + (tokenData.expires_in * 1000)
        };
        return this.kvTokenCache.token;
    }

    async _getSecret(vaultName, secretName) {
        const token = await this._getKVToken();
        const url = `https://${vaultName}.vault.azure.net/secrets/${secretName}?api-version=${KV_API_VERSION}`;
        const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
        return res.data.value;
    }

    async _getCredentials(farmName) {
        const cached = this.credCache.get(farmName);
        if (cached) return cached;

        const vault = this._vaultName(farmName);
        const [siteId, username, password] = await Promise.all([
            this._getSecret(vault, 'selectronic-site-id'),
            this._getSecret(vault, 'selectronic-username'),
            this._getSecret(vault, 'selectronic-password')
        ]);

        const creds = { siteId, username, password };
        this.credCache.set(farmName, creds);
        // Expire credentials cache after 1 hour
        setTimeout(() => this.credCache.delete(farmName), 60 * 60 * 1000);
        return creds;
    }

    // ── Session auth ──────────────────────────────────────────────────────

    async _login(username, password) {
        const body = new URLSearchParams({ username, password });
        const res = await axios.post(
            `${SELECT_LIVE_BASE}/login`,
            body.toString(),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                maxRedirects: 0,
                validateStatus: s => s < 400,
                timeout: 10000
            }
        );

        const setCookie = res.headers['set-cookie'];
        if (!setCookie) throw new Error('Selectronic login failed: no Set-Cookie header returned');

        const sessionCookie = setCookie
            .map(c => c.split(';')[0])
            .find(c => c.startsWith('SelectLive_Session='));

        if (!sessionCookie) throw new Error('Selectronic login failed: SelectLive_Session cookie not found');
        return sessionCookie;
    }

    async _getSession(farmName) {
        const cached = this.sessionCache.get(farmName);
        if (cached && Date.now() < cached.expiry) return cached.cookie;

        const { username, password } = await this._getCredentials(farmName);
        const cookie = await this._login(username, password);

        this.sessionCache.set(farmName, { cookie, expiry: Date.now() + SESSION_TTL_MS });
        return cookie;
    }

    _authHeaders(cookie) {
        return { Cookie: cookie, 'Content-Type': 'application/json' };
    }

    // ── Data methods ──────────────────────────────────────────────────────

    /**
     * Latest readings for a farm (battery SoC, solar/grid/load power, daily energy).
     */
    async getLatest(farmName) {
        const { siteId } = await this._getCredentials(farmName);
        const cookie = await this._getSession(farmName);

        const res = await axios.get(
            `${SELECT_LIVE_BASE}/dashboard/hfdata/${siteId}`,
            { headers: this._authHeaders(cookie), timeout: 15000 }
        );

        return {
            farmName,
            provider: 'selectronic',
            siteId,
            timestamp: new Date().toISOString(),
            data: this._normalise(res.data)
        };
    }

    /**
     * List devices (SP PRO units) registered to the site.
     */
    async getDevices(farmName) {
        const { siteId } = await this._getCredentials(farmName);
        const cookie = await this._getSession(farmName);

        const res = await axios.get(
            `${SELECT_LIVE_BASE}/devices/${siteId}`,
            { headers: this._authHeaders(cookie), timeout: 15000 }
        );

        return {
            farmName,
            siteId,
            timestamp: new Date().toISOString(),
            devices: res.data
        };
    }

    /**
     * Historical data. select.live returns daily summaries — hours param used as a guide.
     */
    async getHistory(farmName, hours = 24) {
        const { siteId } = await this._getCredentials(farmName);
        const cookie = await this._getSession(farmName);

        const res = await axios.get(
            `${SELECT_LIVE_BASE}/dashboard/hfdata/${siteId}`,
            {
                headers: this._authHeaders(cookie),
                params: { period: hours <= 24 ? 'day' : 'week' },
                timeout: 15000
            }
        );

        return {
            farmName,
            siteId,
            hours,
            timestamp: new Date().toISOString(),
            data: res.data
        };
    }

    // ── Normalisation ────────────────────────────────────────────────────

    _normalise(raw) {
        if (!raw || typeof raw !== 'object') return raw;

        const out = {};
        for (const [key, value] of Object.entries(raw)) {
            // Fields ending in _wh_ are reported in kWh despite the name
            const label = key.includes('_wh_') ? key.replace('_wh_', '_kwh_') : key;
            out[label] = value;
        }
        return out;
    }
}

module.exports = new SelectronicService();
