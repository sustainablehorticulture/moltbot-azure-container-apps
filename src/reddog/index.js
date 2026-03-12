require('dotenv').config();
const DatabaseManager = require('../moltbot/database');
const AIEngine = require('./ai-engine');
const APIServer = require('./api-server');
const DiscordClient = require('./discord-client');
const BillingSystem = require('./billing-system');
const BlobStorageManager = require('./blob-storage');
const ServiceBusManager = require('./service-bus-client');
const DataApprovalManager = require('./data-approval-manager');
const SocialMediaManager = require('./social-media-manager');
const AgentCommunicationManager = require('./agent-communication');
const FunctionsClient = require('./functions-client');
const DeviceCommands = require('./device-commands');

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

    // 6. Initialize social media manager
    console.log('Initializing social media manager...');
    const socialMedia = new SocialMediaManager({ 
        db,
        apiUrl: `http://localhost:${process.env.API_PORT || 3001}`
    });

    // 7. Initialize Azure Functions client and device commands
    console.log('Initializing device control...');
    const functionsClient = new FunctionsClient();
    const deviceCommands = new DeviceCommands({ functionsClient });
    console.log('Device Control:', functionsClient.enabled ? `Connected (${functionsClient.baseUrl})` : 'Disabled (set AZURE_FUNCTIONS_URL + AZURE_FUNCTIONS_KEY)');

    // 8. Initialize AI engine
    console.log('Initializing AI engine...');
    const ai = new AIEngine(db, billing, blobStorage, serviceBus, approvalManager, deviceCommands);
    if (db.isConnected) {
        console.log('Caching database schema (this may take a moment)...');
        await ai.cacheSchema();
    }

    // 9. Start API server
    console.log('Starting API server...');
    const api = new APIServer(ai, db, blobStorage, serviceBus, approvalManager, socialMedia, deviceCommands);
    await api.start();

    // 10. Initialize agent communication manager
    console.log('Initializing agent communication...');
    const discord = new DiscordClient(ai);
    const agentComm = new AgentCommunicationManager({
        serviceBus,
        discord
    });
    
    // Set agent communication in Discord client
    discord.agentComm = agentComm;

    // 11. Start Discord client (optional — runs alongside API)
    console.log('Starting Discord client...');
    await discord.start();

    console.log('\n=== Red Dog Ready ===');
    console.log(`API:          http://localhost:${process.env.API_PORT || 3001}`);
    console.log(`Discord:      ${process.env.DISCORD_BOT_TOKEN ? 'Connected' : 'Disabled (no token)'}`);
    console.log(`Database:     ${db.isConnected ? Object.keys(db.pools).join(', ') : 'Disabled'}`);
    console.log(`Blob Storage: ${blobStorage.isConnected ? blobStorage.containerName : 'Disabled'}`);
    console.log(`Service Bus:  ${serviceBus.isConnected ? serviceBus.topicName : 'Disabled'}`);
    console.log(`Billing:      ${billing.getStatus().stripeConfigured ? 'Stripe configured' : 'Stripe not configured'}`);
    console.log(`Social Media: Instagram, Facebook, LinkedIn`);
    console.log(`Agent Comms:  ${agentComm.getStatus().serviceBusConnected ? 'Trevor, Daisy Bell' : 'Disabled'}`);
    console.log(`Device Control: ${functionsClient.enabled ? 'LoRaWAN + WattWatchers' : 'Disabled'}`);
    console.log(`Twilio SMS:   ${process.env.TWILIO_ACCOUNT_SID ? 'Configured (webhook: /api/twilio/sms)' : 'Disabled'}`);

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
