require('dotenv').config();
const DatabaseManager = require('../moltbot/database');
const AIEngine = require('./ai-engine');
const APIServer = require('./api-server');
const DiscordClient = require('./discord-client');
const BillingSystem = require('./billing-system');
const BlobStorageManager = require('./blob-storage');
const ServiceBusManager = require('./service-bus-client');
const DataApprovalManager = require('./data-approval-manager');

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

    // 2. Initialize blob storage
    console.log('Connecting to blob storage...');
    const blobStorage = new BlobStorageManager({ 
        db,
        connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
        containerName: 'provider-data'
    });
    await blobStorage.connect();
    console.log('Blob Storage:', blobStorage.isConnected ? 'Connected' : 'Disabled');

    // 3. Initialize data approval manager
    console.log('Initializing data approval manager...');
    const approvalManager = new DataApprovalManager({ db });
    
    // Clean up expired approvals every hour
    setInterval(() => approvalManager.cleanupExpired(), 60 * 60 * 1000);

    // 4. Initialize Service Bus for Trevor communication
    console.log('Connecting to Service Bus...');
    const serviceBus = new ServiceBusManager({
        connectionString: process.env.SERVICE_BUS_CONNECTION_STRING,
        topicName: 'agri-events'
    });
    await serviceBus.connect();
    console.log('Service Bus:', serviceBus.isConnected ? 'Connected' : 'Disabled');

    // Set up Service Bus message handlers
    if (serviceBus.isConnected) {
        // Handle provider data from Trevor - queue for approval
        serviceBus.onMessage('provider-data-response', async (data) => {
            console.log(`[RedDog] Received provider data from Trevor: ${data.requestId}`);
            try {
                // Queue data for approval instead of storing immediately
                const approvalInfo = await approvalManager.queueForApproval(data);
                
                console.log(`[RedDog] Queued for approval: ${approvalInfo.approvalId}`);
                console.log(`  Provider: ${approvalInfo.provider}`);
                console.log(`  Data Type: ${approvalInfo.dataType}`);
                console.log(`  Records: ${approvalInfo.recordCount}`);
                console.log(`  Size: ${approvalInfo.dataSize} bytes`);
                console.log(`  Expires: ${approvalInfo.expiresAt}`);
                console.log(`  Use 'give lick of approval ${approvalInfo.approvalId}' or 'deny ${approvalInfo.approvalId}' to process`);
                
                // Acknowledge receipt
                await serviceBus.acknowledgeProviderData({
                    requestId: data.requestId,
                    approvalId: approvalInfo.approvalId,
                    status: 'pending-approval'
                });
            } catch (err) {
                console.error(`[RedDog] Failed to queue provider data: ${err.message}`);
            }
        });
    }

    // 5. Initialize billing system
    console.log('Initializing billing system...');
    const billing = new BillingSystem({ db });

    // 6. Initialize AI engine with database, billing, blob storage, and approval manager
    console.log('Initializing AI engine...');
    const ai = new AIEngine(db, billing, blobStorage, serviceBus, approvalManager);
    if (db.isConnected) {
        console.log('Caching database schema (this may take a moment)...');
        await ai.cacheSchema();
    }

    // 7. Start API server
    console.log('Starting API server...');
    const api = new APIServer(ai, db, blobStorage, serviceBus, approvalManager);
    await api.start();

    // 8. Start Discord client (optional — runs alongside API)
    console.log('Starting Discord client...');
    const discord = new DiscordClient(ai, blobStorage, approvalManager);
    await discord.start();

    console.log('\n=== Red Dog Ready ===');
    console.log(`API:          http://localhost:${process.env.API_PORT || 3001}`);
    console.log(`Discord:      ${process.env.DISCORD_BOT_TOKEN ? 'Connected' : 'Disabled (no token)'}`);
    console.log(`Database:     ${db.isConnected ? Object.keys(db.pools).join(', ') : 'Disabled'}`);
    console.log(`Blob Storage: ${blobStorage.isConnected ? blobStorage.containerName : 'Disabled'}`);
    console.log(`Service Bus:  ${serviceBus.isConnected ? serviceBus.topicName : 'Disabled'}`);
    console.log(`Billing:      ${billing.getStatus().stripeConfigured ? 'Stripe configured' : 'Stripe not configured'}`);

    // Graceful shutdown
    const shutdown = async () => {
        console.log('\nShutting down Red Dog...');
        await discord.stop();
        await api.stop();
        await serviceBus.disconnect();
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
