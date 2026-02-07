const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const DatabaseManager = require('./database');

class SmartBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.DirectMessages
            ]
        });
        
        this.db = new DatabaseManager({
            enabled: process.env.DATABASE_ENABLED === 'true',
            connectionString: process.env.DATABASE_CONNECTION_STRING,
            type: process.env.DATABASE_TYPE || 'mssql'
        });

        this.setupEventHandlers();
    }

    async initialize() {
        // Connect to database
        if (this.db.config.enabled) {
            await this.db.connect();
        }

        // Login to Discord
        await this.client.login(process.env.DISCORD_BOT_TOKEN);
        console.log('Smart bot initialized');
    }

    setupEventHandlers() {
        this.client.once('ready', () => {
            console.log(`Logged in as ${this.client.user.tag}!`);
            console.log(`Bot is in ${this.client.guilds.cache.size} servers`);
            this.client.guilds.cache.forEach(guild => {
                console.log(`Server: ${guild.name} (ID: ${guild.id})`);
            });
        });

        this.client.on('messageCreate', async (message) => {
            await this.handleMessage(message);
        });
    }

    async handleMessage(message) {
        // Ignore bot's own messages
        if (message.author.bot) return;

        // Only respond to allowed users
        const allowedUsers = process.env.DISCORD_ALLOWED_USERS?.split(',') || [];
        if (!allowedUsers.includes(message.author.id)) {
            console.log(`User ${message.author.id} not in allowed users`);
            return;
        }

        // Only respond to DMs
        if (message.channel.type !== 1) return;

        try {
            console.log(`Message from ${message.author.username}: ${message.content}`);
            
            const response = await this.processMessage(message.content);
            await message.reply(response);
            
        } catch (error) {
            console.error('Error handling message:', error.message);
            await message.reply('Sorry, I encountered an error. Please try again.');
        }
    }

    async processMessage(content) {
        const lowerContent = content.toLowerCase();

        // Check if it's a database query
        if (this.isDatabaseQuery(lowerContent)) {
            return await this.handleDatabaseQuery(content);
        }

        // Regular AI response
        return await this.getAIResponse(content);
    }

    isDatabaseQuery(content) {
        const dbKeywords = [
            'show tables', 'list tables', 'get tables',
            'table schema', 'describe table', 'table structure',
            'search database', 'find in database', 'query database',
            'execute query', 'run query', 'sql query'
        ];
        
        return dbKeywords.some(keyword => content.includes(keyword));
    }

    async handleDatabaseQuery(content) {
        if (!this.db.isConnected) {
            return "Database is not connected. Please check the configuration.";
        }

        const lowerContent = content.toLowerCase();

        try {
            if (lowerContent.includes('show tables') || lowerContent.includes('list tables') || lowerContent.includes('get tables')) {
                const tables = await this.db.getTables();
                return this.formatTablesResponse(tables);
            }

            if (lowerContent.includes('table schema') || lowerContent.includes('describe table') || lowerContent.includes('table structure')) {
                const tableName = this.extractTableName(content);
                if (!tableName) {
                    return "Please specify a table name. Example: 'show table schema users'";
                }
                const schema = await this.db.getTableSchema(tableName);
                return this.formatSchemaResponse(tableName, schema);
            }

            if (lowerContent.includes('search database') || lowerContent.includes('find in database')) {
                const searchTerm = this.extractSearchTerm(content);
                if (!searchTerm) {
                    return "Please specify a search term. Example: 'search database for user'";
                }
                const results = await this.db.searchTables(searchTerm);
                return this.formatSearchResponse(searchTerm, results);
            }

            // Try to execute custom SQL (with safety checks)
            if (lowerContent.includes('execute query') || lowerContent.includes('run query') || lowerContent.includes('sql query')) {
                return await this.handleCustomQuery(content);
            }

            return "I'm not sure what database operation you want. Try: 'show tables', 'describe table [name]', or 'search database for [term]'";

        } catch (error) {
            console.error('Database query error:', error);
            return `Database error: ${error.message}`;
        }
    }

    async handleCustomQuery(content) {
        // Extract SQL query from message
        const sqlMatch = content.match(/```sql\n([\s\S]*?)\n```/i) || content.match(/select\s+.*/i);
        
        if (!sqlMatch) {
            return "Please provide a SQL query. Example: ```sql\nSELECT * FROM users\n```";
        }

        const sqlQuery = sqlMatch[1] || sqlMatch[0];
        
        // Basic safety checks
        if (this.isUnsafeQuery(sqlQuery)) {
            return "For security reasons, I can only execute SELECT queries.";
        }

        try {
            const results = await this.db.query(sqlQuery);
            return this.formatQueryResults(results);
        } catch (error) {
            return `Query execution failed: ${error.message}`;
        }
    }

    isUnsafeQuery(sql) {
        const unsafeKeywords = ['drop', 'delete', 'update', 'insert', 'truncate', 'alter', 'create'];
        const lowerSql = sql.toLowerCase();
        return unsafeKeywords.some(keyword => lowerSql.includes(keyword));
    }

    extractTableName(content) {
        const match = content.match(/(?:table|schema|describe)\s+(\w+)/i);
        return match ? match[1] : null;
    }

    extractSearchTerm(content) {
        const match = content.match(/(?:search|find)\s+(?:database\s+)?(?:for\s+)?(.+?)(?:\s|$)/i);
        return match ? match[1] : null;
    }

    formatTablesResponse(tables) {
        if (tables.length === 0) {
            return "No tables found in the database.";
        }

        const tableList = tables.map(t => `• ${t.TABLE_NAME}`).join('\n');
        return `Found ${tables.length} tables:\n${tableList}`;
    }

    formatSchemaResponse(tableName, schema) {
        if (schema.length === 0) {
            return `Table '${tableName}' not found or has no columns.`;
        }

        const columns = schema.map(col => 
            `• ${col.COLUMN_NAME} (${col.DATA_TYPE})${col.IS_NULLABLE === 'NO' ? ' NOT NULL' : ''}`
        ).join('\n');

        return `Schema for table '${tableName}':\n${columns}`;
    }

    formatSearchResponse(searchTerm, results) {
        if (results.length === 0) {
            return `No tables or columns found matching '${searchTerm}'.`;
        }

        const grouped = {};
        results.forEach(row => {
            if (!grouped[row.TABLE_NAME]) {
                grouped[row.TABLE_NAME] = [];
            }
            grouped[row.TABLE_NAME].push(row.COLUMN_NAME);
        });

        const response = Object.entries(grouped)
            .map(([table, columns]) => `• ${table}: ${columns.join(', ')}`)
            .join('\n');

        return `Found matches for '${searchTerm}':\n${response}`;
    }

    formatQueryResults(results) {
        if (results.length === 0) {
            return "Query returned no results.";
        }

        if (results.length > 10) {
            return `Query returned ${results.length} rows. Showing first 10:\n${this.formatResultsTable(results.slice(0, 10))}`;
        }

        return `Query returned ${results.length} rows:\n${this.formatResultsTable(results)}`;
    }

    formatResultsTable(results) {
        if (results.length === 0) return '';

        const headers = Object.keys(results[0]);
        const headerRow = headers.join(' | ');
        const separator = headers.map(() => '---').join(' | ');

        const dataRows = results.map(row => 
            headers.map(header => row[header] || 'NULL').join(' | ')
        ).join('\n');

        return `${headerRow}\n${separator}\n${dataRows}`;
    }

    async getAIResponse(content) {
        try {
            const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                model: 'openai/gpt-3.5-turbo',
                messages: [
                    {
                        role: 'user',
                        content: content
                    }
                ]
            }, {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            return response.data.choices[0].message.content;
        } catch (error) {
            console.error('AI response error:', error.message);
            return 'Sorry, I encountered an error getting an AI response.';
        }
    }

    async shutdown() {
        await this.db.disconnect();
        this.client.destroy();
        console.log('Smart bot shut down');
    }
}

module.exports = SmartBot;
