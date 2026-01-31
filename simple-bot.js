const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ]
});

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const ALLOWED_USERS = process.env.DISCORD_ALLOWED_USERS?.split(',') || ["1466940509753966652"];

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log(`Bot is in ${client.guilds.cache.size} servers`);
    client.guilds.cache.forEach(guild => {
        console.log(`Server: ${guild.name} (ID: ${guild.id})`);
    });
});

client.on('messageCreate', async (message) => {
    console.log(`=== MESSAGE RECEIVED ===`);
    console.log(`From: ${message.author.username} (ID: ${message.author.id})`);
    console.log(`Content: ${message.content}`);
    console.log(`Channel: ${message.channel.name} (Type: ${message.channel.type})`);
    console.log(`Guild: ${message.guild?.name || 'DM'}`);
    console.log(`========================`);
    
    // Ignore bot's own messages
    if (message.author.bot) {
        console.log('Ignoring bot message');
        return;
    }
    
    // Only respond to allowed users
    if (!ALLOWED_USERS.includes(message.author.id)) {
        console.log(`User ${message.author.id} not in allowed users: ${ALLOWED_USERS}`);
        console.log('BUT RESPONDING ANYWAY FOR DEBUGGING');
        // return; // Comment out for debugging
    }
    
    // Only respond to DMs
    if (message.channel.type !== 1) {
        console.log(`Not a DM channel (type: ${message.channel.type})`);
        console.log('BUT RESPONDING ANYWAY FOR DEBUGGING');
        // return; // Comment out for debugging
    }
    
    try {
        console.log(`Message from ${message.author.username}: ${message.content}`);
        
        // Call OpenRouter API
        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model: 'openai/gpt-3.5-turbo',
            messages: [
                {
                    role: 'user',
                    content: message.content
                }
            ]
        }, {
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        const reply = response.data.choices[0].message.content;
        console.log(`Reply: ${reply}`);
        
        await message.reply(reply);
        
    } catch (error) {
        console.error('Error:', error.message);
        await message.reply('Sorry, I encountered an error. Please try again.');
    }
});

client.login(BOT_TOKEN);
