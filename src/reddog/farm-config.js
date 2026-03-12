/**
 * FarmConfig — reads farm site details from the zerosumag `Site Overview` table.
 * Derives the per-farm Key Vault name by converting the farm name to PascalCase,
 * e.g.  "Grassgum Farm"  →  "GrassgumFarm"
 */

class FarmConfig {
    constructor(db) {
        this.db = db;
        this.cache = new Map();
        this.cacheTTL = 5 * 60 * 1000; // 5 minutes
        this.defaultFarm = process.env.FARM_ID || 'Grassgum Farm';
    }

    // "Grassgum Farm" → "GrassgumFarm"
    deriveKeyVaultName(farmName) {
        return farmName
            .split(/\s+/)
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join('');
    }

    async _query(where = '', params = []) {
        if (!this.db || !this.db.isConnected) {
            throw new Error('Database not connected — cannot load farm configuration');
        }
        const sql = `SELECT TOP 100 * FROM [dbo].[Site Overview]${where ? ' WHERE ' + where : ''}`;
        return this.db.query(sql, params, 'zerosumag');
    }

    async getFarmConfig(farmName) {
        const key = farmName.toLowerCase();
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.ts < this.cacheTTL) return cached.config;

        let rows;
        try {
            rows = await this._query('Name = @Name', [{ name: 'Name', value: farmName }]);
        } catch (err) {
            // Try Site_Overview (underscore variant)
            try {
                const sql = `SELECT TOP 1 * FROM [dbo].[Site_Overview] WHERE Name = @Name`;
                rows = await this.db.query(sql, [{ name: 'Name', value: farmName }], 'zerosumag');
            } catch (_) {
                throw err;
            }
        }

        if (!rows || !rows.length) {
            throw new Error(`Farm "${farmName}" not found in Site Overview table`);
        }

        const site = rows[0];
        const config = {
            name: site.Name || farmName,
            keyVaultName: this.deriveKeyVaultName(site.Name || farmName),
            siteData: site
        };

        this.cache.set(key, { config, ts: Date.now() });
        console.log(`[FarmConfig] Loaded: ${config.name} → Key Vault: ${config.keyVaultName}`);
        return config;
    }

    async getDefaultFarm() {
        return this.getFarmConfig(this.defaultFarm);
    }

    async listFarms() {
        const cacheKey = '__all__';
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.ts < this.cacheTTL) return cached.config;

        let rows;
        try {
            rows = await this._query();
        } catch (err) {
            console.warn('[FarmConfig] listFarms failed:', err.message);
            return [];
        }

        const farms = (rows || []).map(site => ({
            name: site.Name,
            keyVaultName: this.deriveKeyVaultName(site.Name)
        }));

        this.cache.set(cacheKey, { config: farms, ts: Date.now() });
        return farms;
    }

    /**
     * Get the list of sensor API providers configured for a farm.
     * Reads from the `IoT Infrastructure` table in zerosumag — written by Trevor
     * when provisioning a new farm's APIM APIs and Key Vault.
     *
     * Table schema (Trevor creates this):
     *   [dbo].[IoT Infrastructure]
     *     FarmName    NVARCHAR(100)   -- matches Site Overview.Name
     *     ProviderId  NVARCHAR(50)    -- e.g. "selectronic", "wattwatchers"
     *     APIMPath    NVARCHAR(200)   -- optional override of registry apimPath
     *     KeyVaultName NVARCHAR(100)  -- optional override of derived KV name
     *     Enabled     BIT             -- 1 = active
     *
     * Falls back to JSON registry farmProviders if table doesn't exist yet.
     */
    async getProviders(farmName) {
        const cacheKey = `providers:${farmName.toLowerCase()}`;
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.ts < this.cacheTTL) return cached.config;

        let providers = [];

        try {
            const rows = await this.db.query(
                `SELECT ProviderId, APIMPath, KeyVaultName
                 FROM [dbo].[IoT Infrastructure]
                 WHERE FarmName = @FarmName AND Enabled = 1
                 ORDER BY ProviderId`,
                [{ name: 'FarmName', value: farmName }],
                'zerosumag'
            );
            if (rows && rows.length) {
                providers = rows.map(r => ({
                    providerId: r.ProviderId,
                    apimPathOverride: r.APIMPath || null,
                    keyVaultNameOverride: r.KeyVaultName || null
                }));
                console.log(`[FarmConfig] IoT Infrastructure: ${farmName} has ${providers.length} provider(s): ${providers.map(p => p.providerId).join(', ')}`);
            }
        } catch (err) {
            // Table may not exist yet — Trevor creates it when provisioning
            console.warn(`[FarmConfig] IoT Infrastructure table not available for "${farmName}": ${err.message}`);
        }

        this.cache.set(cacheKey, { config: providers, ts: Date.now() });
        return providers;
    }

    clearCache() {
        this.cache.clear();
    }
}

module.exports = FarmConfig;
