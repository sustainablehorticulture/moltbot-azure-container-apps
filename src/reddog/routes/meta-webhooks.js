/**
 * Meta Webhooks Route
 *
 * Handles all Meta Platform webhook events for:
 *   - Facebook Messenger (page messages, postbacks)
 *   - Instagram (DMs, comments, mentions)
 *   - WhatsApp Business (incoming messages, status updates)
 *
 * Meta Developer Console setup:
 *   Webhook URL:        https://<your-app>/api/webhooks/meta
 *   Verify Token:       META_WEBHOOK_VERIFY_TOKEN (your .env value)
 *   Subscribed fields:  messages, messaging_postbacks, instagram_messages,
 *                       whatsapp_business_messages
 *
 * Required env vars:
 *   META_WEBHOOK_VERIFY_TOKEN  — token you enter in Meta Developer Console
 *   META_APP_SECRET            — from App Dashboard → App Settings → Basic
 */

const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();

module.exports = (socialMedia, aiEngine, farmContent = null) => {

    // ── Signature verification helper ─────────────────────────────────────

    function verifySignature(req) {
        const appSecret = process.env.META_APP_SECRET;
        if (!appSecret) return true; // Skip in dev if not set

        const sig = req.headers['x-hub-signature-256'];
        if (!sig) return false;

        const expected = 'sha256=' + crypto
            .createHmac('sha256', appSecret)
            .update(req.rawBody || JSON.stringify(req.body))
            .digest('hex');

        return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    }

    // ── GET /api/webhooks/meta — Meta hub challenge verification ──────────
    // Meta sends this when you first register the webhook URL in the Developer Console

    router.get('/', (req, res) => {
        const mode      = req.query['hub.mode'];
        const token     = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;

        if (!verifyToken) {
            console.error('[MetaWebhook] META_WEBHOOK_VERIFY_TOKEN not set!');
            return res.status(500).send('Webhook verify token not configured');
        }

        if (mode === 'subscribe' && token === verifyToken) {
            console.log('[MetaWebhook] ✅ Webhook verified by Meta');
            return res.status(200).send(challenge);
        }

        console.warn(`[MetaWebhook] ❌ Verification failed. mode=${mode}, token=${token}`);
        return res.status(403).send('Forbidden');
    });

    // ── POST /api/webhooks/meta — Incoming events ─────────────────────────

    router.post('/', express.json(), async (req, res) => {
        // Acknowledge immediately — Meta requires 200 within 20s
        res.status(200).send('EVENT_RECEIVED');

        // Verify signature
        if (!verifySignature(req)) {
            console.warn('[MetaWebhook] ❌ Invalid signature — rejecting event');
            return;
        }

        const body = req.body;
        if (!body || !body.object) return;

        console.log(`[MetaWebhook] 📨 Event received: object=${body.object}, entries=${body.entry?.length}`);

        try {
            if (body.object === 'page') {
                await handleMessengerEvents(body.entry, socialMedia, aiEngine);
            } else if (body.object === 'instagram') {
                await handleInstagramEvents(body.entry, socialMedia, aiEngine);
            } else if (body.object === 'whatsapp_business_account') {
                await handleWhatsAppEvents(body.entry, socialMedia, aiEngine);
            } else {
                console.log(`[MetaWebhook] Unhandled object type: ${body.object}`);
            }
        } catch (err) {
            console.error('[MetaWebhook] Event processing error:', err.message);
        }
    });

    // ── GET /api/webhooks/meta/status — Check webhook config ─────────────

    router.get('/status', (req, res) => {
        res.json({
            configured: {
                verifyToken:    !!process.env.META_WEBHOOK_VERIFY_TOKEN,
                appSecret:      !!process.env.META_APP_SECRET,
                pageToken:      !!process.env.META_PAGE_ACCESS_TOKEN,
                instagramToken: !!process.env.INSTAGRAM_PAGE_ACCESS_TOKEN,
                whatsapp:       !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID)
            },
            webhookUrl: '/api/webhooks/meta',
            instructions: {
                step1: 'Set META_WEBHOOK_VERIFY_TOKEN to a random string in your .env',
                step2: 'In Meta Developer Console → Your App → Webhooks → Add Webhook URL',
                step3: `Webhook URL: https://<your-app>/api/webhooks/meta`,
                step4: 'Enter the same META_WEBHOOK_VERIFY_TOKEN value as Verify Token',
                step5: 'Subscribe to: messages, messaging_postbacks, instagram_messages, whatsapp_business_messages',
                step6: 'Set META_APP_SECRET from App Dashboard → App Settings → Basic'
            }
        });
    });

    return router;
};

// ── Event handlers ────────────────────────────────────────────────────────

async function handleMessengerEvents(entries, socialMedia, aiEngine) {
    for (const entry of entries) {
        const pageId = entry.id;
        for (const event of (entry.messaging || [])) {
            const senderId = event.sender?.id;
            const text = event.message?.text;
            const postback = event.postback?.payload;

            if (!senderId) continue;

            console.log(`[MetaWebhook] Messenger from=${senderId}, text="${text || postback}"`);

            try {
                let replyText;

                if (postback) {
                    replyText = await getAIReply(`User clicked: ${postback}`, `messenger:${senderId}`, aiEngine);
                } else if (text) {
                    replyText = await getAIReply(text, `messenger:${senderId}`, aiEngine);
                } else {
                    continue; // Ignore non-text events (reads, reactions etc.)
                }

                await socialMedia.sendMessengerMessage(senderId, replyText);
            } catch (err) {
                console.error(`[MetaWebhook] Messenger reply failed for ${senderId}:`, err.message);
            }
        }
    }
}

async function handleInstagramEvents(entries, socialMedia, aiEngine) {
    for (const entry of entries) {
        for (const event of (entry.messaging || [])) {
            const senderId = event.sender?.id;
            const text = event.message?.text;

            if (!senderId || !text) continue;

            console.log(`[MetaWebhook] Instagram DM from=${senderId}, text="${text}"`);

            try {
                const replyText = await getAIReply(text, `instagram:${senderId}`, aiEngine);
                await socialMedia.sendInstagramReply(senderId, replyText);
            } catch (err) {
                console.error(`[MetaWebhook] Instagram reply failed for ${senderId}:`, err.message);
            }
        }

        // Handle comment mentions
        for (const change of (entry.changes || [])) {
            if (change.field === 'comments' && change.value?.text) {
                const commentId = change.value.id;
                const commentText = change.value.text;
                const commenterId = change.value.from?.id;

                console.log(`[MetaWebhook] Instagram comment from=${commenterId}: "${commentText}"`);

                try {
                    const replyText = await getAIReply(
                        `Instagram comment: "${commentText}"`,
                        `instagram_comment:${commenterId}`,
                        aiEngine
                    );
                    await socialMedia.replyToInstagramComment(commentId, replyText);
                } catch (err) {
                    console.error('[MetaWebhook] Instagram comment reply failed:', err.message);
                }
            }
        }
    }
}

async function handleWhatsAppEvents(entries, socialMedia, aiEngine) {
    for (const entry of entries) {
        for (const change of (entry.changes || [])) {
            if (change.field !== 'messages') continue;

            const messages = change.value?.messages || [];
            const statuses = change.value?.statuses || [];

            // Log delivery status updates
            for (const status of statuses) {
                console.log(`[MetaWebhook] WhatsApp status: msgId=${status.id}, status=${status.status}`);
            }

            // Handle incoming messages
            for (const msg of messages) {
                const from = msg.from;
                const msgId = msg.id;
                const type = msg.type;

                // Mark as read
                try {
                    await socialMedia.markWhatsAppRead(msgId);
                } catch (_) {}

                if (type === 'text') {
                    const text = msg.text?.body;
                    if (!text) continue;

                    console.log(`[MetaWebhook] WhatsApp from=${from}: "${text}"`);

                    try {
                        // Try smart product/eco-stay/course reply first
                        const smartReply = farmContent
                            ? await getSmartReply(text, from, farmContent)
                            : null;

                        const replyText = smartReply || await getAIReply(text, `whatsapp:${from}`, aiEngine);
                        await socialMedia.sendWhatsAppMessage(from, replyText);
                    } catch (err) {
                        console.error(`[MetaWebhook] WhatsApp reply failed for ${from}:`, err.message);
                    }

                } else if (type === 'interactive') {
                    // Button or list reply
                    const payload = msg.interactive?.button_reply?.id
                        || msg.interactive?.list_reply?.id;
                    if (payload) {
                        console.log(`[MetaWebhook] WhatsApp interactive from=${from}: "${payload}"`);
                        try {
                            const replyText = await getAIReply(`User selected: ${payload}`, `whatsapp:${from}`, aiEngine);
                            await socialMedia.sendWhatsAppMessage(from, replyText);
                        } catch (err) {
                            console.error('[MetaWebhook] WhatsApp interactive reply failed:', err.message);
                        }
                    }
                } else {
                    console.log(`[MetaWebhook] WhatsApp unhandled type=${type} from=${from}`);
                }
            }
        }
    }
}

/**
 * Detect product/eco-stay/course inquiries and return instant data-backed replies.
 * Returns null if the message doesn't match a known inquiry pattern.
 */
async function getSmartReply(text, from, farmContent) {
    const t = text.toLowerCase().trim();

    // Product availability / price inquiry
    const buyKeywords = ['price', 'cost', 'buy', 'order', 'stock', 'available', 'how much', 'do you have', 'sell', 'get some', 'purchase'];
    if (buyKeywords.some(k => t.includes(k))) {
        try {
            const products = await farmContent.getAvailableProducts();
            // Try to match a product name in the message
            const matched = products.find(p => t.includes(p.name.toLowerCase()) || t.includes(p.id.toLowerCase()));
            if (matched) {
                const qty = (t.match(/(\d+)\s*(kg|dozen|bottle|side|litre|l\b)/i) || [])[1] || 1;
                const quote = await farmContent.getProductQuote(matched.name, parseInt(qty));
                return quote.message;
            }
            // No specific product — list available
            const topProducts = products.slice(0, 6).map(p => `• ${p.name}: $${p.price}/${p.unit}`).join('\n');
            return `G'day! Here's what's available at Grassgum Farm right now:\n\n${topProducts}\n\nReply with a product name to get a quote! 🐕`;
        } catch { return null; }
    }

    // Eco-stay / accommodation inquiry
    if (['stay', 'book', 'cabin', 'accommodation', 'glamping', 'farmhouse', 'eco', 'lodge', 'cottage', 'loft', 'night'].some(k => t.includes(k))) {
        try {
            const stays = await farmContent.getEcoStay();
            if (!stays.length) return null;
            const lines = stays.map(s => `• ${s.name} — $${s.pricePerNight}/night, sleeps ${s.capacity}. ${s.nextAvailable || 'Available now'}`).join('\n');
            return `🏡 Grassgum Farm Eco-Stay options:\n\n${lines}\n\nSend your check-in date to check availability!`;
        } catch { return null; }
    }

    // Course inquiry
    if (['course', 'learn', 'training', 'workshop', 'class', 'education', 'study', 'online'].some(k => t.includes(k))) {
        try {
            const courses = await farmContent.getCourses();
            if (!courses.length) return null;
            const lines = courses.slice(0, 5).map(c => `• ${c.title} (${c.level}) — ${c.duration}${c.price ? ` — $${c.price}` : ' — Free'}`).join('\n');
            return `🎓 Grassgum Farm Courses:\n\n${lines}\n\nVisit FarmG8 to enrol or ask me about any course!`;
        } catch { return null; }
    }

    // Not a recognized inquiry — fall through to AI
    return null;
}

async function getAIReply(userMessage, sessionId, aiEngine) {
    if (!aiEngine) return "G'day! I'm Red Dog 🐕 — I can't respond right now but I'll be back soon!";
    try {
        const result = await aiEngine.chat(userMessage, sessionId);
        // Strip markdown for plain text channels
        return (result.reply || "G'day! Red Dog here 🐕").replace(/\*\*/g, '').replace(/\*/g, '').replace(/_/g, '');
    } catch (err) {
        console.error('[MetaWebhook] AI reply error:', err.message);
        return "G'day! Red Dog here 🐕 — having a bit of a technical hiccup, try again shortly!";
    }
}
