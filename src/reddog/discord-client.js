const { Client, GatewayIntentBits, Partials, ChannelType } = require('discord.js');

class DiscordClient {
    constructor(aiEngine, agentComm = null) {
        this.aiEngine = aiEngine;
        this.agentComm = agentComm;
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.DirectMessages
            ],
            partials: [Partials.Channel, Partials.Message]
        });
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.client.once('ready', () => {
            console.log(`Discord: Logged in as ${this.client.user.tag}`);
            console.log(`Discord: Bot is in ${this.client.guilds.cache.size} servers`);
            this.client.guilds.cache.forEach(guild => {
                console.log(`Discord: Server - ${guild.name} (${guild.id})`);
            });
        });

        this.client.on('messageCreate', async (message) => {
            await this.handleMessage(message);
        });
    }

    async handleMessage(message) {
        if (message.author.bot) return;

        // Only respond to allowed users
        const allowedUsers = process.env.DISCORD_ALLOWED_USERS?.split(',') || [];
        if (allowedUsers.length > 0 && !allowedUsers.includes(message.author.id)) {
            return;
        }

        // Respond to DMs or server messages that mention the bot
        const isDM = message.channel.type === ChannelType.DM;
        const isMentioned = message.mentions.has(this.client.user);
        if (!isDM && !isMentioned) return;

        // Strip the bot mention from the message content
        let content = message.content;
        if (isMentioned) {
            content = content.replace(/<@!?\d+>/g, '').trim();
            if (!content) return;
        }

        try {
            console.log(`Discord: Message from ${message.author.username}: ${message.content}`);

            // Show typing indicator while processing
            await message.channel.sendTyping();

            // Check for @mentions of other agents (Trevor, Daisy Bell)
            if (this.agentComm) {
                const { mentions, cleanedMessage } = this.agentComm.detectMentions(content);
                
                if (mentions.length > 0) {
                    console.log(`Discord: Detected mentions: ${mentions.join(', ')}`);
                    
                    // Route message to mentioned agents
                    const conversationId = `discord-${message.id}`;
                    await this.agentComm.routeToAgents({
                        message: cleanedMessage || content,
                        mentions,
                        userId: message.author.id,
                        channelId: message.channel.id,
                        conversationId
                    });

                    // Acknowledge routing
                    const agentNames = mentions.map(id => this.agentComm.getAgentDisplayName(id)).join(' and ');
                    await message.reply(`📨 Right-o! I've sent that message to ${agentNames}. They'll get back to ya soon, mate!`);
                    return;
                }
            }

            // Normal Red Dog response (no agent mentions)
            const result = await this.aiEngine.chat(content, message.author.id);

            // Discord has a 2000 char limit — split if needed
            const reply = result.reply;
            if (reply.length <= 2000) {
                await message.reply(reply);
            } else {
                const chunks = this.splitMessage(reply, 2000);
                for (const chunk of chunks) {
                    await message.channel.send(chunk);
                }
            }
        } catch (error) {
            console.error('Discord: Error handling message:', error.message);
            await message.reply('Sorry, I encountered an error. Please try again.');
        }
    }

    splitMessage(text, maxLength) {
        const chunks = [];
        let remaining = text;
        while (remaining.length > 0) {
            if (remaining.length <= maxLength) {
                chunks.push(remaining);
                break;
            }
            // Try to split at a newline
            let splitIndex = remaining.lastIndexOf('\n', maxLength);
            if (splitIndex === -1 || splitIndex < maxLength / 2) {
                splitIndex = maxLength;
            }
            chunks.push(remaining.substring(0, splitIndex));
            remaining = remaining.substring(splitIndex).trimStart();
        }
        return chunks;
    }

    async start() {
        const token = process.env.DISCORD_BOT_TOKEN;
        if (!token) {
            console.log('Discord: No DISCORD_BOT_TOKEN set, skipping Discord client');
            return;
        }
        await this.client.login(token);
        console.log('Discord: Client started');
    }

    async sendMessage(channelId, content) {
        try {
            const channel = await this.client.channels.fetch(channelId);
            if (channel && channel.isTextBased()) {
                await channel.send(content);
            }
        } catch (error) {
            console.error(`Discord: Failed to send message to channel ${channelId}:`, error.message);
            throw error;
        }
    }

    async stop() {
        if (this.agentComm) {
            this.agentComm.cleanup();
        }
        this.client.destroy();
        console.log('Discord: Client stopped');
    }
}

module.exports = DiscordClient;
