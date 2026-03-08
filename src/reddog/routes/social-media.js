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
            
            res.json({ 
                authUrl,
                platform,
                message: `Please visit this URL to authenticate with ${platform}`
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
            return res.status(400).json({ 
                error: error,
                description: error_description 
            });
        }

        if (!code || !state) {
            return res.status(400).json({ error: 'Missing authorization code or state' });
        }

        try {
            // Extract platform and userId from state (you may need to adjust this based on your implementation)
            const userId = req.query.userId || req.headers['x-user-id'];
            const platform = req.query.platform;

            if (!userId || !platform) {
                return res.status(400).json({ error: 'Missing user ID or platform' });
            }

            const redirectUri = process.env.OAUTH_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/social/auth/callback`;
            const tokenData = await socialMedia.exchangeCodeForToken(platform, code, redirectUri, state, userId);

            res.json({
                success: true,
                platform,
                message: `Successfully authenticated with ${platform}!`,
                expiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null
            });
        } catch (error) {
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

    return router;
};
