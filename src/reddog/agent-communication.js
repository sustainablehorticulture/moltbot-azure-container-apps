/**
 * Red Dog Agent Communication Manager
 * 
 * Handles @mention routing between Red Dog, Trevor Tractor, and Daisy Bell
 * via Azure Service Bus messaging
 */

class AgentCommunicationManager {
    constructor({ serviceBus, discord }) {
        this.serviceBus = serviceBus;
        this.discord = discord;
        
        // Pending agent responses (waiting for reply) — Discord routing
        this.pendingRequests = new Map();

        // Pending programmatic awaits (Promise-based request-reply)
        this.pendingPromises = new Map();

        // Auth token cache: `${farmName}:${providerId}` → { token, expiresAt }
        this.authTokenCache = new Map();
        this.authCacheTTL = 55 * 60 * 1000; // 55 minutes
        
        // Agent name mappings
        this.agents = {
            'trevor': 'trevor-tractor',
            'trevor tractor': 'trevor-tractor',
            'daisy': 'daisy-bell',
            'daisy bell': 'daisy-bell',
            'daisybell': 'daisy-bell'
        };
        
        // Response timeout (30 seconds)
        this.responseTimeout = 30000;
        
        this.setupMessageHandlers();
    }

    /**
     * Set up Service Bus message handlers for agent communication
     */
    setupMessageHandlers() {
        if (!this.serviceBus || !this.serviceBus.isConnected) {
            console.log('[AgentComm] Service Bus not connected, agent communication disabled');
            return;
        }

        // Handle incoming messages from other agents
        this.serviceBus.onMessage('agent-message', async (data) => {
            console.log(`[AgentComm] Received message from ${data.from}: ${data.message}`);
            await this.handleIncomingAgentMessage(data);
        });

        // Handle replies from other agents
        this.serviceBus.onMessage('agent-reply', async (data) => {
            console.log(`[AgentComm] Received reply from ${data.from}`);
            await this.handleAgentReply(data);
        });

        console.log('[AgentComm] Agent communication handlers registered');
    }

    /**
     * Detect @mentions in a message
     * Returns array of mentioned agents and the cleaned message
     */
    detectMentions(message) {
        const mentions = [];
        let cleanedMessage = message;

        // Detect @trevor or @daisy mentions
        const mentionPattern = /@(trevor|trevor\s+tractor|daisy|daisy\s+bell|daisybell)/gi;
        const matches = message.matchAll(mentionPattern);

        for (const match of matches) {
            const mentionedName = match[1].toLowerCase().trim();
            const agentId = this.agents[mentionedName];
            
            if (agentId && !mentions.includes(agentId)) {
                mentions.push(agentId);
            }
        }

        // Remove @mentions from message for cleaner context
        cleanedMessage = message.replace(mentionPattern, '').trim();

        return { mentions, cleanedMessage };
    }

    /**
     * Route a message to mentioned agents
     */
    async routeToAgents({ message, mentions, userId, channelId, conversationId }) {
        if (!this.serviceBus || !this.serviceBus.isConnected) {
            console.log('[AgentComm] Service Bus not connected, cannot route to agents');
            return null;
        }

        if (mentions.length === 0) {
            return null;
        }

        const results = [];

        for (const agent of mentions) {
            try {
                const messageId = await this.serviceBus.sendToAgent({
                    agent,
                    message,
                    context: {
                        userId,
                        channelId,
                        platform: 'discord',
                        fromAgent: 'red-dog'
                    },
                    conversationId
                });

                // Store pending request
                this.pendingRequests.set(messageId, {
                    agent,
                    userId,
                    channelId,
                    conversationId,
                    timestamp: Date.now(),
                    timeout: setTimeout(() => {
                        this.handleTimeout(messageId);
                    }, this.responseTimeout)
                });

                results.push({
                    agent,
                    messageId,
                    status: 'sent'
                });

                console.log(`[AgentComm] Routed message to ${agent}: ${messageId}`);
            } catch (error) {
                console.error(`[AgentComm] Failed to route to ${agent}: ${error.message}`);
                results.push({
                    agent,
                    status: 'failed',
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Handle incoming message from another agent
     */
    async handleIncomingAgentMessage(data) {
        const { messageId, from, message, context, conversationId } = data;

        console.log(`[AgentComm] ${from} says: ${message}`);

        // If we have a Discord client, relay to Discord
        if (this.discord && context.channelId) {
            try {
                const agentName = this.getAgentDisplayName(from);
                const formattedMessage = `**${agentName}**: ${message}`;
                
                await this.discord.sendMessage(context.channelId, formattedMessage);
            } catch (error) {
                console.error(`[AgentComm] Failed to relay to Discord: ${error.message}`);
            }
        }

        // Auto-reply with acknowledgment (you can customize this)
        try {
            await this.serviceBus.replyToAgent({
                messageId,
                agent: from,
                reply: "G'day! Red Dog here, got your message mate!",
                conversationId
            });
        } catch (error) {
            console.error(`[AgentComm] Failed to send acknowledgment: ${error.message}`);
        }
    }

    /**
     * Handle reply from another agent.
     * Resolves programmatic Promises first, then relays to Discord if needed.
     */
    async handleAgentReply(data) {
        const { replyToMessageId, from, reply, payload, conversationId } = data;

        // Resolve any programmatic awaits first
        const pendingPromise = this.pendingPromises.get(replyToMessageId);
        if (pendingPromise) {
            clearTimeout(pendingPromise.timeout);
            this.pendingPromises.delete(replyToMessageId);
            pendingPromise.resolve({ from, reply, payload });
            console.log(`[AgentComm] Resolved programmatic request ${replyToMessageId} from ${from}`);
        }

        // Find the pending Discord-routing request
        const pending = this.pendingRequests.get(replyToMessageId);
        if (!pending) {
            if (!pendingPromise) {
                console.log(`[AgentComm] Received reply for unknown message: ${replyToMessageId}`);
            }
            return;
        }

        // Clear timeout
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(replyToMessageId);

        // Relay reply to Discord
        if (this.discord && pending.channelId) {
            try {
                const agentName = this.getAgentDisplayName(from);
                const formattedReply = `**${agentName}**: ${reply}`;
                
                await this.discord.sendMessage(pending.channelId, formattedReply);
                
                console.log(`[AgentComm] Relayed ${from}'s reply to Discord`);
            } catch (error) {
                console.error(`[AgentComm] Failed to relay reply to Discord: ${error.message}`);
            }
        }
    }

    /**
     * Send a message to an agent and await their reply programmatically.
     * Returns the reply payload or throws on timeout.
     *
     * @param {string} agent         - e.g. 'trevor-tractor'
     * @param {string} message       - human-readable message
     * @param {object} payload       - structured data for the agent
     * @param {number} timeoutMs     - ms to wait (default 30s)
     */
    async requestFromAgent({ agent, message, payload = {}, timeoutMs = 30000 }) {
        if (!this.serviceBus || !this.serviceBus.isConnected) {
            throw new Error(`[AgentComm] Service Bus not connected — cannot request from ${agent}`);
        }

        const conversationId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

        const messageId = await this.serviceBus.sendToAgent({
            agent,
            message,
            context: { fromAgent: 'red-dog', type: 'request', payload },
            conversationId
        });

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingPromises.delete(messageId);
                reject(new Error(`[AgentComm] Timeout waiting for ${agent} reply (${timeoutMs}ms)`));
            }, timeoutMs);

            this.pendingPromises.set(messageId, { resolve, reject, timeout, agent });
        });
    }

    /**
     * Request an auth token from Trevor Tractor for a specific farm + provider.
     *
     * Trevor responds with:
     *   { token: string, tokenType: 'Bearer'|'ApiKey'|'HeaderKeys',
     *     headers: { 'X-PIPER-KEY': '...', ... },   // for multi-key providers
     *     expiresIn: 3600 }                          // seconds
     *
     * Tokens are cached by farmName:providerId for 55 minutes.
     * Falls back to null if Trevor is unavailable (caller uses Key Vault directly).
     */
    async requestAuthToken(farmName, providerId) {
        const cacheKey = `${farmName.toLowerCase()}:${providerId}`;
        const cached = this.authTokenCache.get(cacheKey);
        if (cached && Date.now() < cached.expiresAt) {
            return cached.tokenData;
        }

        try {
            const response = await this.requestFromAgent({
                agent: 'trevor-tractor',
                message: `Auth token request for ${farmName} / ${providerId}`,
                payload: {
                    type: 'auth-token-request',
                    farmName,
                    providerId
                },
                timeoutMs: 3000
            });

            if (!response.payload || !response.payload.token && !response.payload.headers) {
                throw new Error('Trevor returned no token in payload');
            }

            const tokenData = response.payload;
            const ttl = (tokenData.expiresIn || 3600) * 1000;
            this.authTokenCache.set(cacheKey, { tokenData, expiresAt: Date.now() + Math.min(ttl, this.authCacheTTL) });

            console.log(`[AgentComm] Got auth token from Trevor for ${farmName}/${providerId}`);
            return tokenData;

        } catch (err) {
            console.warn(`[AgentComm] Trevor auth unavailable for ${farmName}/${providerId}: ${err.message}`);
            return null; // caller falls back to direct Key Vault
        }
    }

    /**
     * Handle timeout for agent response
     */
    async handleTimeout(messageId) {
        const pending = this.pendingRequests.get(messageId);
        if (!pending) return;

        this.pendingRequests.delete(messageId);

        console.log(`[AgentComm] Timeout waiting for ${pending.agent} response`);

        // Optionally notify Discord about timeout
        if (this.discord && pending.channelId) {
            try {
                const agentName = this.getAgentDisplayName(pending.agent);
                await this.discord.sendMessage(
                    pending.channelId,
                    `⏱️ ${agentName} didn't respond in time, mate. They might be busy out in the paddock.`
                );
            } catch (error) {
                console.error(`[AgentComm] Failed to send timeout message: ${error.message}`);
            }
        }
    }

    /**
     * Get display name for an agent
     */
    getAgentDisplayName(agentId) {
        const displayNames = {
            'trevor-tractor': 'Trevor Tractor',
            'daisy-bell': 'Daisy Bell',
            'red-dog': 'Red Dog'
        };
        return displayNames[agentId] || agentId;
    }

    /**
     * Send a direct message to an agent (programmatic, not from Discord)
     */
    async sendDirectMessage({ agent, message, context = {} }) {
        if (!this.serviceBus || !this.serviceBus.isConnected) {
            throw new Error('Service Bus not connected');
        }

        const conversationId = `direct-${Date.now()}`;
        
        return await this.serviceBus.sendToAgent({
            agent,
            message,
            context: {
                ...context,
                fromAgent: 'red-dog',
                type: 'direct'
            },
            conversationId
        });
    }

    /**
     * Broadcast a message to all agents
     */
    async broadcastToAgents({ message, context = {} }) {
        const agents = ['trevor-tractor', 'daisy-bell'];
        const results = [];

        for (const agent of agents) {
            try {
                const messageId = await this.sendDirectMessage({ agent, message, context });
                results.push({ agent, messageId, status: 'sent' });
            } catch (error) {
                results.push({ agent, status: 'failed', error: error.message });
            }
        }

        return results;
    }

    /**
     * Get status of pending requests
     */
    getStatus() {
        return {
            pendingRequests: this.pendingRequests.size,
            serviceBusConnected: this.serviceBus?.isConnected || false,
            discordConnected: !!this.discord,
            supportedAgents: Object.keys(this.agents)
        };
    }

    /**
     * Clean up pending requests
     */
    cleanup() {
        for (const [messageId, pending] of this.pendingRequests) {
            clearTimeout(pending.timeout);
        }
        this.pendingRequests.clear();

        for (const [messageId, pending] of this.pendingPromises) {
            clearTimeout(pending.timeout);
            pending.reject(new Error('AgentComm cleanup'));
        }
        this.pendingPromises.clear();
        this.authTokenCache.clear();
    }
}

module.exports = AgentCommunicationManager;
