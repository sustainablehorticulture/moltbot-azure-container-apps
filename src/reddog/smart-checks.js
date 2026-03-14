/**
 * SmartChecks — multi-parameter state-based automation triggers.
 *
 * Uses sensorClient directly (SensorAPIClient) for raw data,
 * NOT sensorCommands.executeAction() which returns formatted text strings.
 *
 * getLatestReadings() returns: { farmName, provider, timestamp, data }
 * where `data` is the raw APIM response — could be:
 *   - flat object:  { battery_soc: 85, load_w: 1500, ... }
 *   - array:        [{ device_id: '...', metric: '...', value: ... }, ...]
 *   - nested:       { readings: [...], summary: {...} }
 * All extractors handle all three shapes.
 */

class SmartChecks {
    constructor(sensorCommands) {
        // Store the raw sensor client for direct data access
        this.sensorClient = sensorCommands?.sensor || null;
    }

    // ── Raw data fetcher ─────────────────────────────────────────────────────

    /**
     * Fetch raw sensor data directly from the sensor client.
     * Returns null if sensor not configured or call fails.
     */
    async _getRaw(farm, provider) {
        if (!this.sensorClient || !this.sensorClient.enabled) return null;
        try {
            const result = await this.sensorClient.getLatestReadings(farm, provider);
            return result?.data ?? null;
        } catch (err) {
            console.error(`[SmartChecks] ${provider} fetch failed for ${farm}: ${err.message}`);
            return null;
        }
    }

    // ── Value extractors ─────────────────────────────────────────────────────
    // Each extractor handles: flat object, metric/value array, nested object

    /**
     * Extract a numeric value by trying multiple key names.
     * Handles flat objects, { metric, value } arrays, and nested structures.
     */
    _extract(data, keys) {
        if (!data) return null;

        // 1. Flat object: { battery_soc: 85, ... }
        if (typeof data === 'object' && !Array.isArray(data)) {
            for (const key of keys) {
                const val = this._deepFind(data, key);
                if (val !== null && val !== undefined) return parseFloat(val);
            }
        }

        // 2. Array of { metric, value } or { name, value } or { device_id, ... }
        if (Array.isArray(data)) {
            for (const item of data) {
                if (!item || typeof item !== 'object') continue;
                const metricField = item.metric || item.name || item.field || '';
                if (keys.some(k => metricField.toLowerCase().includes(k.toLowerCase()))) {
                    const val = item.value ?? item.val ?? item.reading;
                    if (val !== undefined && val !== null) return parseFloat(val);
                }
                // Also check direct keys on each array item
                for (const key of keys) {
                    if (item[key] !== undefined && item[key] !== null) return parseFloat(item[key]);
                }
            }
        }

        return null;
    }

    /** Recursively search an object for a key */
    _deepFind(obj, key) {
        if (!obj || typeof obj !== 'object') return null;
        if (key in obj) return obj[key];
        for (const v of Object.values(obj)) {
            if (v && typeof v === 'object') {
                const found = this._deepFind(v, key);
                if (found !== null && found !== undefined) return found;
            }
        }
        return null;
    }

    /** Extract battery state of charge (%) from Selectronic data */
    extractBatterySOC(data) {
        return this._extract(data, ['battery_soc', 'soc', 'battery_percent', 'BatterySOC', 'battery']) ?? 0;
    }

    /** Extract load watts from Selectronic data */
    extractLoadWatts(data) {
        return this._extract(data, ['load_w', 'load', 'load_watts', 'LoadW', 'power_load', 'consumption_w']) ?? 0;
    }

    /** Extract solar generation watts from Selectronic data */
    extractSolarWatts(data) {
        return this._extract(data, ['solar_w', 'solar', 'pv_w', 'solar_watts', 'SolarW', 'pv_power']) ?? 0;
    }

    /** Extract soil moisture (%) — tries TTN/LoRaWAN common field names */
    extractSoilMoisture(data) {
        // Try common field name patterns first
        const val = this._extract(data, [
            'soil_moisture', 'soilMoisture', 'soil_moisture_pct',
            'moisture', 'vwc', 'volumetric_water_content',
            'soil_vwc', 'water_content'
        ]);
        if (val !== null) return val;

        // Array: find item whose device_id or name includes "soil"
        if (Array.isArray(data)) {
            for (const item of data) {
                if (!item || typeof item !== 'object') continue;
                const id = (item.device_id || item.name || item.id || '').toLowerCase();
                if (id.includes('soil') || id.includes('moisture')) {
                    const v = item.value ?? item.soil_moisture ?? item.moisture;
                    if (v !== undefined) return parseFloat(v);
                }
            }
        }
        return 0;
    }

    // ── Individual checks ────────────────────────────────────────────────────

    /**
     * Check 1: Battery 75–100% AND soil moisture < 60%
     * → Suggest running irrigation pump
     */
    async checkBatteryAndSoil(farm) {
        try {
            const [batteryRaw, soilRaw] = await Promise.all([
                this._getRaw(farm, 'selectronic'),
                this._getRaw(farm, 'lorawan')
            ]);

            const batterySOC   = this.extractBatterySOC(batteryRaw);
            const soilMoisture = this.extractSoilMoisture(soilRaw);

            // Skip if we got no useful data
            if (batterySOC === 0 && soilMoisture === 0) return null;

            if (batterySOC >= 75 && batterySOC <= 100 && soilMoisture < 60) {
                return {
                    action: 'ui_trigger',
                    type: 'conditional_control',
                    check: 'battery_and_soil',
                    condition: `Battery at ${batterySOC}% ✅ and soil moisture at ${soilMoisture}% (dry)`,
                    suggestion: 'Good time to run irrigation pump — battery is healthy',
                    readings: { batterySOC, soilMoisture },
                    devices: [
                        {
                            type: 'lorawan_relay',
                            action: 'turn_on',
                            device_id: process.env.PUMP_DEVICE_ID || 'irrigation-pump-01',
                            relay_id: 1,
                            label: '💧 Start Irrigation Pump'
                        },
                        {
                            type: 'lorawan_digital',
                            action: 'set_high',
                            device_id: process.env.VALVE_DEVICE_ID || 'water-valve-01',
                            pin_id: 1,
                            label: '🚰 Open Water Valve'
                        }
                    ]
                };
            }
            return null;
        } catch (err) {
            console.error('[SmartChecks] checkBatteryAndSoil:', err.message);
            return null;
        }
    }

    /**
     * Check 2: Battery < 30% AND load > 2000W
     * → Suggest load shedding
     */
    async checkLoadAndBattery(farm) {
        try {
            const batteryRaw  = await this._getRaw(farm, 'selectronic');
            const batterySOC  = this.extractBatterySOC(batteryRaw);
            const loadWatts   = this.extractLoadWatts(batteryRaw);

            if (batterySOC === 0 && loadWatts === 0) return null;

            if (batterySOC < 30 && loadWatts > 2000) {
                return {
                    action: 'ui_trigger',
                    type: 'conditional_control',
                    check: 'load_and_battery',
                    condition: `Battery low at ${batterySOC}% ⚠️ with ${loadWatts}W load`,
                    suggestion: 'Shed non-essential load to preserve battery',
                    readings: { batterySOC, loadWatts },
                    devices: [
                        {
                            type: 'wattwatchers_switch',
                            action: 'open',
                            device_id: process.env.LOAD_SWITCH_DEVICE_ID || 'non-essential-circuits',
                            switch_id: process.env.LOAD_SWITCH_ID || 'S3',
                            label: '⚡ Shed Non-Essential Load'
                        }
                    ]
                };
            }
            return null;
        } catch (err) {
            console.error('[SmartChecks] checkLoadAndBattery:', err.message);
            return null;
        }
    }

    /**
     * Check 3: Solar > 2000W AND battery < 70%
     * → Suggest diverting solar to charge
     */
    async checkSolarAndBattery(farm) {
        try {
            const batteryRaw = await this._getRaw(farm, 'selectronic');
            const batterySOC = this.extractBatterySOC(batteryRaw);
            const solarWatts = this.extractSolarWatts(batteryRaw);

            if (batterySOC === 0 && solarWatts === 0) return null;

            if (solarWatts > 2000 && batterySOC < 70) {
                return {
                    action: 'ui_trigger',
                    type: 'conditional_control',
                    check: 'solar_and_battery',
                    condition: `Solar generating ${solarWatts}W ☀️ but battery only at ${batterySOC}%`,
                    suggestion: 'Prioritise charging — defer high loads until battery > 80%',
                    readings: { batterySOC, solarWatts },
                    devices: [
                        {
                            type: 'wattwatchers_switch',
                            action: 'open',
                            device_id: process.env.LOAD_SWITCH_DEVICE_ID || 'non-essential-circuits',
                            switch_id: process.env.LOAD_SWITCH_ID || 'S3',
                            label: '🔋 Defer Load — Charge Battery'
                        }
                    ]
                };
            }
            return null;
        } catch (err) {
            console.error('[SmartChecks] checkSolarAndBattery:', err.message);
            return null;
        }
    }

    // ── Run all checks ───────────────────────────────────────────────────────

    /**
     * Run all checks in parallel and return any triggered results.
     */
    async runAllChecks(farm = 'Grassgum Farm') {
        if (!this.sensorClient) {
            console.warn('[SmartChecks] No sensor client available — skipping checks');
            return [];
        }

        const results = await Promise.allSettled([
            this.checkBatteryAndSoil(farm),
            this.checkLoadAndBattery(farm),
            this.checkSolarAndBattery(farm)
        ]);

        return results
            .filter(r => r.status === 'fulfilled' && r.value !== null)
            .map(r => r.value);
    }
}

module.exports = SmartChecks;
