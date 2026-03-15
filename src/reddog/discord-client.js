const { Client, GatewayIntentBits, Partials, ChannelType, SlashCommandBuilder } = require('discord.js');
const fetch = require('node-fetch');

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
        this.registerSlashCommands();
    }

    setupEventHandlers() {
        this.client.once('ready', async () => {
            console.log(`Discord: Logged in as ${this.client.user.tag}`);
            console.log(`Discord: Bot is in ${this.client.guilds.cache.size} servers`);
            this.client.guilds.cache.forEach(guild => {
                console.log(`Discord: Server - ${guild.name} (${guild.id})`);
            });
            await this.deploySlashCommands();
        });

        this.client.on('messageCreate', async (message) => {
            await this.handleMessage(message);
        });

        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isChatInputCommand()) return;
            await this.handleSlashCommand(interaction);
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

    registerSlashCommands() {
        this.commands = [
            new SlashCommandBuilder()
                .setName('ndvi')
                .setDescription('Get latest NDVI for a farm location')
                .addNumberOption(option =>
                    option.setName('lat')
                        .setDescription('Latitude')
                        .setRequired(true))
                .addNumberOption(option =>
                    option.setName('lng')
                        .setDescription('Longitude')
                        .setRequired(true))
                .addNumberOption(option =>
                    option.setName('buffer')
                        .setDescription('Buffer radius in km (default 0.5)')
                        .setRequired(false)),
            new SlashCommandBuilder()
                .setName('launch-burro')
                .setDescription('Launch the automated electric burro unit')
                .addStringOption(option =>
                    option.setName('robot')
                        .setDescription('Robot serial number')
                        .setRequired(true))
                .addNumberOption(option =>
                    option.setName('lat')
                        .setDescription('Launch latitude')
                        .setRequired(true))
                .addNumberOption(option =>
                    option.setName('lng')
                        .setDescription('Launch longitude')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('mission')
                        .setDescription('Mission name (default ndvi-guided-patrol)')
                        .setRequired(false))
        ];
    }

    async deploySlashCommands() {
        const commands = this.commands.map(cmd => cmd.toJSON());
        for (const guild of this.client.guilds.cache.values()) {
            try {
                await guild.commands.set(commands);
                console.log(`Discord: Registered ${commands.length} slash commands for guild ${guild.name}`);
            } catch (error) {
                console.error(`Discord: Failed to register commands for guild ${guild.name}:`, error);
            }
        }
    }

    async handleSlashCommand(interaction) {
        const { commandName } = interaction;
        try {
            if (commandName === 'ndvi') {
                await interaction.deferReply();
                const lat = interaction.options.getNumber('lat');
                const lng = interaction.options.getNumber('lng');
                const buffer = interaction.options.getNumber('buffer') || 0.5;

                const ndviUrl = `${process.env.API_BASE_URL || 'https://clawdbot.happybush-1b235e08.australiasoutheast.azurecontainerapps.io'}/api/farm/ndvi/latest?lat=${lat}&lng=${lng}&bufferKm=${buffer}`;
                const res = await fetch(ndviUrl);
                const data = await res.json();

                if (!res.ok) {
                    await interaction.followUp({ content: `❌ Failed to fetch NDVI: ${data.error}` });
                    return;
                }

                const embed = {
                    title: '🌱 Latest NDVI (Sentinel‑2)',
                    url: data.ndviUrl,
                    fields: [
                        { name: '📍 Location', value: `${data.lat}, ${data.lng}`, inline: true },
                        { name: '📐 Buffer', value: `${data.bufferKm} km`, inline: true },
                        { name: '📅 Capture', value: new Date(data.datetime).toLocaleDateString(), inline: true },
                        { name: '☁️ Cloud cover', value: `${(data.cloudCover * 100).toFixed(1)}%`, inline: true },
                        { name: '🔗 NDVI Image', value: `[View](${data.ndviUrl})`, inline: true }
                    ],
                    image: { url: data.ndviUrl },
                    timestamp: new Date().toISOString()
                };
                await interaction.followUp({ embeds: [embed] });
            } else if (commandName === 'launch-burro') {
                await interaction.deferReply();
                const robot = interaction.options.getString('robot');
                const lat = interaction.options.getNumber('lat');
                const lng = interaction.options.getNumber('lng');
                const mission = interaction.options.getString('mission') || 'ndvi-guided-patrol';

                // First fetch NDVI to attach context
                let ndviContext = null;
                try {
                    const ndviUrl = `${process.env.API_BASE_URL || 'https://clawdbot.happybush-1b235e08.australiasoutheast.azurecontainerapps.io'}/api/farm/ndvi/latest?lat=${lat}&lng=${lng}&bufferKm=0.5`;
                    const ndviRes = await fetch(ndviUrl);
                    if (ndviRes.ok) {
                        const ndviData = await ndviRes.json();
                        ndviContext = { tileId: ndviData.tileId, datetime: ndviData.datetime, ndviUrl: ndviData.ndviUrl };
                    }
                } catch (_) {}

                const launchUrl = `${process.env.API_BASE_URL || 'https://clawdbot.happybush-1b235e08.australiasoutheast.azurecontainerapps.io'}/api/farm/burro/launch`;
                const launchRes = await fetch(launchUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ robotSerialNumber: robot, lat, lng, missionName: mission, ndviContext })
                });
                const launchData = await launchRes.json();

                if (!launchRes.ok) {
                    await interaction.followUp({ content: `❌ Failed to launch burro: ${launchData.error}` });
                    return;
                }

                const embed = {
                    title: '🤖 Burro Launched',
                    fields: [
                        { name: '🔧 Robot', value: launchData.robotSerialNumber, inline: true },
                        { name: '📍 Launch Point', value: `${launchData.launchPoint.lat}, ${launchData.launchPoint.lng}`, inline: true },
                        { name: '🎯 Mission', value: launchData.missionName, inline: true },
                        { name: '🆔 Mission ID', value: launchData.missionId, inline: true },
                        { name: '🌱 NDVI Context', value: ndviContext ? 'Attached' : 'None', inline: true },
                        { name: '📅 Launched', value: new Date(launchData.timestamp).toLocaleString(), inline: true }
                    ],
                    color: 0x00ff00,
                    timestamp: new Date().toISOString()
                };
                await interaction.followUp({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Discord: Slash command error:', error);
            await interaction.followUp({ content: '❌ Something went wrong while processing the command.' });
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
