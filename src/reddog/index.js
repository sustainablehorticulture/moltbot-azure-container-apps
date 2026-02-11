require('dotenv').config();
const DatabaseManager = require('../moltbot/database');
const AIEngine = require('./ai-engine');
const APIServer = require('./api-server');
const DiscordClient = require('./discord-client');

async function main() {
    console.log('=== Red Dog Starting ===');
    console.log(`Time: ${new Date().toISOString()}\n`);

    // 1. Connect to databases
    console.log('Connecting to databases...');
    const db = new DatabaseManager({
        enabled: process.env.DATABASE_ENABLED === 'true',
        connectionString: process.env.DATABASE_CONNECTION_STRING,
        databases: process.env.DATABASE_NAMES ? process.env.DATABASE_NAMES.split(',').map(s => s.trim()) : [],
        type: process.env.DATABASE_TYPE || 'mssql'
    });

    if (db.config.enabled) {
        await db.connect();
    }
    console.log('Database:', db.isConnected ? `Connected (${Object.keys(db.pools).join(', ')})` : 'Disabled');

    // 2. Initialize AI engine with database context
    console.log('Initializing AI engine...');
    const ai = new AIEngine(db);
    if (db.isConnected) {
        console.log('Caching database schema (this may take a moment)...');
        await ai.cacheSchema();
    }

    // 3. Start API server
    console.log('Starting API server...');
    const api = new APIServer(ai, db);
    await api.start();

    // 4. Start Discord client (optional — runs alongside API)
    console.log('Starting Discord client...');
    const discord = new DiscordClient(ai);
    await discord.start();

    console.log('\n=== Red Dog Ready ===');
    console.log(`API:     http://localhost:${process.env.API_PORT || 3001}`);
    console.log(`Discord: ${process.env.DISCORD_BOT_TOKEN ? 'Connected' : 'Disabled (no token)'}`);
    console.log(`Database: ${db.isConnected ? Object.keys(db.pools).join(', ') : 'Disabled'}`);

    // Graceful shutdown
    const shutdown = async () => {
        console.log('\nShutting down Red Dog...');
        await discord.stop();
        await api.stop();
        await db.disconnect();
        console.log('Red Dog stopped.');
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

main().catch(error => {
    console.error('Red Dog failed to start:', error);
    process.exit(1);
});
