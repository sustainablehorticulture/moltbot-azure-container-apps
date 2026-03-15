/**
 * Red Dog Farm Routes
 * 
 * - NDVI from Microsoft Planetary Computer (Sentinel‑2)
 * - Burro automated electric burro unit control
 * - Slack/Discord bot commands
 */

const express = require('express');
const router = express.Router();

/**
 * GET /api/farm/ndvi/latest
 * Fetch latest Sentinel‑2 NDVI for a farm location
 * Query: lat, lng (center point), bufferKm (default 0.5)
 */
router.get('/ndvi/latest', async (req, res) => {
    const { lat, lng, bufferKm = 0.5 } = req.query;
    if (!lat || !lng) {
        return res.status(400).json({ error: 'lat and lng required' });
    }

    try {
        const latNum = parseFloat(lat);
        const lngNum = parseFloat(lng);
        const buf = parseFloat(bufferKm);

        // Microsoft Planetary Computer STAC API
        const pcCatalog = 'https://planetarycomputer.microsoft.com/api/stac/v1';
        const bbox = [lngNum - buf, latNum - buf, lngNum + buf, latNum + buf].join(',');

        // Find latest Sentinel‑2 L2A tile
        const searchUrl = `${pcCatalog}/collections/sentinel-2-l2a/items?bbox=${bbox}&datetime=2024-01-01/2026-12-31&limit=1&sortby=-datetime`;
        const searchRes = await fetch(searchUrl);
        const searchJson = await searchRes.json();

        if (!searchJson.features.length) {
            return res.status(404).json({ error: 'No Sentinel‑2 tile found for this location' });
        }

        const tile = searchJson.features[0];
        const tileId = tile.id;
        const datetime = tile.properties.datetime;
        const assets = tile.assets;

        // NDVI asset (visualized) or fallback to red/nir bands
        let ndviAsset = assets.ndvi || assets.visual;
        if (!ndviAsset) {
            // Compute NDVI from red (B04) and nir (B08)
            const redAsset = assets.B04;
            const nirAsset = assets.B08;
            if (!redAsset || !nirAsset) {
                return res.status(500).json({ error: 'NDVI or red/NIR bands not available' });
            }
            // For now, return the NIR band as proxy
            ndviAsset = nirAsset;
        }

        // Signed URL (30‑min)
        const signedUrl = `${ndviAsset.href}?${new URLSearchParams({
            'api-key': process.env.PLANETARY_COMPUTER_API_KEY || '',
            'expires': new Date(Date.now() + 30 * 60 * 1000).toISOString()
        })}`;

        // Optional: compute mean NDVI via rasterio (Python) or raster-stats (Node) – for now return metadata
        res.json({
            tileId,
            datetime,
            lat: latNum,
            lng: lngNum,
            bufferKm: buf,
            ndviUrl: signedUrl,
            assets: Object.keys(assets),
            geometry: tile.geometry,
            bbox: tile.bbox,
            cloudCover: tile.properties['eo:cloud_cover']
        });
    } catch (error) {
        console.error('[Farm] NDVI fetch error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/farm/burro/launch
 * Launch the on‑farm automated electric burro unit
 * Body: { robotSerialNumber, missionName?, lat, lng, ndviContext? }
 */
router.post('/burro/launch', async (req, res) => {
    const { robotSerialNumber, missionName = 'ndvi-guided-patrol', lat, lng, ndviContext } = req.body;
    if (!robotSerialNumber || !lat || !lng) {
        return res.status(400).json({ error: 'robotSerialNumber, lat, and lng required' });
    }

    try {
        const burroApiBase = process.env.BURRO_API_BASE || 'https://REPLACE-ME.burro.api';
        const burroToken = process.env.BURRO_BEARER_TOKEN;
        if (!burroToken) {
            return res.status(500).json({ error: 'BURRO_BEARER_TOKEN not configured' });
        }

        // 1️⃣ Load mission (optional – you can pre‑define missions in Burro)
        const loadPayload = {
            missionName,
            context: {
                ndvi: ndviContext,
                launchPoint: { lat: parseFloat(lat), lng: parseFloat(lng) },
                timestamp: new Date().toISOString()
            }
        };
        const loadRes = await fetch(`${burroApiBase}/v1/robots/${robotSerialNumber}/command/mission/load`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${burroToken}`
            },
            body: JSON.stringify(loadPayload)
        });
        const loadJson = await loadRes.json();
        if (!loadRes.ok) {
            return res.status(loadRes.status).json({ error: 'Failed to load mission', details: loadJson });
        }

        // 2️⃣ Play/start mission
        const playRes = await fetch(`${burroApiBase}/v1/robots/${robotSerialNumber}/command/mission/play`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${burroToken}`
            },
            body: JSON.stringify({ missionId: loadJson.missionId })
        });
        const playJson = await playRes.json();
        if (!playRes.ok) {
            return res.status(playRes.status).json({ error: 'Failed to start mission', details: playJson });
        }

        res.json({
            success: true,
            robotSerialNumber,
            missionName,
            missionId: loadJson.missionId,
            ndviContext,
            launchPoint: { lat, lng },
            status: 'started',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[Farm] Burro launch error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/farm/slack/commands
 * Slack slash command webhook
 */
router.post('/slack/commands', express.urlencoded({ extended: false }), async (req, res) => {
    const { command, text, response_url } = req.body;
    if (!command || !response_url) {
        return res.status(400).json({ error: 'Invalid Slack payload' });
    }

    // Acknowledge immediately (Slack requires 3‑second response)
    res.json({ text: 'Processing...' });

    // Handle asynchronously
    const SlackBot = require('../slack-bot');
    const slackBot = new SlackBot();
    setImmediate(() => slackBot.handleSlashCommand(command, text, response_url));
});

module.exports = () => router;
