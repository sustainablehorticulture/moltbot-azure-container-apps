const express = require('express');
const cors = require('cors');
const BillingSystem = require('./billing-system');

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
        this.app = express();
        this.port = process.env.API_PORT || process.env.GATEWAY_PORT || 3001;
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json());
    }

    setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'ok',
                database: this.db ? this.db.isConnected : false,
                databases: this.db ? Object.keys(this.db.pools) : [],
                billing: this.billing.getStatus()
            });
        });

        // Social media routes
        if (this.socialMedia) {
            const socialMediaRoutes = require('./routes/social-media')(this.socialMedia);
            this.app.use('/api/social', socialMediaRoutes);
        }

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
