/**
 * Red Dog Slack Bot Commands
 * 
 * - /ndvi <lat> <lng> [buffer]
 * - /launch-burro <robot> <lat> <lng> [mission]
 */

const fetch = require('node-fetch');

class SlackBot {
    constructor() {
        this.apiBase = process.env.API_BASE_URL || 'https://clawdbot.happybush-1b235e08.australiasoutheast.azurecontainerapps.io';
    }

    /**
     * Handle slash commands from Slack
     */
    async handleSlashCommand(command, text, responseUrl) {
        const args = text.trim().split(/\s+/);
        try {
            if (command === '/ndvi') {
                if (args.length < 2) {
                    await this.postResponse(responseUrl, { text: 'Usage: `/ndvi <lat> <lng> [bufferKm]`' });
                    return;
                }
                const lat = parseFloat(args[0]);
                const lng = parseFloat(args[1]);
                const buffer = args[2] ? parseFloat(args[2]) : 0.5;
                if (isNaN(lat) || isNaN(lng)) {
                    await this.postResponse(responseUrl, { text: '❌ Invalid lat/lng. Example: `/ndvi -33.8 151.2`' });
                    return;
                }

                const ndviUrl = `${this.apiBase}/api/farm/ndvi/latest?lat=${lat}&lng=${lng}&bufferKm=${buffer}`;
                const res = await fetch(ndviUrl);
                const data = await res.json();

                if (!res.ok) {
                    await this.postResponse(responseUrl, { text: `❌ Failed to fetch NDVI: ${data.error}` });
                    return;
                }

                const payload = {
                    text: `🌱 Latest NDVI for (${lat}, ${lng})`,
                    blocks: [
                        { type: 'section', text: { type: 'mrkdwn', text: `*🌱 Latest NDVI (Sentinel‑2)*\n📍 ${lat}, ${lng}  |  📐 ${buffer} km  |  📅 ${new Date(data.datetime).toLocaleDateString()}` } },
                        { type: 'image', image_url: data.ndviUrl, alt_text: 'NDVI map' },
                        { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: '🔗 View NDVI' }, url: data.ndviUrl }] }
                    ]
                };
                await this.postResponse(responseUrl, payload);
            } else if (command === '/launch-burro') {
                if (args.length < 3) {
                    await this.postResponse(responseUrl, { text: 'Usage: `/launch-burro <robot> <lat> <lng> [mission]`' });
                    return;
                }
                const robot = args[0];
                const lat = parseFloat(args[1]);
                const lng = parseFloat(args[2]);
                const mission = args[3] || 'ndvi-guided-patrol';
                if (isNaN(lat) || isNaN(lng)) {
                    await this.postResponse(responseUrl, { text: '❌ Invalid lat/lng. Example: `/launch-burro BURRO-001 -33.8 151.2`' });
                    return;
                }

                // Fetch NDVI context
                let ndviContext = null;
                try {
                    const ndviUrl = `${this.apiBase}/api/farm/ndvi/latest?lat=${lat}&lng=${lng}&bufferKm=0.5`;
                    const ndviRes = await fetch(ndviUrl);
                    if (ndviRes.ok) {
                        const ndviData = await ndviRes.json();
                        ndviContext = { tileId: ndviData.tileId, datetime: ndviData.datetime, ndviUrl: ndviData.ndviUrl };
                    }
                } catch (_) {}

                const launchUrl = `${this.apiBase}/api/farm/burro/launch`;
                const launchRes = await fetch(launchUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ robotSerialNumber: robot, lat, lng, missionName: mission, ndviContext })
                });
                const launchData = await launchRes.json();

                if (!launchRes.ok) {
                    await this.postResponse(responseUrl, { text: `❌ Failed to launch burro: ${launchData.error}` });
                    return;
                }

                const payload = {
                    text: `🤖 Burro ${robot} launched!`,
                    blocks: [
                        { type: 'section', text: { type: 'mrkdwn', text: `*🤖 Burro Launched*\n🔧 *Robot*: ${robot}\n📍 *Launch*: ${lat}, ${lng}\n🎯 *Mission*: ${mission}\n🆔 *Mission ID*: ${launchData.missionId}\n🌱 *NDVI*: ${ndviContext ? 'Attached' : 'None'}` } },
                        { type: 'context', elements: [{ type: 'mrkdwn', text: `📅 Launched ${new Date(launchData.timestamp).toLocaleString()}` }] }
                    ]
                };
                await this.postResponse(responseUrl, payload);
            } else {
                await this.postResponse(responseUrl, { text: `❓ Unknown command: ${command}` });
            }
        } catch (error) {
            console.error('[Slack] Command error:', error);
            await this.postResponse(responseUrl, { text: '❌ Something went wrong. Please try again.' });
        }
    }

    /**
     * Post a response to Slack response_url (for slash commands)
     */
    async postResponse(responseUrl, payload) {
        const res = await fetch(responseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            console.error('[Slack] Failed to post response:', await res.text());
        }
    }
}

module.exports = SlackBot;
