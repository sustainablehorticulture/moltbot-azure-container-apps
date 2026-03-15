const express = require('express');
const cors = require('cors');
const BillingSystem = require('./billing-system');
const CourseTeacher = require('./course-teacher');
const SmartChecks = require('./smart-checks');
const metaWebhooksRoute = require('./routes/meta-webhooks');
const socialMediaRoute = require('./routes/social-media');
const marketingRoute = require('./routes/marketing');
const dataDeletionRoute = require('./routes/data-deletion');
const createCryptoRoutes = require('./routes/crypto-payments');
const FarmContent = require('./farm-content');

class APIServer {
    constructor(aiEngine, db, blobStorage, serviceBus, approvalManager, socialMedia, deviceCommands = null, sensorCommands = null) {
        this.aiEngine = aiEngine;
        this.db = db;
        this.blobStorage = blobStorage;
        this.serviceBus = serviceBus;
        this.approvalManager = approvalManager;
        this.socialMedia = socialMedia;
        this.deviceCommands = deviceCommands;
        this.sensorCommands = sensorCommands;
        this.billing = new BillingSystem({ db });
        this.courseTeacher = new CourseTeacher({ apiKey: process.env.OPENROUTER_API_KEY, model: process.env.OPENROUTER_MODEL });
        this.smartChecks = new SmartChecks(sensorCommands);
        this.farmContent = new FarmContent(db);
        this.app = express();
        this.port = process.env.API_PORT || process.env.GATEWAY_PORT || 3001;
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(cors());
        // Capture raw body for Meta webhook signature verification
        this.app.use((req, res, next) => {
            let data = '';
            req.on('data', chunk => { data += chunk; });
            req.on('end', () => { req.rawBody = data; });
            next();
        });
        this.app.use(express.json());

        // ── Bearer token auth ─────────────────────────────────────────────────
        // Public routes that skip auth:
        //   /health          — uptime probes
        //   /api/webhooks/*  — Meta sends events without our token (verified by HMAC instead)
        //   /api/social/auth/* — OAuth redirect callbacks
        //   /api/openapi     — spec is public
        const PUBLIC_PREFIXES = [
            '/health',
            '/api/webhooks/',
            '/api/social/auth/',
            '/api/data-deletion',
            '/api/payments/crypto/webhook', // Binance Pay webhook
            '/api/openapi'
        ];
        this.app.use((req, res, next) => {
            if (PUBLIC_PREFIXES.some(p => req.path.startsWith(p))) return next();

            const gatewayToken = process.env.CLAWDBOT_GATEWAY_TOKEN || process.env.GATEWAY_TOKEN || process.env.MOLTBOT_GATEWAY_TOKEN;
            if (!gatewayToken) return next(); // token not configured — allow all (dev mode)

            const authHeader = req.headers['authorization'] || '';
            const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

            if (!token || token !== gatewayToken) {
                return res.status(401).json({ error: 'Unauthorized', message: 'Valid Bearer token required' });
            }
            next();
        });
    }

    setupRoutes() {
        // ── Meta Webhooks (must be before other routes for rawBody) ────────
        this.app.use('/api/webhooks/meta', metaWebhooksRoute(this.socialMedia, this.aiEngine, this.farmContent));

        // ── Meta Data Deletion Callback (public — Meta POSTs without Bearer) ─
        this.app.use('/api/data-deletion', dataDeletionRoute(this.db));

        // ── Social Media Routes ───────────────────────────────────────────────
        if (this.socialMedia) {
            this.app.use('/api/social', socialMediaRoute(this.socialMedia));
        }

        // ── Marketing Routes ─────────────────────────────────────────────
        this.app.use('/api/marketing', marketingRoute(this.farmContent, this.aiEngine, this.sensorCommands, this.blobStorage));

        // ── Farm Routes (NDVI + Burro) ─────────────────────────────────────
        const farmRoute = require('./routes/farm');
        this.app.use('/api/farm', farmRoute());

        // ── Crypto Payment Routes ───────────────────────────────────────
        this.app.use('/api/payments/crypto', createCryptoRoutes(this.db, this.serviceBus));

        // Health check
        this.app.get('/health', (req, res) => {
            const BinancePay = require('./binance-pay');
            const binancePay = new BinancePay({ db: this.db, serviceBus: this.serviceBus });
            
            res.json({
                status: 'ok',
                database: this.db ? this.db.isConnected : false,
                databases: this.db ? Object.keys(this.db.pools) : [],
                billing: this.billing.getStatus(),
                binancePay: binancePay.getStatus()
            });
        });

        // Twilio SMS webhook — receives YES/NO replies for device command confirmation
        this.app.post('/api/twilio/sms', express.urlencoded({ extended: false }), async (req, res) => {
            try {
                const from = req.body.From;  // e.g. +61467413589
                const body = (req.body.Body || '').trim();
                console.log(`[Twilio] SMS from ${from}: ${body}`);

                const twiml = '<?xml version="1.0" encoding="UTF-8"?><Response>';

                if (this.deviceCommands) {
                    const result = await this.deviceCommands.resolveSMSConfirmation(from, body);
                    if (result) {
                        // Post the result to the user's chat history so it appears in Red Dog's chat bubble
                        if (result.executed && this.aiEngine && result.userId) {
                            await this.aiEngine.addToHistory(result.userId, 'assistant', result.reply);
                        }
                        // SMS response already sent by DeviceCommands — just acknowledge
                        return res.type('text/xml').send(`${twiml}</Response>`);
                    }
                }

                // No pending action found
                res.type('text/xml').send(`${twiml}<Message>Red Dog here! No pending command to confirm. Send a command via Red Dog chat first.</Message></Response>`);
            } catch (error) {
                console.error('[Twilio] Webhook error:', error.message);
                res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response><Message>Red Dog encountered an error processing your reply.</Message></Response>');
            }
        });

        // Sensor API routes (live readings via APIM + per-farm Key Vault)
        if (this.sensorCommands && this.sensorCommands.sensor && this.sensorCommands.sensor.enabled) {
            // GET /api/sensors/farms — list all farms from Site Overview
            this.app.get('/api/sensors/farms', async (req, res) => {
                try {
                    const farms = await this.sensorCommands.sensor.listFarms();
                    res.json({ farms });
                } catch (e) { res.status(500).json({ error: e.message }); }
            });

            // GET /api/sensors/all/latest — aggregate all farms (must be before /:farm/latest)
            this.app.get('/api/sensors/all/latest', async (req, res) => {
                try {
                    const provider = req.query.provider || null;
                    const data = await this.sensorCommands.sensor.getAllFarmsReadings(provider);
                    res.json({ farms: data });
                } catch (e) { res.status(500).json({ error: e.message }); }
            });

            // GET /api/sensors/:farm/latest — latest readings for a farm (or all providers if no ?provider=)
            this.app.get('/api/sensors/:farm/latest', async (req, res) => {
                try {
                    const farmName = decodeURIComponent(req.params.farm);
                    const provider = req.query.provider || null;
                    const data = provider
                        ? await this.sensorCommands.sensor.getLatestReadings(farmName, provider)
                        : await this.sensorCommands.sensor.getAllProvidersLatest(farmName);
                    res.json(data);
                } catch (e) { res.status(500).json({ error: e.message }); }
            });

            // GET /api/sensors/:farm/history — historical readings
            this.app.get('/api/sensors/:farm/history', async (req, res) => {
                try {
                    const farmName = decodeURIComponent(req.params.farm);
                    const { provider, hours = 24 } = req.query;
                    if (!provider) return res.status(400).json({ error: 'provider query param required' });
                    const data = await this.sensorCommands.sensor.getHistory(farmName, provider, parseInt(hours));
                    res.json(data);
                } catch (e) { res.status(500).json({ error: e.message }); }
            });

            // GET /api/sensors/:farm/vault — check Key Vault name for a farm
            this.app.get('/api/sensors/:farm/vault', async (req, res) => {
                try {
                    const farmName = decodeURIComponent(req.params.farm);
                    const vaultName = await this.sensorCommands.sensor.getFarmVaultName(farmName);
                    res.json({ farmName, keyVaultName: vaultName });
                } catch (e) { res.status(500).json({ error: e.message }); }
            });
        }

        // Device control routes (direct API access)
        if (this.deviceCommands && this.deviceCommands.functions && this.deviceCommands.functions.enabled) {
            this.app.get('/api/devices/lorawan', async (req, res) => {
                try {
                    const data = await this.deviceCommands.functions.getLoRaWANDevices();
                    res.json(data);
                } catch (e) { res.status(500).json({ error: e.message }); }
            });

            this.app.get('/api/devices/lorawan/:deviceId/status', async (req, res) => {
                try {
                    const data = await this.deviceCommands.functions.getLoRaWANStatus(req.params.deviceId);
                    res.json(data);
                } catch (e) { res.status(500).json({ error: e.message }); }
            });

            this.app.get('/api/devices/lorawan/:deviceId/relay', async (req, res) => {
                try {
                    const data = await this.deviceCommands.functions.getRelayStatus(req.params.deviceId);
                    res.json(data);
                } catch (e) { res.status(500).json({ error: e.message }); }
            });

            this.app.post('/api/devices/lorawan/:deviceId/relay', async (req, res) => {
                try {
                    const { relayId, state } = req.body;
                    const data = await this.deviceCommands.functions.controlRelay(req.params.deviceId, relayId, state);
                    res.json(data);
                } catch (e) { res.status(500).json({ error: e.message }); }
            });

            this.app.get('/api/devices/wattwatchers/:deviceId/switches', async (req, res) => {
                try {
                    const data = await this.deviceCommands.functions.getSwitchStatus(req.params.deviceId, req.query.siteId);
                    res.json(data);
                } catch (e) { res.status(500).json({ error: e.message }); }
            });

            this.app.patch('/api/devices/wattwatchers/:deviceId/switches', async (req, res) => {
                try {
                    const { switchId, state, siteId } = req.body;
                    const data = await this.deviceCommands.functions.controlSwitch(req.params.deviceId, switchId, state, siteId);
                    res.json(data);
                } catch (e) { res.status(500).json({ error: e.message }); }
            });

            this.app.get('/api/devices/wattwatchers/:deviceId/energy', async (req, res) => {
                try {
                    const data = await this.deviceCommands.functions.getEnergyLatest(req.params.deviceId, req.query.siteId);
                    res.json(data);
                } catch (e) { res.status(500).json({ error: e.message }); }
            });
        }

        // Quick-action prompt chips for chat UI
        this.app.get('/api/chat/prompts', (req, res) => {
            res.json({
                greeting: this.aiEngine?.persona?.greeting || "G'day! Give me a command!",
                prompts: [
                    {
                        id: 'realtime',
                        label: '📡 Real time data treats',
                        message: 'Show me the latest real-time sensor readings for the farm',
                        category: 'sensors'
                    },
                    {
                        id: 'insights',
                        label: '📊 Long term insights',
                        message: 'Give me long-term trends and analysis from the farm database',
                        category: 'database'
                    },
                    {
                        id: 'control',
                        label: '🎛️ Control farm systems',
                        message: 'What farm systems and devices can I control right now?',
                        category: 'devices'
                    },
                    {
                        id: 'trev',
                        label: '🚜 Retrieve data for Trev',
                        message: 'Fetch the latest farm data and send it to @Trevor',
                        category: 'agents'
                    },
                    {
                        id: 'courses',
                        label: '🎓 Start a Course',
                        message: 'Show me available courses on Agentic Ag',
                        category: 'education'
                    },
                    {
                        id: 'smart-check',
                        label: '🔍 Smart Check',
                        message: 'Check battery and soil conditions for automation suggestions',
                        category: 'automation'
                    },
                    {
                        id: 'social',
                        label: '✨ Show off — post some tricks',
                        message: null,
                        category: 'social',
                        children: [
                            { id: 'instagram', label: '📸 Post to Instagram', message: 'Create an Instagram post showcasing the farm' },
                            { id: 'facebook_ad', label: '📣 Run a Facebook Ad', message: 'Set up a Facebook ad campaign for the farm' },
                            { id: 'linkedin', label: '💼 Post to LinkedIn', message: 'Write a professional LinkedIn post about the farm' },
                            { id: 'whatsapp', label: '💬 Message the team on WhatsApp', message: 'Send a farm update to the team on WhatsApp' }
                        ]
                    }
                ]
            });
        });

        // ── Course Teacher Endpoints ──────────────────────────────────────────

        this.app.get('/api/courses', (req, res) => {
            res.json({ courses: this.courseTeacher.listCourses(req.query.category || null) });
        });

        this.app.get('/api/courses/:courseId', (req, res) => {
            const course = this.courseTeacher.getCourse(req.params.courseId);
            if (!course) return res.status(404).json({ error: 'Course not found' });
            res.json(course);
        });

        this.app.post('/api/courses/session', (req, res) => {
            try {
                const { userId, courseId, background } = req.body;
                if (!userId || !courseId) return res.status(400).json({ error: 'userId and courseId required' });
                const result = this.courseTeacher.startSession(userId, courseId, background || 'beginner');
                res.json({ started: true, course: result.course.title, profile: result.profile.label, modules: result.course.modules.length });
            } catch (e) { res.status(400).json({ error: e.message }); }
        });

        this.app.get('/api/courses/session/:userId', (req, res) => {
            const session = this.courseTeacher.getSession(req.params.userId);
            if (!session) return res.status(404).json({ error: 'No active session' });
            const course = this.courseTeacher.getCourse(session.courseId);
            res.json({ session, courseTitle: course?.title });
        });

        this.app.delete('/api/courses/session/:userId', (req, res) => {
            const session = this.courseTeacher.endSession(req.params.userId);
            res.json({ ended: true, score: session?.score ?? 0, questionsAnswered: session?.questionsAsked?.length ?? 0 });
        });

        this.app.get('/api/courses/question/:userId', async (req, res) => {
            try {
                const q = await this.courseTeacher.generateQuestion(req.params.userId);
                res.json(q);
            } catch (e) { res.status(400).json({ error: e.message }); }
        });

        this.app.post('/api/courses/answer/:userId', async (req, res) => {
            try {
                const { answer } = req.body;
                if (!answer) return res.status(400).json({ error: 'answer required' });
                const result = await this.courseTeacher.evaluateAnswer(req.params.userId, answer);
                res.json(result);
            } catch (e) { res.status(400).json({ error: e.message }); }
        });

        this.app.get('/api/courses/:courseId/teacher-prompts', async (req, res) => {
            try {
                const result = await this.courseTeacher.getTeacherPrompts(req.params.courseId, req.query.background || 'farmer', parseInt(req.query.count) || 5);
                res.json(result);
            } catch (e) { res.status(500).json({ error: e.message }); }
        });

        // Chat endpoint — send a message, get an AI response (with optional DB queries)
        this.app.post('/api/chat', async (req, res) => {
            try {
                const { message, userId } = req.body;
                if (!message) {
                    return res.status(400).json({ error: 'message is required' });
                }
                
                // Check credits for chat operation (1 credit)
                const userIdentifier = userId || req.ip;
                const creditCheck = await this.billing.checkCreditsBeforeOperation(userIdentifier, 'api_call');
                if (!creditCheck.allowed) {
                    return res.status(402).json({ 
                        error: 'Insufficient credits',
                        required: creditCheck.required,
                        available: creditCheck.available,
                        suggestion: creditCheck.suggestion
                    });
                }
                
                const result = await this.aiEngine.chat(message, userIdentifier);
                
                // Consume credits for successful response
                if (result.reply) {
                    await this.billing.consumeCredits(userIdentifier, 'api_call', 1, {
                        operation: 'chat',
                        messageLength: message.length
                    });
                }
                
                res.json(result);
            } catch (error) {
                console.error('Chat API error:', error.message);
                res.status(500).json({ error: error.message });
            }
        });

        // Direct SQL query endpoint
        this.app.post('/api/query', async (req, res) => {
            try {
                const { sql, database } = req.body;
                if (!sql) {
                    return res.status(400).json({ error: 'sql is required' });
                }
                if (!this.db || !this.db.isConnected) {
                    return res.status(503).json({ error: 'Database not connected' });
                }

                // Safety check
                const unsafeKeywords = ['drop', 'delete', 'update', 'insert', 'truncate', 'alter', 'create'];
                if (unsafeKeywords.some(kw => sql.toLowerCase().includes(kw))) {
                    return res.status(403).json({ error: 'Only SELECT queries are allowed' });
                }

                const results = await this.db.query(sql, [], database || null);
                res.json({ rows: results, rowCount: results.length });
            } catch (error) {
                console.error('Query API error:', error.message);
                res.status(500).json({ error: error.message });
            }
        });

        // Schema endpoint — get the cached database schema
        this.app.get('/api/schema', (req, res) => {
            res.json({
                schema: this.aiEngine.getSchema(),
                databases: this.db ? this.db.listConnectedDatabases() : []
            });
        });

        // OpenAPI spec endpoint
        this.app.get('/api/openapi', (req, res) => {
            const baseUrl = `${req.protocol}://${req.get('host')}`;
            const spec = {
                openapi: '3.0.0',
                info: {
                    title: 'Red Dog API',
                    description: 'Agentic Ag farm data assistant — chat, sensors, devices, courses, billing, and social media',
                    version: 'v90',
                    contact: {
                        name: 'Agentic Ag',
                        url: 'https://agentic.ag'
                    }
                },
                servers: [
                    { url: baseUrl, description: 'Production' }
                ],
                paths: {
                    '/health': {
                        get: {
                            summary: 'Health check',
                            description: 'Check API and database connectivity',
                            tags: ['System'],
                            responses: {
                                200: { description: 'Service healthy' }
                            }
                        }
                    },
                    '/chat': {
                        post: {
                            summary: 'Chat with Red Dog',
                            description: 'Send a message and get AI response with optional database queries',
                            tags: ['Chat'],
                            requestBody: {
                                required: true,
                                content: {
                                    'application/json': {
                                        schema: {
                                            type: 'object',
                                            properties: {
                                                message: { type: 'string', description: 'User message' },
                                                userId: { type: 'string', description: 'User identifier for session persistence' }
                                            },
                                            required: ['message']
                                        }
                                    }
                                }
                            },
                            responses: {
                                200: { description: 'AI response', content: { 'application/json': { schema: { type: 'object' } } } }
                            }
                        }
                    },
                    '/chat/prompts': {
                        get: {
                            summary: 'Quick-action prompt chips',
                            description: 'Get structured prompt suggestions for the chat UI',
                            tags: ['Chat'],
                            responses: {
                                200: { description: 'Prompt list', content: { 'application/json': { schema: { type: 'object' } } } }
                            }
                        }
                    },
                    '/courses': {
                        get: {
                            summary: 'List all courses',
                            description: 'Get available courses with optional category filter',
                            tags: ['Courses'],
                            parameters: [
                                { name: 'category', in: 'query', schema: { type: 'string' }, description: 'Filter by category' }
                            ],
                            responses: {
                                200: { description: 'Course list', content: { 'application/json': { schema: { type: 'object' } } } },
                                404: { description: 'Course not found' }
                            }
                        }
                    },
                    '/courses/session': {
                        post: {
                            summary: 'Start a course session',
                            description: 'Begin a new learning session for a user',
                            tags: ['Courses'],
                            requestBody: {
                                required: true,
                                content: {
                                    'application/json': {
                                        schema: {
                                            type: 'object',
                                            properties: {
                                                userId: { type: 'string' },
                                                courseId: { type: 'string' },
                                                background: { type: 'string', enum: ['beginner', 'farmer', 'student', 'technical', 'professional', 'sprouts'] }
                                            },
                                            required: ['userId', 'courseId']
                                        }
                                    }
                                }
                            },
                            responses: {
                                200: { description: 'Session started', content: { 'application/json': { schema: { type: 'object' } } } }
                            }
                        }
                    },
                    '/courses/question/{userId}': {
                        get: {
                            summary: 'Get next question',
                            description: 'Generate the next adaptive question for a user session',
                            tags: ['Courses'],
                            parameters: [
                                { name: 'userId', in: 'path', required: true, schema: { type: 'string' } }
                            ],
                            responses: {
                                200: { description: 'Question data', content: { 'application/json': { schema: { type: 'object' } } } }
                            }
                        }
                    },
                    '/courses/answer/{userId}': {
                        post: {
                            summary: 'Evaluate answer',
                            description: 'Submit and evaluate a user answer with feedback',
                            tags: ['Courses'],
                            parameters: [
                                { name: 'userId', in: 'path', required: true, schema: { type: 'string' } }
                            ],
                            requestBody: {
                                required: true,
                                content: {
                                    'application/json': {
                                        schema: {
                                            type: 'object',
                                            properties: {
                                                answer: { type: 'string' }
                                            },
                                            required: ['answer']
                                        }
                                    }
                                }
                            },
                            responses: {
                                200: { description: 'Evaluation result', content: { 'application/json': { schema: { type: 'object' } } } }
                            }
                        }
                    },
                    '/courses/{courseId}/teacher-prompts': {
                        get: {
                            summary: 'Get teacher prompts',
                            description: 'Get discussion prompts for classroom teaching',
                            tags: ['Courses'],
                            parameters: [
                                { name: 'courseId', in: 'path', required: true, schema: { type: 'string' } },
                                { name: 'background', in: 'query', schema: { type: 'string', enum: ['beginner', 'farmer', 'student', 'technical', 'professional', 'sprouts'] } },
                                { name: 'count', in: 'query', schema: { type: 'integer', default: 5 } }
                            ],
                            responses: {
                                200: { description: 'Teacher prompts', content: { 'application/json': { schema: { type: 'object' } } } }
                            }
                        }
                    },
                    '/sensors/{farm}/latest': {
                        get: {
                            summary: 'Latest sensor readings',
                            description: 'Get latest readings for a farm (all providers or specific)',
                            tags: ['Sensors'],
                            parameters: [
                                { name: 'farm', in: 'path', required: true, schema: { type: 'string' } },
                                { name: 'provider', in: 'query', schema: { type: 'string' } }
                            ],
                            responses: {
                                200: { description: 'Sensor data', content: { 'application/json': { schema: { type: 'object' } } } }
                            }
                        }
                    },
                    '/devices/lorawan': {
                        get: {
                            summary: 'List LoRaWAN devices',
                            description: 'Get all configured LoRaWAN devices',
                            tags: ['Devices'],
                            responses: {
                                200: { description: 'Device list', content: { 'application/json': { schema: { type: 'object' } } } }
                            }
                        }
                    },
                    '/devices/wattwatchers/{deviceId}/switches': {
                        get: {
                            summary: 'Get switch status',
                            description: 'Get current status of WattWatchers switches',
                            tags: ['Devices'],
                            parameters: [
                                { name: 'deviceId', in: 'path', required: true, schema: { type: 'string' } },
                                { name: 'siteId', in: 'query', schema: { type: 'string' } }
                            ],
                            responses: {
                                200: { description: 'Switch status', content: { 'application/json': { schema: { type: 'object' } } } }
                            }
                        }
                    },
                    '/schema': {
                        get: {
                            summary: 'Database schema',
                            description: 'Get cached database schema and connected databases',
                            tags: ['System'],
                            responses: {
                                200: { description: 'Schema info', content: { 'application/json': { schema: { type: 'object' } } } }
                            }
                        }
                    },
                    '/query': {
                        post: {
                            summary: 'Execute SQL query',
                            description: 'Run a SELECT query (safety enforced)',
                            tags: ['Database'],
                            requestBody: {
                                required: true,
                                content: {
                                    'application/json': {
                                        schema: {
                                            type: 'object',
                                            properties: {
                                                sql: { type: 'string' },
                                                database: { type: 'string' }
                                            },
                                            required: ['sql']
                                        }
                                    }
                                }
                            },
                            responses: {
                                200: { description: 'Query results', content: { 'application/json': { schema: { type: 'object' } } } }
                            }
                        }
                    },
                    '/smart-checks': {
                        get: {
                            summary: 'Smart automation checks',
                            description: 'Evaluate battery, soil, and weather conditions for automation suggestions',
                            tags: ['Automation'],
                            parameters: [
                                { name: 'farm', in: 'query', schema: { type: 'string', default: 'Grassgum Farm' }, description: 'Farm name' }
                            ],
                            responses: {
                                200: { description: 'Automation triggers', content: { 'application/json': { schema: { type: 'object' } } } }
                            }
                        }
                    }
                },
                tags: [
                    { name: 'Chat', description: 'Conversational AI interface' },
                    { name: 'Courses', description: 'Adaptive learning system' },
                    { name: 'Sensors', description: 'Real-time sensor data' },
                    { name: 'Devices', description: 'Device control and status' },
                    { name: 'Database', description: 'SQL queries and schema' },
                    { name: 'Automation', description: 'Smart automation triggers' },
                    { name: 'System', description: 'Health and diagnostics' }
                ]
            };
            res.json(spec);
        });

        // Smart checks endpoint — evaluate conditions and suggest controls
        this.app.get('/api/smart-checks', async (req, res) => {
            try {
                const { farm = 'Grassgum Farm' } = req.query;
                
                if (!this.sensorCommands) {
                    return res.status(503).json({ 
                        error: 'Sensor commands not available',
                        triggers: [] 
                    });
                }

                const triggers = await this.smartChecks.runAllChecks(farm);
                
                res.json({
                    farm,
                    timestamp: new Date().toISOString(),
                    triggers,
                    count: triggers.length
                });
            } catch (error) {
                console.error('[SmartChecks] Error:', error.message);
                res.status(500).json({ 
                    error: error.message,
                    triggers: [] 
                });
            }
        });

        // List tables (active database)
        this.app.get('/api/tables', async (req, res) => {
            try {
                if (!this.db || !this.db.isConnected) {
                    return res.status(503).json({ error: 'Database not connected' });
                }
                const tables = await this.db.getTables();
                res.json({ database: this.db.activeDb, tables });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // List tables for a specific database
        this.app.get('/api/tables/:database', async (req, res) => {
            try {
                if (!this.db || !this.db.isConnected) {
                    return res.status(503).json({ error: 'Database not connected' });
                }
                const tables = await this.db.getTables(req.params.database);
                res.json({ database: req.params.database, tables });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Get table schema
        this.app.get('/api/tables/:database/:table', async (req, res) => {
            try {
                if (!this.db || !this.db.isConnected) {
                    return res.status(503).json({ error: 'Database not connected' });
                }
                const schema = await this.db.getTableSchema(req.params.table, req.params.database);
                res.json({ database: req.params.database, table: req.params.table, columns: schema });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // List all databases
        this.app.get('/api/databases', (req, res) => {
            if (!this.db || !this.db.isConnected) {
                return res.status(503).json({ error: 'Database not connected' });
            }
            res.json({ databases: this.db.listConnectedDatabases() });
        });

        // === Billing Endpoints ===
        
        // Get billing summary for user
        this.app.get('/api/billing/:userOid', async (req, res) => {
            try {
                const summary = await this.billing.getBillingSummary(req.params.userOid);
                res.json(summary);
            } catch (error) {
                console.error('Billing summary error:', error.message);
                res.status(500).json({ error: error.message });
            }
        });
        
        // Get user credits
        this.app.get('/api/credits/:userOid', async (req, res) => {
            try {
                const credits = await this.billing.getUserCredits(req.params.userOid);
                res.json(credits);
            } catch (error) {
                console.error('Credits error:', error.message);
                res.status(500).json({ error: error.message });
            }
        });
        
        // Create payment intent
        this.app.post('/api/billing/payment', async (req, res) => {
            try {
                const { userOid, amount, currency } = req.body;
                if (!userOid || !amount) {
                    return res.status(400).json({ error: 'userOid and amount are required' });
                }
                const paymentIntent = await this.billing.createPaymentIntent(userOid, amount, currency);
                res.json(paymentIntent);
            } catch (error) {
                console.error('Payment intent error:', error.message);
                res.status(500).json({ error: error.message });
            }
        });
        
        // Confirm payment (webhook endpoint)
        this.app.post('/api/billing/webhook', async (req, res) => {
            try {
                // In production, verify Stripe webhook signature
                const { paymentIntentId } = req.body;
                if (!paymentIntentId) {
                    return res.status(400).json({ error: 'paymentIntentId is required' });
                }
                const result = await this.billing.confirmPayment(paymentIntentId);
                res.json(result);
            } catch (error) {
                console.error('Webhook error:', error.message);
                res.status(500).json({ error: error.message });
            }
        });
        
        // Create subscription
        this.app.post('/api/billing/subscription', async (req, res) => {
            try {
                const { userOid, plan, paymentMethodId } = req.body;
                if (!userOid || !plan) {
                    return res.status(400).json({ error: 'userOid and plan are required' });
                }
                const subscription = await this.billing.createSubscription(userOid, plan, paymentMethodId);
                res.json(subscription);
            } catch (error) {
                console.error('Subscription error:', error.message);
                res.status(500).json({ error: error.message });
            }
        });
        
        // Create user account
        this.app.post('/api/billing/account', async (req, res) => {
            try {
                const { userOid, userEmail, userName, plan } = req.body;
                if (!userOid || !userEmail) {
                    return res.status(400).json({ error: 'userOid and userEmail are required' });
                }
                const account = await this.billing.createUserAccount(userOid, userEmail, userName, plan);
                res.json(account);
            } catch (error) {
                console.error('Account creation error:', error.message);
                res.status(500).json({ error: error.message });
            }
        });
    }

    async start() {
        return new Promise((resolve) => {
            this.server = this.app.listen(this.port, () => {
                console.log(`Red Dog API server running on http://localhost:${this.port}`);
                resolve();
            });
        });
    }

    async stop() {
        if (this.server) {
            return new Promise((resolve) => {
                this.server.close(resolve);
            });
        }
    }
}

module.exports = APIServer;
