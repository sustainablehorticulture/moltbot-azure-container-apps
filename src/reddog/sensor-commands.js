/**
 * SensorCommands — parses AI-emitted sensor_api JSON actions and executes
 * farm-scoped sensor API calls via SensorAPIClient.
 *
 * AI action format:
 *   {"action": "sensor_api", "farm": "Grassgum Farm", "provider": "selectronic", "type": "latest"}
 *   {"action": "sensor_api", "farm": "all", "provider": "weather", "type": "latest"}
 *   {"action": "sensor_api", "farm": "Grassgum Farm", "provider": "selectronic", "type": "history", "hours": 24}
 *   {"action": "sensor_api", "farm": "Grassgum Farm", "provider": "selectronic", "type": "device", "device_id": "S-001"}
 *   {"action": "sensor_api", "type": "list_farms"}
 */

class SensorCommands {
    constructor({ sensorClient }) {
        this.sensor = sensorClient;
    }

    // ── Parse & detect ─────────────────────────────────────────────────────

    parseSensorAction(aiReply) {
        const match = aiReply.match(/\{[\s\S]*?"action"\s*:\s*"sensor_api"[\s\S]*?\}/);
        if (!match) return null;
        try {
            return JSON.parse(match[0]);
        } catch {
            return null;
        }
    }

    // ── Execute ────────────────────────────────────────────────────────────

    async executeAction(action) {
        if (!this.sensor) {
            return { reply: '⚠️ Sensor API not configured. Set SENSOR_APIM_URL in your .env.' };
        }

        const farm = action.farm || process.env.FARM_ID || 'Grassgum Farm';
        const provider = action.provider || null;

        try {
            switch (action.type) {
                case 'list_farms': {
                    const farms = await this.sensor.listFarms();
                    if (!farms.length) return { reply: '📋 No farms found in Site Overview table.' };
                    const farmLines = await Promise.all(farms.map(async f => {
                        const providers = await this.sensor.getProvidersForFarm(f.name);
                        const providerNames = providers.map(p => p.name || p.id).join(', ');
                        return `• **${f.name}** → Key Vault: \`${f.keyVaultName}\` | APIs: ${providerNames || 'none configured'}`;
                    }));
                    return { reply: `🌾 **Active Farms (${farms.length})**\n${farmLines.join('\n')}` };
                }

                case 'list_providers': {
                    return { reply: await this.formatProviderList(farm) };
                }

                case 'all_providers': {
                    // Fetch from every configured provider for this farm in parallel
                    const results = await this.sensor.getAllProvidersLatest(farm);
                    return { reply: this.formatAllProvidersReadings(results, farm) };
                }

                case 'latest':
                default: {
                    if (farm === 'all') {
                        const results = await this.sensor.getAllFarmsReadings(provider);
                        return { reply: this.formatAllFarmsReadings(results, provider) };
                    }
                    // No provider specified — fetch all providers for this farm
                    if (!provider) {
                        const results = await this.sensor.getAllProvidersLatest(farm);
                        return { reply: this.formatAllProvidersReadings(results, farm) };
                    }
                    const result = await this.sensor.getLatestReadings(farm, provider);
                    return { reply: this.formatLatestReadings(result) };
                }

                case 'history': {
                    const hours = parseInt(action.hours) || 24;
                    if (!provider) {
                        return { reply: `⚠️ Please specify a sensor provider for historical data (e.g. "selectronic", "weather").` };
                    }
                    const result = await this.sensor.getHistory(farm, provider, hours);
                    return { reply: this.formatHistory(result) };
                }

                case 'device': {
                    if (!action.device_id) {
                        return { reply: `⚠️ Please specify a device ID.` };
                    }
                    if (!provider) {
                        return { reply: `⚠️ Please specify a provider for device lookup (e.g. "selectronic", "lorawan").` };
                    }
                    const result = await this.sensor.getDeviceReadings(farm, provider, action.device_id);
                    return { reply: this.formatDeviceReadings(result) };
                }
            }
        } catch (err) {
            console.error('[SensorCommands] Error:', err.message);
            return { reply: `❌ Sensor API error for **${farm}**: ${err.message}` };
        }
    }

    /**
     * Build provider list for AI system prompt using JSON registry only (synchronous).
     * The full DB-driven list is used at request time via getProvidersForFarm().
     * At prompt-build time we use the JSON farmProviders map as a fast approximation.
     */
    buildProviderPrompt(farmName = null) {
        const farm = farmName || process.env.FARM_ID || 'Grassgum Farm';
        if (!this.sensor) return '';

        // Use JSON registry farmProviders for synchronous prompt building
        const registry = this.sensor.registry;
        const farmList = registry.farmProviders?.[farm];
        const providerIds = farmList && farmList.length
            ? farmList
            : Object.keys(registry.providers || {});

        if (!providerIds.length) return '';

        const lines = providerIds.map(id => {
            const p = registry.providers?.[id];
            return p ? `- ${id}: ${p.name} — ${p.description}` : `- ${id}`;
        });
        return `\n\nAvailable sensor providers for ${farm}:\n${lines.join('\n')}\nUse these exact provider IDs in the sensor_api JSON action. Omit provider to query all.`;
    }

    // ── Formatting ─────────────────────────────────────────────────────────

    formatLatestReadings({ farmName, provider, data, timestamp }) {
        const providerLabel = provider !== 'all' ? provider : 'all sensors';
        let out = `📡 **Latest Readings — ${farmName}** (${providerLabel})\n_${timestamp}_\n\n`;

        if (!data) return out + '_No data returned from sensor API._';

        if (Array.isArray(data)) {
            for (const item of data.slice(0, 20)) {
                out += this._formatItem(item);
            }
        } else if (typeof data === 'object') {
            out += this._formatObject(data);
        } else {
            out += String(data);
        }
        return out;
    }

    formatAllFarmsReadings(results, provider) {
        const providerLabel = provider || 'all sensors';
        let out = `📡 **Latest Readings — All Farms** (${providerLabel})\n\n`;
        for (const result of results) {
            if (result.error) {
                out += `**${result.farmName}**: ❌ ${result.error}\n\n`;
            } else {
                out += `**${result.farmName}**:\n`;
                if (result.data && typeof result.data === 'object') {
                    out += this._formatObject(result.data, '  ');
                }
                out += '\n';
            }
        }
        return out;
    }

    formatHistory({ farmName, provider, hours, data }) {
        let out = `📈 **${provider} History — ${farmName}** (last ${hours}h)\n\n`;
        if (!data) return out + '_No historical data returned._';
        if (Array.isArray(data)) {
            const rows = data.slice(0, 10);
            for (const item of rows) out += this._formatItem(item);
            if (data.length > 10) out += `_...and ${data.length - 10} more records_\n`;
        } else {
            out += this._formatObject(data);
        }
        return out;
    }

    formatDeviceReadings({ farmName, provider, deviceId, data }) {
        let out = `📡 **Device Readings — ${deviceId}** (${provider} @ ${farmName})\n\n`;
        if (!data) return out + '_No data returned._';
        out += this._formatObject(data);
        return out;
    }

    _formatItem(item) {
        if (typeof item !== 'object') return `• ${item}\n`;
        const parts = Object.entries(item)
            .filter(([k, v]) => v !== null && v !== undefined)
            .map(([k, v]) => `${k}: **${v}**`);
        return `• ${parts.join(' | ')}\n`;
    }

    formatAllProvidersReadings(results, farmName) {
        const ts = new Date().toLocaleTimeString();
        let out = `📡 **All Sensor Readings — ${farmName}** _${ts}_\n\n`;
        for (const result of results) {
            const providerInfo = this.sensor?.getProvider(result.provider);
            const label = providerInfo?.name || result.provider;
            if (result.error) {
                out += `**${label}**: ❌ ${result.error}\n\n`;
            } else {
                out += `### ${label}\n`;
                if (result.data && typeof result.data === 'object') {
                    out += this._formatObject(result.data, '');
                } else if (result.data) {
                    out += String(result.data);
                } else {
                    out += '_No data_\n';
                }
                out += '\n';
            }
        }
        return out;
    }

    async formatProviderList(farmName) {
        if (!this.sensor) return '⚠️ Sensor API not configured.';
        const providers = await this.sensor.getProvidersForFarm(farmName);
        if (!providers.length) return `📋 No sensor providers configured for **${farmName}**.`;
        const lines = providers.map(p =>
            `• **${p.name || p.id}** (\`${p.id}\`) — ${p.description || 'No description'}`
        );
        return `📋 **Sensor Providers for ${farmName} (${providers.length})**\n${lines.join('\n')}`;
    }

    _formatObject(obj, indent = '') {
        let out = '';
        for (const [k, v] of Object.entries(obj)) {
            if (v === null || v === undefined) continue;
            if (typeof v === 'object' && !Array.isArray(v)) {
                out += `${indent}**${k}:**\n${this._formatObject(v, indent + '  ')}`;
            } else if (Array.isArray(v)) {
                out += `${indent}**${k}:** ${v.slice(0, 5).join(', ')}${v.length > 5 ? '...' : ''}\n`;
            } else {
                out += `${indent}• ${k}: **${v}**\n`;
            }
        }
        return out;
    }
}

module.exports = SensorCommands;
