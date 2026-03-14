/**
 * Red Dog Social Media Manager
 * 
 * Handles OAuth2 authentication and posting to social media platforms:
 * - Instagram (via Facebook Graph API)
 * - Facebook Ads Manager
 * - LinkedIn
 * 
 * Features:
 * - OAuth2 authentication flow for each platform
 * - Token storage and refresh
 * - Post creation and scheduling
 * - Ad campaign management (Facebook)
 * - Analytics and insights
 */

const axios = require('axios');
const crypto = require('crypto');

class SocialMediaManager {
    constructor({ db, apiUrl }) {
        this.db = db;
        this.apiUrl = apiUrl || 'http://localhost:18789';
        
        // OAuth2 configurations
        this.platforms = {
            instagram: {
                name: 'Instagram',
                authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
                tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
                apiUrl: 'https://graph.facebook.com/v18.0',
                scopes: [
                    'instagram_basic',
                    'instagram_content_publish',
                    'instagram_manage_messages',
                    'instagram_manage_comments',
                    'pages_read_engagement',
                    'pages_show_list'
                ]
            },
            facebook: {
                name: 'Facebook',
                authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
                tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
                apiUrl: 'https://graph.facebook.com/v18.0',
                scopes: [
                    'pages_manage_posts',
                    'pages_read_engagement',
                    'pages_messaging',
                    'ads_management',
                    'business_management'
                ]
            },
            linkedin: {
                name: 'LinkedIn',
                authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
                tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
                apiUrl: 'https://api.linkedin.com/v2',
                scopes: ['w_member_social', 'r_basicprofile', 'r_organization_social']
            },
            whatsapp: {
                name: 'WhatsApp',
                apiUrl: 'https://graph.facebook.com/v18.0',
                // WhatsApp uses a static system user token, not OAuth
                // Token set via WHATSAPP_ACCESS_TOKEN env var
                noOAuth: true
            }
        };

        // Token cache
        this.tokens = new Map();
    }

    // ─── OAuth2 Authentication ───

    /**
     * Generate OAuth2 authorization URL for a platform
     */
    getAuthUrl(platform, userId, redirectUri) {
        const config = this.platforms[platform];
        if (!config) {
            throw new Error(`Unsupported platform: ${platform}`);
        }

        const clientId = process.env[`${platform.toUpperCase()}_CLIENT_ID`];
        if (!clientId) {
            throw new Error(`Missing ${platform.toUpperCase()}_CLIENT_ID environment variable`);
        }

        // Generate state token — base64 JSON containing userId and platform for callback extraction
        const statePayload = Buffer.from(JSON.stringify({
            userId,
            platform,
            nonce: crypto.randomBytes(8).toString('hex')
        })).toString('base64');
        
        // Store state in database for verification
        this.storeOAuthState(userId, platform, statePayload);

        const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri,
            response_type: 'code',
            state: statePayload
        });

        // Facebook Login for Business — config_id replaces scope
        const fbConfigId = platform === 'facebook' && process.env.FACEBOOK_LOGIN_CONFIG_ID;
        if (fbConfigId) {
            params.set('config_id', fbConfigId);
        } else {
            params.set('scope', config.scopes.join(' '));
        }

        return `${config.authUrl}?${params.toString()}`;
    }

    /**
     * Exchange authorization code for access token
     */
    async exchangeCodeForToken(platform, code, redirectUri, state, userId) {
        const config = this.platforms[platform];
        if (!config) {
            throw new Error(`Unsupported platform: ${platform}`);
        }

        // Verify state token
        const isValidState = await this.verifyOAuthState(userId, platform, state);
        if (!isValidState) {
            throw new Error('Invalid OAuth state token');
        }

        const clientId = process.env[`${platform.toUpperCase()}_CLIENT_ID`];
        const clientSecret = process.env[`${platform.toUpperCase()}_CLIENT_SECRET`];

        if (!clientId || !clientSecret) {
            throw new Error(`Missing OAuth credentials for ${platform}`);
        }

        try {
            const response = await axios.post(config.tokenUrl, {
                client_id: clientId,
                client_secret: clientSecret,
                code: code,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code'
            });

            const tokenData = response.data;
            
            // Store tokens in database
            await this.storeTokens(userId, platform, tokenData);

            // Cache tokens
            this.tokens.set(`${userId}:${platform}`, tokenData);

            console.log(`[SocialMedia] ${config.name} authenticated for user ${userId}`);
            return tokenData;
        } catch (error) {
            console.error(`[SocialMedia] Token exchange failed for ${platform}:`, error.message);
            throw error;
        }
    }

    /**
     * Refresh access token
     */
    async refreshToken(platform, userId) {
        const config = this.platforms[platform];
        const tokenData = await this.getTokens(userId, platform);

        if (!tokenData || !tokenData.refresh_token) {
            throw new Error(`No refresh token available for ${platform}`);
        }

        const clientId = process.env[`${platform.toUpperCase()}_CLIENT_ID`];
        const clientSecret = process.env[`${platform.toUpperCase()}_CLIENT_SECRET`];

        try {
            const response = await axios.post(config.tokenUrl, {
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: tokenData.refresh_token,
                grant_type: 'refresh_token'
            });

            const newTokenData = response.data;
            
            // Update tokens in database
            await this.storeTokens(userId, platform, newTokenData);

            // Update cache
            this.tokens.set(`${userId}:${platform}`, newTokenData);

            console.log(`[SocialMedia] Token refreshed for ${platform}`);
            return newTokenData;
        } catch (error) {
            console.error(`[SocialMedia] Token refresh failed for ${platform}:`, error.message);
            throw error;
        }
    }

    // ─── Token Management ───

    async storeOAuthState(userId, platform, state) {
        if (!this.db || !this.db.isConnected) {
            console.log('[SocialMedia] Database not connected, state not stored');
            return;
        }

        try {
            await this.db.query(`
                INSERT INTO [reddog].[OAuthStates] (UserId, Platform, State, CreatedAt, ExpiresAt)
                VALUES (@UserId, @Platform, @State, GETUTCDATE(), DATEADD(MINUTE, 10, GETUTCDATE()))
            `, [
                { name: 'UserId', value: userId },
                { name: 'Platform', value: platform },
                { name: 'State', value: state }
            ], 'zerosumag');
        } catch (error) {
            console.error('[SocialMedia] Failed to store OAuth state:', error.message);
        }
    }

    async verifyOAuthState(userId, platform, state) {
        if (!this.db || !this.db.isConnected) {
            console.log('[SocialMedia] Database not connected, state verification skipped');
            return true; // Allow in dev mode
        }

        try {
            const result = await this.db.query(`
                SELECT State FROM [reddog].[OAuthStates]
                WHERE UserId = @UserId AND Platform = @Platform AND State = @State
                AND ExpiresAt > GETUTCDATE()
            `, [
                { name: 'UserId', value: userId },
                { name: 'Platform', value: platform },
                { name: 'State', value: state }
            ], 'zerosumag');

            return result.length > 0;
        } catch (error) {
            console.error('[SocialMedia] Failed to verify OAuth state:', error.message);
            return false;
        }
    }

    async storeTokens(userId, platform, tokenData) {
        if (!this.db || !this.db.isConnected) {
            console.log('[SocialMedia] Database not connected, tokens not stored');
            return;
        }

        try {
            const expiresAt = tokenData.expires_in 
                ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
                : null;

            await this.db.query(`
                MERGE [reddog].[SocialMediaTokens] AS target
                USING (SELECT @UserId AS UserId, @Platform AS Platform) AS source
                ON target.UserId = source.UserId AND target.Platform = source.Platform
                WHEN MATCHED THEN
                    UPDATE SET 
                        AccessToken = @AccessToken,
                        RefreshToken = @RefreshToken,
                        ExpiresAt = @ExpiresAt,
                        UpdatedAt = GETUTCDATE()
                WHEN NOT MATCHED THEN
                    INSERT (UserId, Platform, AccessToken, RefreshToken, ExpiresAt, CreatedAt, UpdatedAt)
                    VALUES (@UserId, @Platform, @AccessToken, @RefreshToken, @ExpiresAt, GETUTCDATE(), GETUTCDATE());
            `, [
                { name: 'UserId', value: userId },
                { name: 'Platform', value: platform },
                { name: 'AccessToken', value: tokenData.access_token },
                { name: 'RefreshToken', value: tokenData.refresh_token || null },
                { name: 'ExpiresAt', value: expiresAt }
            ], 'zerosumag');

            console.log(`[SocialMedia] Tokens stored for ${platform}`);
        } catch (error) {
            console.error('[SocialMedia] Failed to store tokens:', error.message);
        }
    }

    async getTokens(userId, platform) {
        // Check cache first
        const cacheKey = `${userId}:${platform}`;
        if (this.tokens.has(cacheKey)) {
            return this.tokens.get(cacheKey);
        }

        if (!this.db || !this.db.isConnected) {
            console.log('[SocialMedia] Database not connected, no tokens available');
            return null;
        }

        try {
            const result = await this.db.query(`
                SELECT AccessToken, RefreshToken, ExpiresAt
                FROM [reddog].[SocialMediaTokens]
                WHERE UserId = @UserId AND Platform = @Platform
            `, [
                { name: 'UserId', value: userId },
                { name: 'Platform', value: platform }
            ], 'zerosumag');

            if (result.length === 0) {
                return null;
            }

            const tokenData = {
                access_token: result[0].AccessToken,
                refresh_token: result[0].RefreshToken,
                expires_at: result[0].ExpiresAt
            };

            // Cache tokens
            this.tokens.set(cacheKey, tokenData);

            return tokenData;
        } catch (error) {
            console.error('[SocialMedia] Failed to get tokens:', error.message);
            return null;
        }
    }

    async getAccessToken(userId, platform) {
        const tokenData = await this.getTokens(userId, platform);
        
        if (!tokenData) {
            throw new Error(`Not authenticated with ${platform}. Please authenticate first.`);
        }

        // Check if token is expired
        if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
            console.log(`[SocialMedia] Token expired for ${platform}, refreshing...`);
            const refreshed = await this.refreshToken(platform, userId);
            return refreshed.access_token;
        }

        return tokenData.access_token;
    }

    // ─── Instagram Posting ───

    async postToInstagram(userId, { caption, imageUrl, mediaType = 'IMAGE' }) {
        const accessToken = await this.getAccessToken(userId, 'instagram');
        const config = this.platforms.instagram;

        try {
            // Step 1: Create media container
            const containerResponse = await axios.post(`${config.apiUrl}/me/media`, {
                image_url: imageUrl,
                caption: caption,
                media_type: mediaType,
                access_token: accessToken
            });

            const containerId = containerResponse.data.id;

            // Step 2: Publish media
            const publishResponse = await axios.post(`${config.apiUrl}/me/media_publish`, {
                creation_id: containerId,
                access_token: accessToken
            });

            console.log(`[SocialMedia] Posted to Instagram: ${publishResponse.data.id}`);
            return {
                success: true,
                platform: 'instagram',
                postId: publishResponse.data.id,
                message: 'Posted to Instagram successfully!'
            };
        } catch (error) {
            console.error('[SocialMedia] Instagram post failed:', error.message);
            throw error;
        }
    }

    // ─── Facebook Posting ───

    async postToFacebook(userId, { message, link, imageUrl, pageId }) {
        const accessToken = await this.getAccessToken(userId, 'facebook');
        const config = this.platforms.facebook;

        try {
            const postData = {
                message: message,
                access_token: accessToken
            };

            if (link) postData.link = link;
            if (imageUrl) postData.url = imageUrl;

            const endpoint = pageId 
                ? `${config.apiUrl}/${pageId}/feed`
                : `${config.apiUrl}/me/feed`;

            const response = await axios.post(endpoint, postData);

            console.log(`[SocialMedia] Posted to Facebook: ${response.data.id}`);
            return {
                success: true,
                platform: 'facebook',
                postId: response.data.id,
                message: 'Posted to Facebook successfully!'
            };
        } catch (error) {
            console.error('[SocialMedia] Facebook post failed:', error.message);
            throw error;
        }
    }

    // ─── Facebook Ads ───

    async createFacebookAd(userId, { campaignName, adSetName, adName, targeting, creative, budget }) {
        const accessToken = await this.getAccessToken(userId, 'facebook');
        const config = this.platforms.facebook;

        try {
            // This is a simplified example - real implementation would be more complex
            const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
            
            if (!adAccountId) {
                throw new Error('FACEBOOK_AD_ACCOUNT_ID not configured');
            }

            // Create campaign
            const campaignResponse = await axios.post(
                `${config.apiUrl}/act_${adAccountId}/campaigns`,
                {
                    name: campaignName,
                    objective: 'OUTCOME_ENGAGEMENT',
                    status: 'PAUSED',
                    access_token: accessToken
                }
            );

            console.log(`[SocialMedia] Created Facebook campaign: ${campaignResponse.data.id}`);
            return {
                success: true,
                platform: 'facebook_ads',
                campaignId: campaignResponse.data.id,
                message: 'Facebook ad campaign created successfully!'
            };
        } catch (error) {
            console.error('[SocialMedia] Facebook ad creation failed:', error.message);
            throw error;
        }
    }

    // ─── Meta Helpers ───

    /**
     * Generate appsecret_proof for server-side Graph API calls.
     * Required when App Setting 'Require App Secret' is enabled.
     */
    getAppSecretProof(accessToken) {
        const appSecret = process.env.META_APP_SECRET;
        if (!appSecret) return null;
        return crypto.createHmac('sha256', appSecret).update(accessToken).digest('hex');
    }

    /**
     * Build Graph API query params including optional appsecret_proof
     */
    _graphParams(accessToken, extra = {}) {
        const params = { access_token: accessToken, ...extra };
        const proof = this.getAppSecretProof(accessToken);
        if (proof) params.appsecret_proof = proof;
        return params;
    }

    // ─── Facebook Messenger ───

    /**
     * Send a Messenger message to a user via the Send API
     */
    async sendMessengerMessage(recipientId, text) {
        const pageToken = process.env.META_PAGE_ACCESS_TOKEN;
        if (!pageToken) throw new Error('META_PAGE_ACCESS_TOKEN not configured');

        const config = this.platforms.facebook;
        const params = this._graphParams(pageToken);

        try {
            const response = await axios.post(
                `${config.apiUrl}/me/messages`,
                {
                    recipient: { id: recipientId },
                    message: { text },
                    messaging_type: 'RESPONSE'
                },
                { params }
            );
            console.log(`[SocialMedia] Messenger sent to ${recipientId}: ${response.data.message_id}`);
            return { success: true, messageId: response.data.message_id };
        } catch (error) {
            const msg = error.response?.data?.error?.message || error.message;
            throw new Error(`Messenger send failed: ${msg}`);
        }
    }

    // ─── Instagram Messaging ───

    /**
     * Send an Instagram DM reply
     */
    async sendInstagramReply(recipientId, text) {
        const pageToken = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN;
        if (!pageToken) throw new Error('INSTAGRAM_PAGE_ACCESS_TOKEN not configured');

        const instagramAccountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
        if (!instagramAccountId) throw new Error('INSTAGRAM_BUSINESS_ACCOUNT_ID not configured');

        const config = this.platforms.facebook;
        const params = this._graphParams(pageToken);

        try {
            const response = await axios.post(
                `${config.apiUrl}/${instagramAccountId}/messages`,
                {
                    recipient: { id: recipientId },
                    message: { text }
                },
                { params }
            );
            console.log(`[SocialMedia] Instagram DM sent to ${recipientId}: ${response.data.message_id}`);
            return { success: true, messageId: response.data.message_id };
        } catch (error) {
            const msg = error.response?.data?.error?.message || error.message;
            throw new Error(`Instagram DM failed: ${msg}`);
        }
    }

    /**
     * Reply to an Instagram comment
     */
    async replyToInstagramComment(commentId, text) {
        const pageToken = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN;
        if (!pageToken) throw new Error('INSTAGRAM_PAGE_ACCESS_TOKEN not configured');

        const config = this.platforms.facebook;
        const params = this._graphParams(pageToken);

        try {
            const response = await axios.post(
                `${config.apiUrl}/${commentId}/replies`,
                { message: text },
                { params }
            );
            console.log(`[SocialMedia] Instagram comment reply to ${commentId}: ${response.data.id}`);
            return { success: true, replyId: response.data.id };
        } catch (error) {
            const msg = error.response?.data?.error?.message || error.message;
            throw new Error(`Instagram comment reply failed: ${msg}`);
        }
    }

    // ─── WhatsApp Business Messaging ───

    getWhatsAppToken() {
        const token = process.env.WHATSAPP_ACCESS_TOKEN;
        if (!token) throw new Error('WHATSAPP_ACCESS_TOKEN not configured');
        return token;
    }

    getWhatsAppPhoneNumberId() {
        const id = process.env.WHATSAPP_PHONE_NUMBER_ID;
        if (!id) throw new Error('WHATSAPP_PHONE_NUMBER_ID not configured');
        return id;
    }

    /**
     * Send a plain text WhatsApp message
     */
    async sendWhatsAppMessage(to, text) {
        const token = this.getWhatsAppToken();
        const phoneNumberId = this.getWhatsAppPhoneNumberId();

        try {
            const response = await axios.post(
                `${this.platforms.whatsapp.apiUrl}/${phoneNumberId}/messages`,
                {
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: to.replace(/[^0-9]/g, ''), // strip non-digits
                    type: 'text',
                    text: { body: text }
                },
                { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
            );

            console.log(`[SocialMedia] WhatsApp message sent to ${to}: ${response.data.messages[0]?.id}`);
            return {
                success: true,
                platform: 'whatsapp',
                messageId: response.data.messages[0]?.id,
                to,
                message: 'WhatsApp message sent successfully!'
            };
        } catch (error) {
            const msg = error.response?.data?.error?.message || error.message;
            console.error('[SocialMedia] WhatsApp message failed:', msg);
            throw new Error(`WhatsApp send failed: ${msg}`);
        }
    }

    /**
     * Send a WhatsApp message with image, video, or document
     */
    async sendWhatsAppMedia(to, { type = 'image', mediaUrl, caption = '' }) {
        const token = this.getWhatsAppToken();
        const phoneNumberId = this.getWhatsAppPhoneNumberId();

        const validTypes = ['image', 'video', 'document', 'audio'];
        if (!validTypes.includes(type)) {
            throw new Error(`Invalid media type. Use: ${validTypes.join(', ')}`);
        }

        const mediaPayload = { link: mediaUrl };
        if (caption && type !== 'audio') mediaPayload.caption = caption;

        try {
            const response = await axios.post(
                `${this.platforms.whatsapp.apiUrl}/${phoneNumberId}/messages`,
                {
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: to.replace(/[^0-9]/g, ''),
                    type,
                    [type]: mediaPayload
                },
                { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
            );

            console.log(`[SocialMedia] WhatsApp ${type} sent to ${to}: ${response.data.messages[0]?.id}`);
            return {
                success: true,
                platform: 'whatsapp',
                messageId: response.data.messages[0]?.id,
                to,
                type,
                message: `WhatsApp ${type} sent successfully!`
            };
        } catch (error) {
            const msg = error.response?.data?.error?.message || error.message;
            throw new Error(`WhatsApp media send failed: ${msg}`);
        }
    }

    /**
     * Send a pre-approved WhatsApp template message (required for outbound marketing)
     * templateName: your approved template name (e.g. 'farm_alert', 'weekly_update')
     * languageCode: e.g. 'en_AU', 'en_US'
     * components: array of template parameter components
     */
    async sendWhatsAppTemplate(to, templateName, languageCode = 'en_AU', components = []) {
        const token = this.getWhatsAppToken();
        const phoneNumberId = this.getWhatsAppPhoneNumberId();

        try {
            const response = await axios.post(
                `${this.platforms.whatsapp.apiUrl}/${phoneNumberId}/messages`,
                {
                    messaging_product: 'whatsapp',
                    to: to.replace(/[^0-9]/g, ''),
                    type: 'template',
                    template: {
                        name: templateName,
                        language: { code: languageCode },
                        ...(components.length ? { components } : {})
                    }
                },
                { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
            );

            console.log(`[SocialMedia] WhatsApp template '${templateName}' sent to ${to}`);
            return {
                success: true,
                platform: 'whatsapp',
                messageId: response.data.messages[0]?.id,
                to,
                template: templateName,
                message: `WhatsApp template '${templateName}' sent successfully!`
            };
        } catch (error) {
            const msg = error.response?.data?.error?.message || error.message;
            throw new Error(`WhatsApp template send failed: ${msg}`);
        }
    }

    /**
     * Mark a WhatsApp message as read
     */
    async markWhatsAppRead(messageId) {
        const token = this.getWhatsAppToken();
        const phoneNumberId = this.getWhatsAppPhoneNumberId();
        try {
            await axios.post(
                `${this.platforms.whatsapp.apiUrl}/${phoneNumberId}/messages`,
                { messaging_product: 'whatsapp', status: 'read', message_id: messageId },
                { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
            );
        } catch (_) {} // Non-fatal
    }

    /**
     * Send a WhatsApp interactive button message
     */
    async sendWhatsAppButtons(to, bodyText, buttons) {
        const token = this.getWhatsAppToken();
        const phoneNumberId = this.getWhatsAppPhoneNumberId();

        const buttonList = buttons.slice(0, 3).map((b, i) => ({
            type: 'reply',
            reply: { id: b.id || `btn_${i}`, title: b.title.substring(0, 20) }
        }));

        try {
            const response = await axios.post(
                `${this.platforms.whatsapp.apiUrl}/${phoneNumberId}/messages`,
                {
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: to.replace(/[^0-9]/g, ''),
                    type: 'interactive',
                    interactive: {
                        type: 'button',
                        body: { text: bodyText },
                        action: { buttons: buttonList }
                    }
                },
                { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
            );
            return { success: true, messageId: response.data.messages[0]?.id };
        } catch (error) {
            const msg = error.response?.data?.error?.message || error.message;
            throw new Error(`WhatsApp buttons send failed: ${msg}`);
        }
    }

    /**
     * Broadcast a WhatsApp message to multiple recipients
     */
    async broadcastWhatsApp(recipients, text) {
        const results = [];
        for (const to of recipients) {
            try {
                const result = await this.sendWhatsAppMessage(to, text);
                results.push(result);
            } catch (error) {
                results.push({ success: false, to, error: error.message });
            }
        }
        const succeeded = results.filter(r => r.success).length;
        console.log(`[SocialMedia] WhatsApp broadcast: ${succeeded}/${recipients.length} sent`);
        return { success: true, platform: 'whatsapp', sent: succeeded, total: recipients.length, results };
    }

    // ─── LinkedIn Posting ───

    async postToLinkedIn(userId, { text, imageUrl, link }) {
        const accessToken = await this.getAccessToken(userId, 'linkedin');
        const config = this.platforms.linkedin;

        try {
            // Get user profile URN
            const profileResponse = await axios.get(`${config.apiUrl}/me`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            const authorUrn = `urn:li:person:${profileResponse.data.id}`;

            // Create post
            const postData = {
                author: authorUrn,
                lifecycleState: 'PUBLISHED',
                specificContent: {
                    'com.linkedin.ugc.ShareContent': {
                        shareCommentary: {
                            text: text
                        },
                        shareMediaCategory: imageUrl ? 'IMAGE' : 'NONE'
                    }
                },
                visibility: {
                    'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
                }
            };

            if (link) {
                postData.specificContent['com.linkedin.ugc.ShareContent'].media = [{
                    status: 'READY',
                    originalUrl: link
                }];
            }

            const response = await axios.post(`${config.apiUrl}/ugcPosts`, postData, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'X-Restli-Protocol-Version': '2.0.0'
                }
            });

            console.log(`[SocialMedia] Posted to LinkedIn: ${response.data.id}`);
            return {
                success: true,
                platform: 'linkedin',
                postId: response.data.id,
                message: 'Posted to LinkedIn successfully!'
            };
        } catch (error) {
            console.error('[SocialMedia] LinkedIn post failed:', error.message);
            throw error;
        }
    }

    // ─── Status and Management ───

    async getAuthStatus(userId) {
        const status = {};

        for (const platform of Object.keys(this.platforms)) {
            const tokens = await this.getTokens(userId, platform);
            status[platform] = {
                authenticated: !!tokens,
                expires: tokens?.expires_at || null
            };
        }

        return status;
    }

    async disconnectPlatform(userId, platform) {
        if (!this.db || !this.db.isConnected) {
            console.log('[SocialMedia] Database not connected');
            return;
        }

        try {
            await this.db.query(`
                DELETE FROM [reddog].[SocialMediaTokens]
                WHERE UserId = @UserId AND Platform = @Platform
            `, [
                { name: 'UserId', value: userId },
                { name: 'Platform', value: platform }
            ], 'zerosumag');

            // Clear cache
            this.tokens.delete(`${userId}:${platform}`);

            console.log(`[SocialMedia] Disconnected ${platform} for user ${userId}`);
        } catch (error) {
            console.error('[SocialMedia] Failed to disconnect platform:', error.message);
            throw error;
        }
    }
}

module.exports = SocialMediaManager;
