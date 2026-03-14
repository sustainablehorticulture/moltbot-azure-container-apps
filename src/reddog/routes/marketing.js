/**
 * Marketing Routes — Red Dog AI marketing content generation
 *
 * Uses live farm data (FarmContent) + AI to generate platform-specific posts,
 * handle WhatsApp order inquiries, and manage eco-stay bookings via chat.
 *
 * Endpoints:
 *   GET  /api/marketing/context          — Raw farm context (products, eco-stay, courses)
 *   POST /api/marketing/generate         — Generate platform post using AI + live data
 *   GET  /api/marketing/products         — All available products with prices
 *   GET  /api/marketing/products/:id     — Single product lookup
 *   GET  /api/marketing/eco-stay         — Available eco-stay listings
 *   GET  /api/marketing/courses          — Course catalog
 *   POST /api/marketing/quote            — Product availability + pricing quote
 *   POST /api/marketing/eco-stay/check   — Check eco-stay availability for dates
 */

const express = require('express');
const axios   = require('axios');
const router  = express.Router();

module.exports = (farmContent, aiEngine) => {

    // ── GET /api/marketing/context ────────────────────────────────────────────

    router.get('/context', async (req, res) => {
        try {
            const [products, ecoStay] = await Promise.all([
                farmContent.getAvailableProducts(),
                farmContent.getEcoStay()
            ]);
            const courses = farmContent.getCourses();
            res.json({
                farm: 'Grassgum Farm',
                timestamp: new Date().toISOString(),
                products,
                ecoStay,
                courses,
                summary: {
                    productCount:  products.length,
                    ecoStayCount:  ecoStay.length,
                    courseCount:   courses.length,
                    onlineCourses: courses.filter(c => c.category === 'online').length,
                    onsiteCourses: courses.filter(c => c.category !== 'online').length
                }
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── GET /api/marketing/products ───────────────────────────────────────────

    router.get('/products', async (req, res) => {
        try {
            const { category } = req.query;
            let products = await farmContent.getAvailableProducts();
            if (category) products = products.filter(p => p.category.toLowerCase() === category.toLowerCase());
            res.json({ products, count: products.length });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── GET /api/marketing/products/:query ────────────────────────────────────

    router.get('/products/:query', async (req, res) => {
        try {
            const product = await farmContent.findProduct(req.params.query);
            if (!product) return res.status(404).json({ error: 'Product not found' });
            res.json(product);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── GET /api/marketing/eco-stay ───────────────────────────────────────────

    router.get('/eco-stay', async (req, res) => {
        try {
            const listings = await farmContent.getEcoStay();
            res.json({ listings, count: listings.length });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── GET /api/marketing/courses ────────────────────────────────────────────

    router.get('/courses', (req, res) => {
        try {
            const { type } = req.query; // online | onsite
            const courses = type === 'online'  ? farmContent.getOnlineCourses()
                          : type === 'onsite'  ? farmContent.getOnsiteCourses()
                          : farmContent.getCourses();
            res.json({ courses, count: courses.length });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── POST /api/marketing/quote ─────────────────────────────────────────────
    // Body: { product, quantity }

    router.post('/quote', async (req, res) => {
        try {
            const { product, quantity = 1 } = req.body;
            if (!product) return res.status(400).json({ error: 'product is required' });
            const quote = await farmContent.getProductQuote(product, quantity);
            res.json(quote);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── POST /api/marketing/eco-stay/check ───────────────────────────────────
    // Body: { checkIn, checkOut }

    router.post('/eco-stay/check', async (req, res) => {
        try {
            const { checkIn, checkOut } = req.body;
            if (!checkIn) return res.status(400).json({ error: 'checkIn date is required' });
            const available = await farmContent.checkEcoStayAvailability(checkIn, checkOut);
            res.json({ available, count: available.length, checkIn, checkOut });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ── POST /api/marketing/generate ─────────────────────────────────────────
    // Body: { platform, topic, tone, userId }
    // Generates a platform-specific marketing post using AI + live farm data

    router.post('/generate', async (req, res) => {
        try {
            const { platform = 'instagram', topic, tone, userId = 'marketing' } = req.body;

            const brief = await farmContent.getContentBrief(platform, topic);

            const platformGuide = {
                instagram: 'Write an engaging Instagram post (max 2200 chars). Use emojis, hashtags (#Grassgum #FarmFresh #AgaveSpirit #RegenAg #OffGrid), and a call to action. Include key product/event details.',
                facebook:  'Write a friendly Facebook post with storytelling. Include pricing, availability, and a link to book/buy. Max 3 paragraphs.',
                linkedin:  'Write a professional LinkedIn post about sustainable farming, regenerative agriculture or the featured product/course. Focus on B2B/industry value.',
                whatsapp:  'Write a short, conversational WhatsApp broadcast message. Max 3 sentences. Friendly and direct. Include price and how to order.'
            }[platform] || 'Write a marketing post for the farm.';

            const prompt = `You are Red Dog, the AI marketing agent for Grassgum Farm.

${platformGuide}

Farm data:
- Featured: ${brief.featured?.name || topic || 'Grassgum Farm'} — $${brief.featured?.price || ''}/${brief.featured?.unit || ''}${brief.featured?.stock ? `, ${brief.featured.stock} ${brief.featured.unit} in stock` : ''}
- Other available: ${brief.availableProducts.slice(0,5).map(p => p.name).join(', ')}
- Eco-Stay: ${brief.ecoStay.map(e => `${e.name} $${e.pricePerNight}/night`).join(', ')}
- Featured course: ${brief.featuredCourse?.title || 'Sustainable Farming'} — ${brief.featuredCourse?.level || 'All levels'}
- Farm brand tone: ${tone || brief.tone}

Generate ONE great ${platform} post now. Do not include any prefix like "Here's your post:".`;

            if (!aiEngine?.apiKey) {
                return res.status(503).json({ error: 'AI engine not configured' });
            }

            const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                model: aiEngine.model,
                messages: [{ role: 'user', content: prompt }]
            }, {
                headers: {
                    'Authorization': `Bearer ${aiEngine.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            const content = response.data.choices[0].message.content;

            res.json({
                platform,
                topic: topic || brief.featured?.name,
                content,
                brief: {
                    featured:   brief.featured,
                    ecoStay:    brief.ecoStay.map(e => e.name),
                    courseTitle: brief.featuredCourse?.title
                },
                charCount: content.length,
                timestamp: new Date().toISOString()
            });
        } catch (err) {
            console.error('[Marketing] Generate error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // ── POST /api/marketing/broadcast-whatsapp ────────────────────────────────
    // Generate + send WhatsApp broadcast about a product or event
    // Body: { recipients, topic, platform: 'whatsapp' }

    router.post('/broadcast-whatsapp', async (req, res) => {
        try {
            const { recipients, topic } = req.body;
            if (!recipients || !Array.isArray(recipients)) {
                return res.status(400).json({ error: 'recipients (array) required' });
            }

            // Generate content
            const brief = await farmContent.getContentBrief('whatsapp', topic);
            const prompt = `You are Red Dog, the AI marketing agent for Grassgum Farm. Write a WhatsApp broadcast message (max 160 chars) about ${topic || brief.featured?.name || 'our latest products'}. Include price if relevant. Sign off with "— Red Dog 🐕"`;

            const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                model: aiEngine?.model || 'openai/gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }]
            }, {
                headers: {
                    'Authorization': `Bearer ${aiEngine?.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            const message = response.data.choices[0].message.content;

            res.json({
                generated: true,
                message,
                recipients: recipients.length,
                note: 'Use POST /api/social/whatsapp/broadcast with this message to send',
                broadcastBody: { recipients, text: message }
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
