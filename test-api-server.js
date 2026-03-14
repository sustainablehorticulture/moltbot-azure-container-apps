require('dotenv').config();
const express = require('express');
const cors = require('cors');
const SensorAPIClient = require('./src/reddog/sensor-api-client');
const SensorCommands = require('./src/reddog/sensor-commands');
const DatabaseManager = require('./src/moltbot/database');
const AIEngine = require('./src/reddog/ai-engine');

async function startMinimalServer() {
    console.log('=== Starting Minimal Red Dog API Server ===');
    
    // Initialize database (minimal)
    const db = new DatabaseManager({
        enabled: false, // Disable DB for faster startup
        connectionString: process.env.DATABASE_CONNECTION_STRING,
        databases: [],
        type: 'mssql'
    });

    // Initialize sensor client
    const sensorClient = new SensorAPIClient(db);
    const sensorCommands = new SensorCommands({ sensorClient });

    // Initialize AI engine (minimal)
    const ai = new AIEngine(db, null, null, null, null, null, sensorCommands);

    const app = express();
    app.use(cors());
    app.use(express.json());

    // Health endpoint
    app.get('/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Chat endpoint (for testing soil moisture)
    app.post('/api/chat', async (req, res) => {
        try {
            const { message, userId = 'test-user' } = req.body;
            console.log(`[Chat] User: ${message}`);
            
            const response = await ai.chat(message, userId);
            console.log(`[Chat] Red Dog: ${response.reply?.substring(0, 100)}...`);
            
            res.json(response);
        } catch (error) {
            console.error('[Chat] Error:', error.message);
            res.status(500).json({ error: error.message });
        }
    });

    // Sensors endpoint
    app.get('/api/sensors/:farm/latest', async (req, res) => {
        try {
            const { farm } = req.params;
            const { provider } = req.query;
            
            console.log(`[Sensors] Getting latest data for farm: ${farm}, provider: ${provider || 'all'}`);
            
            const result = await sensorCommands.executeAction({
                farm,
                provider: provider || null,
                type: 'latest'
            });
            
            res.json(result);
        } catch (error) {
            console.error('[Sensors] Error:', error.message);
            res.status(500).json({ error: error.message });
        }
    });

    const port = process.env.API_PORT || 3001;
    app.listen(port, () => {
        console.log(`🚀 Minimal API Server running on http://localhost:${port}`);
        console.log(`📊 Sensor API enabled: ${sensorClient.enabled ? 'YES' : 'NO'}`);
        console.log(`🗄️  Database enabled: ${db.config.enabled ? 'YES' : 'NO'}`);
        console.log('\n=== Ready for testing ===');
        console.log('Try: curl -X POST http://localhost:3001/api/chat -H "Content-Type: application/json" -d "{\"message\":\"what is the current soil moisture\"}"');
    });
}

startMinimalServer().catch(console.error);
