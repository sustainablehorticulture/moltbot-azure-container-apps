const { app } = require('@azure/functions');
const https = require('https');
const smsService = require('../services/smsService');

const LORAWAN_BASE = process.env.LORAWAN_FUNCTION_URL || 'https://backendlorawan.azurewebsites.net';
const LORAWAN_KEY = process.env.LORAWAN_FUNCTION_KEY || '';

// Daily status report - runs every day at 7:00 AM AEST (21:00 UTC previous day)
app.timer('dailyStatusReport', {
    schedule: '0 0 21 * * *',
    handler: async (myTimer, context) => {
        context.log('Daily status report triggered at:', new Date().toISOString());

        try {
            const siteId = process.env.DEFAULT_SITE_ID || 'grassgumfarm';
            const recipients = (process.env.DAILY_REPORT_RECIPIENTS || '+61467413589').split(',');

            // Gather status from all sources
            const report = await buildStatusReport(siteId, context);

            // Send SMS to each recipient
            for (const phone of recipients) {
                const trimmedPhone = phone.trim();
                if (trimmedPhone) {
                    try {
                        await smsService.sendSMS(trimmedPhone, report, siteId);
                        context.log(`Daily report sent to ${trimmedPhone}`);
                    } catch (err) {
                        context.log.error(`Failed to send daily report to ${trimmedPhone}:`, err.message);
                    }
                }
            }

            context.log('Daily status report completed');
        } catch (error) {
            context.log.error('Daily status report failed:', error);
        }
    }
});

// HTTP trigger to send report on demand (for testing)
app.http('sendDailyReport', {
    methods: ['POST', 'GET'],
    authLevel: 'function',
    route: 'daily-report',
    handler: async (request, context) => {
        context.log('Manual daily report triggered');

        try {
            const url = new URL(request.url);
            const siteId = request.headers.get('x-site-id') || url.searchParams.get('siteId') || process.env.DEFAULT_SITE_ID || 'grassgumfarm';
            const phone = url.searchParams.get('phone') || process.env.DAILY_REPORT_RECIPIENTS || '+61467413589';
            const sendSms = url.searchParams.get('send') !== 'false';

            context.log(`Building report for site: ${siteId}, phone: ${phone}, send: ${sendSms}`);

            const report = await buildStatusReport(siteId, context);

            context.log(`Report built: ${report}`);

            let smsResult = null;
            if (sendSms) {
                smsResult = await smsService.sendSMS(phone.split(',')[0].trim(), report, siteId);
            }

            return {
                status: 200,
                jsonBody: {
                    success: true,
                    siteId,
                    report,
                    smsSent: sendSms,
                    smsResult,
                    timestamp: new Date().toISOString()
                }
            };
        } catch (error) {
            context.log.error('Manual daily report failed:', error.message, error.stack);
            return {
                status: 500,
                jsonBody: { error: 'Failed to generate report', message: error.message, stack: error.stack }
            };
        }
    }
});

async function buildStatusReport(siteId, context) {
    const sections = [];
    const now = new Date();
    const timeStr = now.toLocaleString('en-AU', { timeZone: 'Australia/Sydney', hour12: true, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

    sections.push(`DAILY STATUS ${timeStr}`);
    sections.push(`Site: ${siteId}`);
    sections.push('---');

    // 1. LoRaWAN Device Status
    try {
        const lorawanDevices = await fetchLoRaWAN(`/api/sites/${siteId}/devices`);
        if (lorawanDevices && lorawanDevices.devices) {
            const total = lorawanDevices.devices.length;
            const online = lorawanDevices.devices.filter(d => d.state && d.state.online).length;
            sections.push(`LoRaWAN: ${online}/${total} online`);

            for (const device of lorawanDevices.devices) {
                const status = device.state?.online ? 'ON' : 'OFF';
                const r1 = device.state?.relays?.relay1 ? 'ON' : 'OFF';
                const r2 = device.state?.relays?.relay2 ? 'ON' : 'OFF';
                const temp = device.state?.temperature != null ? `${device.state.temperature}C` : 'N/A';
                const batt = device.state?.batteryVoltage != null ? `${device.state.batteryVoltage}V` : 'N/A';
                sections.push(`${device.name}: ${status}`);
                sections.push(`  R1:${r1} R2:${r2} T:${temp} B:${batt}`);
            }
        } else {
            sections.push('LoRaWAN: No devices');
        }
    } catch (err) {
        context.log.warn('LoRaWAN status fetch failed:', err.message);
        sections.push('LoRaWAN: unavailable');
    }

    sections.push('---');

    // 2. Wattwatchers Device Status
    try {
        const wwDevices = await fetchLoRaWAN(`/api/wattwatchers/${siteId}/devices`);
        if (wwDevices && wwDevices.devices && Array.isArray(wwDevices.devices)) {
            sections.push(`Wattwatchers: ${wwDevices.devices.length} device(s)`);

            for (const device of wwDevices.devices) {
                const deviceId = device.id || device.deviceId || 'unknown';
                const label = device.label || deviceId;
                sections.push(`${label}:`);

                // Switch status
                if (device.switches && device.switches.length > 0) {
                    const switchStates = device.switches.map(sw => {
                        const name = sw.label || sw.id;
                        const state = sw.state === 'closed' ? 'ON' : 'OFF';
                        const pending = sw.pending ? ` (pending ${sw.pending.state === 'closed' ? 'ON' : 'OFF'})` : '';
                        return `${name}:${state}${pending}`;
                    });
                    sections.push(`  Switches: ${switchStates.join(', ')}`);
                }

                // Channel energy if available
                if (device.channels && device.channels.length > 0) {
                    const channelInfo = device.channels.map(ch => {
                        const name = ch.label || ch.id;
                        return name;
                    });
                    sections.push(`  Channels: ${channelInfo.length}`);
                }
            }
        } else {
            sections.push('Wattwatchers: No devices');
        }
    } catch (err) {
        context.log.warn('Wattwatchers status fetch failed:', err.message);
        sections.push('Wattwatchers: unavailable');
    }

    sections.push('---');

    // 3. Alert Summary
    try {
        const alertKey = process.env.ALERT_FUNCTION_KEY || '';
        const alertUrl = `https://backendalerts-e9c2gdf3ejdzdgfp.australiasoutheast-01.azurewebsites.net/api/alerts/statistics?siteId=${siteId}`;
        const alertData = await httpGet(alertUrl, { 'x-functions-key': alertKey });
        if (alertData) {
            sections.push(`Alerts 24h: ${alertData.totalAlerts || 0} total, ${alertData.criticalAlerts || 0} critical`);
        }
    } catch (err) {
        context.log.warn('Alert stats fetch failed:', err.message);
        sections.push('Alerts: unavailable');
    }

    // Keep SMS under ~480 chars (3 SMS segments max)
    let report = sections.join('\n');
    if (report.length > 480) {
        report = report.substring(0, 477) + '...';
    }

    return report;
}

async function fetchLoRaWAN(path) {
    const url = `${LORAWAN_BASE}${path}`;
    return await httpGet(url, { 'x-functions-key': LORAWAN_KEY });
}

function httpGet(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers: { ...headers },
            timeout: 10000
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch {
                    resolve(data);
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
        req.end();
    });
}
