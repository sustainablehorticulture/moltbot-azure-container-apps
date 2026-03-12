const axios = require('axios');

const TTN_BASE = 'https://au1.cloud.thethings.network/api/v3';

class TTNService {
    _headers() {
        const key = process.env.LORAWAN_API_KEY;
        if (!key) throw new Error('LORAWAN_API_KEY not configured');
        return { Authorization: `Bearer ${key}` };
    }

    _appId(siteId) {
        // Allow override via env, else use siteId directly as TTN application ID
        return process.env.LORAWAN_APPLICATION_ID || siteId;
    }

    // Parse TTN Storage API response — returns newline-delimited JSON (NDJSON)
    _parseNDJSON(raw) {
        return raw
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean)
            .map(line => {
                try { return JSON.parse(line); } catch { return null; }
            })
            .filter(Boolean);
    }

    _normaliseUplink(entry) {
        const res = entry.result || entry;
        const ids = res.end_device_ids || {};
        const msg = res.uplink_message || {};
        const rx = (msg.rx_metadata || [])[0] || {};
        return {
            deviceId: ids.device_id,
            receivedAt: res.received_at,
            fPort: msg.f_port,
            payload: msg.decoded_payload || msg.frm_payload,
            rssi: rx.rssi,
            snr: rx.snr
        };
    }

    // Latest uplink for a single device
    async getDeviceLatest(siteId, deviceId) {
        const appId = this._appId(siteId);
        const url = `${TTN_BASE}/as/applications/${appId}/devices/${deviceId}/packages/storage/uplink_message`;
        try {
            const res = await axios.get(url, {
                headers: this._headers(),
                params: { limit: 1, order: '-received_at', field_mask: 'up.uplink_message.decoded_payload,up.uplink_message.f_port,up.uplink_message.rx_metadata' },
                timeout: 10000
            });
            const entries = this._parseNDJSON(res.data);
            if (!entries.length) return null;
            return this._normaliseUplink(entries[0]);
        } catch (e) {
            throw new Error(`TTN storage fetch for ${deviceId}: HTTP ${e.response?.status ?? e.message}`);
        }
    }

    // Latest uplink across all devices in the application (one per device)
    async getAllLatest(siteId, limit = 20) {
        const appId = this._appId(siteId);
        const url = `${TTN_BASE}/as/applications/${appId}/packages/storage/uplink_message`;
        try {
            const res = await axios.get(url, {
                headers: this._headers(),
                params: { limit, order: '-received_at', field_mask: 'up.uplink_message.decoded_payload,up.uplink_message.f_port,up.uplink_message.rx_metadata' },
                timeout: 15000
            });
            const entries = this._parseNDJSON(res.data);
            // Deduplicate — keep only the latest entry per device
            const seen = new Map();
            for (const e of entries) {
                const norm = this._normaliseUplink(e);
                if (norm.deviceId && !seen.has(norm.deviceId)) seen.set(norm.deviceId, norm);
            }
            return Array.from(seen.values());
        } catch (e) {
            throw new Error(`TTN storage fetch for site ${siteId}: HTTP ${e.response?.status ?? e.message}`);
        }
    }
}

module.exports = new TTNService();
