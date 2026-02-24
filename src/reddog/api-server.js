const express = require('express');
const cors = require('cors');
const BillingSystem = require('./billing-system');

class APIServer {
    constructor(aiEngine, db) {
        this.aiEngine = aiEngine;
        this.db = db;
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
