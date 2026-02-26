/**
 * Red Dog Service Bus Client
 * 
 * Handles Azure Service Bus communication with Trevor Tractor
 * for data provider authentication and data exchange
 */

const { ServiceBusClient } = require('@azure/service-bus');

class ServiceBusManager {
    constructor({ connectionString, topicName = 'agri-events' }) {
        this.connectionString = connectionString || process.env.SERVICE_BUS_CONNECTION_STRING;
        this.topicName = topicName;
        this.client = null;
        this.sender = null;
        this.receiver = null;
        this.isConnected = false;
        this.messageHandlers = new Map();
    }

    async connect() {
        if (!this.connectionString) {
            console.log('[ServiceBus] No connection string provided, Service Bus disabled');
            return false;
        }

        try {
            this.client = new ServiceBusClient(this.connectionString);
            this.sender = this.client.createSender(this.topicName);
            
            // Subscribe to messages from Trevor
            this.receiver = this.client.createReceiver(this.topicName, 'red-dog-subscription', {
                receiveMode: 'peekLock'
            });
            
            this.isConnected = true;
            console.log(`[ServiceBus] Connected to topic: ${this.topicName}`);
            
            // Start listening for messages
            this.startMessageListener();
            
            return true;
        } catch (err) {
            console.error(`[ServiceBus] Failed to connect: ${err.message}`);
            this.isConnected = false;
            return false;
        }
    }

    /**
     * Start listening for messages from Trevor
     */
    startMessageListener() {
        if (!this.receiver) return;

        this.receiver.subscribe({
            processMessage: async (message) => {
                try {
                    const messageType = message.applicationProperties?.messageType;
                    console.log(`[ServiceBus] Received message: ${messageType}`);
                    
                    // Route message to appropriate handler
                    const handler = this.messageHandlers.get(messageType);
                    if (handler) {
                        await handler(message.body);
                    } else {
                        console.log(`[ServiceBus] No handler for message type: ${messageType}`);
                    }
                    
                    // Complete the message
                    await this.receiver.completeMessage(message);
                } catch (err) {
                    console.error(`[ServiceBus] Error processing message: ${err.message}`);
                    await this.receiver.abandonMessage(message);
                }
            },
            processError: async (err) => {
                console.error(`[ServiceBus] Error in message listener: ${err.message}`);
            }
        });
    }

    /**
     * Register a handler for a specific message type
     */
    onMessage(messageType, handler) {
        this.messageHandlers.set(messageType, handler);
        console.log(`[ServiceBus] Registered handler for: ${messageType}`);
    }

    /**
     * Send a message to Trevor via Service Bus
     */
    async sendMessage(messageType, data) {
        if (!this.isConnected) {
            throw new Error('Service Bus not connected');
        }

        try {
            const message = {
                body: data,
                applicationProperties: {
                    messageType,
                    sender: 'red-dog',
                    timestamp: new Date().toISOString()
                }
            };
            
            await this.sender.sendMessages(message);
            console.log(`[ServiceBus] Sent message: ${messageType}`);
        } catch (err) {
            console.error(`[ServiceBus] Failed to send message: ${err.message}`);
            throw err;
        }
    }

    /**
     * Request data from external provider via Trevor
     */
    async requestProviderData({ provider, dataType, credentials, filters = {} }) {
        return await this.sendMessage('request-provider-data', {
            provider,
            dataType,
            credentials,
            filters,
            requestId: this.generateRequestId()
        });
    }

    /**
     * Acknowledge receipt of provider data from Trevor
     */
    async acknowledgeProviderData({ requestId, blobName, status }) {
        return await this.sendMessage('provider-data-ack', {
            requestId,
            blobName,
            status
        });
    }

    /**
     * Generate unique request ID
     */
    generateRequestId() {
        return `reddog-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Disconnect from Service Bus
     */
    async disconnect() {
        if (this.receiver) {
            await this.receiver.close();
        }
        if (this.sender) {
            await this.sender.close();
        }
        if (this.client) {
            await this.client.close();
        }
        this.isConnected = false;
        console.log('[ServiceBus] Disconnected');
    }

    getStatus() {
        return {
            connected: this.isConnected,
            topicName: this.topicName,
            hasConnectionString: !!this.connectionString
        };
    }
}

module.exports = ServiceBusManager;
