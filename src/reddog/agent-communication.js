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
        
        // Pending agent responses (waiting for reply)
        this.pendingRequests = new Map();
        
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
     * Handle reply from another agent
     */
    async handleAgentReply(data) {
        const { replyToMessageId, from, reply, conversationId } = data;

        // Find the pending request
        const pending = this.pendingRequests.get(replyToMessageId);
        if (!pending) {
            console.log(`[AgentComm] Received reply for unknown message: ${replyToMessageId}`);
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
    }
}

module.exports = AgentCommunicationManager;
