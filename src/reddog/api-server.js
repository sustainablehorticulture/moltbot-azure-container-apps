const express = require('express');
const cors = require('cors');

class APIServer {
    constructor(aiEngine, db) {
        this.aiEngine = aiEngine;
        this.db = db;
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
                databases: this.db ? Object.keys(this.db.pools) : []
            });
        });

        // Chat endpoint — send a message, get an AI response (with optional DB queries)
        this.app.post('/api/chat', async (req, res) => {
            try {
                const { message, userId } = req.body;
                if (!message) {
                    return res.status(400).json({ error: 'message is required' });
                }
                const result = await this.aiEngine.chat(message, userId || req.ip);
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
