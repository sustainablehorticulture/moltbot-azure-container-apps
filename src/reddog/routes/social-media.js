/**
 * Red Dog Social Media API Routes
 * 
 * Endpoints for OAuth authentication and social media posting
 */

const express = require('express');
const router = express.Router();

module.exports = (socialMedia) => {
    // ─── OAuth Authentication ───

    /**
     * GET /api/social/auth/:platform
     * Initiate OAuth flow for a platform
     */
    router.get('/auth/:platform', (req, res) => {
        const { platform } = req.params;
        const userId = req.query.userId || req.headers['x-user-id'];

        if (!userId) {
            return res.status(400).json({ error: 'User ID required' });
        }

        try {
            const redirectUri = process.env.OAUTH_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/social/auth/callback`;
            const authUrl = socialMedia.getAuthUrl(platform, userId, redirectUri);

            // If request is from a browser (Accept: text/html), redirect directly
            if (req.headers.accept && req.headers.accept.includes('text/html')) {
                return res.redirect(authUrl);
            }

            res.json({ 
                authUrl,
                platform,
                message: `Visit this URL to authenticate with ${platform}`
            });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    });

    /**
     * GET /api/social/auth/callback
     * OAuth callback endpoint
     */
    router.get('/auth/callback', async (req, res) => {
        const { code, state, error, error_description } = req.query;
        
        if (error) {
            const dashboardUrl = process.env.DASHBOARD_URL || '/';
            return res.redirect(`${dashboardUrl}?oauth_error=${encodeURIComponent(error_description || error)}`);
        }

        if (!code || !state) {
            return res.status(400).json({ error: 'Missing authorization code or state' });
        }

        try {
            // State is base64-encoded JSON: { userId, platform }
            let userId, platform;
            try {
                const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
                userId = decoded.userId;
                platform = decoded.platform;
            } catch (_) {
                // Fallback: state is a raw token, get from query params
                userId = req.query.userId;
                platform = req.query.platform;
            }

            if (!userId || !platform) {
                return res.status(400).json({ error: 'Could not extract userId/platform from state' });
            }

            const redirectUri = process.env.OAUTH_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/social/auth/callback`;
            const tokenData = await socialMedia.exchangeCodeForToken(platform, code, redirectUri, state, userId);

            const dashboardUrl = process.env.DASHBOARD_URL || '/';
            const successUrl = `${dashboardUrl}?oauth_success=${platform}&expires=${tokenData.expires_in || ''}`;

            // Browser flow → redirect back to dashboard
            if (req.headers.accept && req.headers.accept.includes('text/html')) {
                return res.redirect(successUrl);
            }

            res.json({
                success: true,
                platform,
                message: `Authenticated with ${platform}!`,
                expiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null
            });
        } catch (error) {
            console.error('[Social] OAuth callback error:', error.message);
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * GET /api/social/status
     * Get authentication status for all platforms
     */
    router.get('/status', async (req, res) => {
        const userId = req.query.userId || req.headers['x-user-id'];

        if (!userId) {
            return res.status(400).json({ error: 'User ID required' });
        }

        try {
            const status = await socialMedia.getAuthStatus(userId);
            res.json(status);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * DELETE /api/social/auth/:platform
     * Disconnect a platform
     */
    router.delete('/auth/:platform', async (req, res) => {
        const { platform } = req.params;
        const userId = req.query.userId || req.headers['x-user-id'];

        if (!userId) {
            return res.status(400).json({ error: 'User ID required' });
        }

        try {
            await socialMedia.disconnectPlatform(userId, platform);
            res.json({ 
                success: true,
                message: `Disconnected from ${platform}` 
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ─── Instagram Posting ───

    /**
     * POST /api/social/instagram/post
     * Create an Instagram post
     */
    router.post('/instagram/post', async (req, res) => {
        const userId = req.body.userId || req.headers['x-user-id'];
        const { caption, imageUrl, mediaType } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'User ID required' });
        }

        if (!caption || !imageUrl) {
            return res.status(400).json({ error: 'Caption and image URL required' });
        }

        try {
            const result = await socialMedia.postToInstagram(userId, { caption, imageUrl, mediaType });
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ─── Facebook Posting ───

    /**
     * POST /api/social/facebook/post
     * Create a Facebook post
     */
    router.post('/facebook/post', async (req, res) => {
        const userId = req.body.userId || req.headers['x-user-id'];
        const { message, link, imageUrl, pageId } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'User ID required' });
        }

        if (!message) {
            return res.status(400).json({ error: 'Message required' });
        }

        try {
            const result = await socialMedia.postToFacebook(userId, { message, link, imageUrl, pageId });
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * POST /api/social/facebook/ad
     * Create a Facebook ad campaign
     */
    router.post('/facebook/ad', async (req, res) => {
        const userId = req.body.userId || req.headers['x-user-id'];
        const { campaignName, adSetName, adName, targeting, creative, budget } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'User ID required' });
        }

        if (!campaignName) {
            return res.status(400).json({ error: 'Campaign name required' });
        }

        try {
            const result = await socialMedia.createFacebookAd(userId, {
                campaignName, adSetName, adName, targeting, creative, budget
            });
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ─── LinkedIn Posting ───

    /**
     * POST /api/social/linkedin/post
     * Create a LinkedIn post
     */
    router.post('/linkedin/post', async (req, res) => {
        const userId = req.body.userId || req.headers['x-user-id'];
        const { text, imageUrl, link } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'User ID required' });
        }

        if (!text) {
            return res.status(400).json({ error: 'Text required' });
        }

        try {
            const result = await socialMedia.postToLinkedIn(userId, { text, imageUrl, link });
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ─── WhatsApp Business Messaging ───

    /**
     * POST /api/social/whatsapp/send
     * Send a plain text WhatsApp message
     * Body: { to, text }
     */
    router.post('/whatsapp/send', async (req, res) => {
        const { to, text } = req.body;
        if (!to || !text) {
            return res.status(400).json({ error: 'to and text are required' });
        }
        try {
            const result = await socialMedia.sendWhatsAppMessage(to, text);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * POST /api/social/whatsapp/media
     * Send a WhatsApp image, video, document, or audio message
     * Body: { to, type, mediaUrl, caption }
     */
    router.post('/whatsapp/media', async (req, res) => {
        const { to, type, mediaUrl, caption } = req.body;
        if (!to || !mediaUrl) {
            return res.status(400).json({ error: 'to and mediaUrl are required' });
        }
        try {
            const result = await socialMedia.sendWhatsAppMedia(to, { type, mediaUrl, caption });
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * POST /api/social/whatsapp/template
     * Send a pre-approved WhatsApp template message (for marketing/outbound)
     * Body: { to, templateName, languageCode, components }
     */
    router.post('/whatsapp/template', async (req, res) => {
        const { to, templateName, languageCode, components } = req.body;
        if (!to || !templateName) {
            return res.status(400).json({ error: 'to and templateName are required' });
        }
        try {
            const result = await socialMedia.sendWhatsAppTemplate(to, templateName, languageCode, components);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * POST /api/social/whatsapp/broadcast
     * Send a WhatsApp message to multiple recipients
     * Body: { recipients: ["+61400000000", ...], text }
     */
    router.post('/whatsapp/broadcast', async (req, res) => {
        const { recipients, text } = req.body;
        if (!recipients || !Array.isArray(recipients) || !text) {
            return res.status(400).json({ error: 'recipients (array) and text are required' });
        }
        try {
            const result = await socialMedia.broadcastWhatsApp(recipients, text);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    /**
     * GET /api/social/whatsapp/status
     * Check if WhatsApp Business API is configured
     */
    router.get('/whatsapp/status', (req, res) => {
        res.json({
            configured: !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
            phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ? '✓ Set' : '✗ Missing',
            accessToken: process.env.WHATSAPP_ACCESS_TOKEN ? '✓ Set' : '✗ Missing',
            businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ? '✓ Set' : '✗ Missing'
        });
    });

    // ─── Facebook Messenger ───

    /**
     * POST /api/social/messenger/send
     * Send a Messenger message to a user
     * Body: { recipientId, text }
     */
    router.post('/messenger/send', async (req, res) => {
        const { recipientId, text } = req.body;
        if (!recipientId || !text) {
            return res.status(400).json({ error: 'recipientId and text are required' });
        }
        try {
            const result = await socialMedia.sendMessengerMessage(recipientId, text);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // ─── WhatsApp Interactive ───

    /**
     * POST /api/social/whatsapp/buttons
     * Send a WhatsApp interactive button message
     * Body: { to, bodyText, buttons: [{ id, title }, ...] } (max 3 buttons)
     */
    router.post('/whatsapp/buttons', async (req, res) => {
        const { to, bodyText, buttons } = req.body;
        if (!to || !bodyText || !Array.isArray(buttons)) {
            return res.status(400).json({ error: 'to, bodyText, and buttons (array) are required' });
        }
        try {
            const result = await socialMedia.sendWhatsAppButtons(to, bodyText, buttons);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    return router;
};
