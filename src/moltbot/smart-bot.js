require('dotenv').config();
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
            databases: process.env.DATABASE_NAMES ? process.env.DATABASE_NAMES.split(',').map(s => s.trim()) : [],
            type: process.env.DATABASE_TYPE || 'mssql'
        });

        this.dbSchemaCache = null;
        this.setupEventHandlers();
    }

    async initialize() {
        // Connect to database
        if (this.db.config.enabled) {
            await this.db.connect();
            await this.cacheDbSchema();
        }

        // Login to Discord
        await this.client.login(process.env.DISCORD_BOT_TOKEN);
        console.log('Smart bot initialized');
    }

    async cacheDbSchema() {
        if (!this.db.isConnected) return;
        try {
            const schemaLines = [];
            for (const dbName of Object.keys(this.db.pools)) {
                schemaLines.push(`\n## Database: ${dbName}`);
                const tables = await this.db.getTables(dbName);
                for (const table of tables) {
                    const cols = await this.db.getTableSchema(table.TABLE_NAME, dbName);
                    const colList = cols.map(c => `${c.COLUMN_NAME} (${c.DATA_TYPE})`).join(', ');
                    schemaLines.push(`- ${table.TABLE_NAME}: ${colList}`);
                }
            }
            this.dbSchemaCache = schemaLines.join('\n');
            console.log('Database schema cached for AI context');
        } catch (error) {
            console.error('Failed to cache DB schema:', error.message);
            this.dbSchemaCache = null;
        }
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
            'show tables', 'list tables', 'get tables', 'show all tables',
            'table schema', 'describe table', 'table structure',
            'search database', 'find in database', 'query database',
            'search all databases', 'search all',
            'execute query', 'run query', 'sql query',
            'use database', 'switch database', 'list databases', 'show databases'
        ];
        
        return dbKeywords.some(keyword => content.includes(keyword));
    }

    async handleDatabaseQuery(content) {
        if (!this.db.isConnected) {
            return "Database is not connected. Please check the configuration.";
        }

        const lowerContent = content.toLowerCase();

        try {
            // Database management commands
            if (lowerContent.includes('list databases') || lowerContent.includes('show databases')) {
                const dbs = this.db.listConnectedDatabases();
                const dbList = dbs.map(d => `${d.active ? '> ' : '  '}${d.name}${d.active ? ' (active)' : ''}`).join('\n');
                return `Connected databases:\n${dbList}\n\nUse "use database [name]" to switch.`;
            }

            if (lowerContent.includes('use database') || lowerContent.includes('switch database')) {
                const dbName = this.extractDatabaseName(content);
                if (!dbName) {
                    return "Please specify a database name. Example: 'use database MyDB'";
                }
                return this.db.useDatabase(dbName);
            }

            // Show tables across all databases
            if (lowerContent.includes('show all tables')) {
                const allTables = await this.db.getTablesAllDatabases();
                return this.formatAllTablesResponse(allTables);
            }

            if (lowerContent.includes('show tables') || lowerContent.includes('list tables') || lowerContent.includes('get tables')) {
                const tables = await this.db.getTables();
                return this.formatTablesResponse(tables, this.db.activeDb);
            }

            if (lowerContent.includes('table schema') || lowerContent.includes('describe table') || lowerContent.includes('table structure')) {
                const tableName = this.extractTableName(content);
                if (!tableName) {
                    return "Please specify a table name. Example: 'show table schema users'";
                }
                const schema = await this.db.getTableSchema(tableName);
                return this.formatSchemaResponse(tableName, schema);
            }

            // Search across all databases
            if (lowerContent.includes('search all databases') || lowerContent.includes('search all')) {
                const searchTerm = this.extractSearchTerm(content);
                if (!searchTerm) {
                    return "Please specify a search term. Example: 'search all databases for user'";
                }
                const allResults = await this.db.searchAllDatabases(searchTerm);
                return this.formatAllSearchResponse(searchTerm, allResults);
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

            return "I'm not sure what database operation you want. Try: 'list databases', 'use database [name]', 'show tables', 'show all tables', 'describe table [name]', 'search database for [term]', or 'search all databases for [term]'";

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

    extractDatabaseName(content) {
        const match = content.match(/(?:use|switch)\s+database\s+(\S+)/i);
        return match ? match[1] : null;
    }

    extractSearchTerm(content) {
        const match = content.match(/(?:search|find)\s+(?:database\s+)?(?:for\s+)?(.+?)(?:\s|$)/i);
        return match ? match[1] : null;
    }

    formatTablesResponse(tables, dbName = null) {
        if (tables.length === 0) {
            return "No tables found in the database.";
        }

        const header = dbName ? `Tables in '${dbName}'` : 'Tables';
        const tableList = tables.map(t => `• ${t.TABLE_NAME}`).join('\n');
        return `${header} (${tables.length}):\n${tableList}`;
    }

    formatAllTablesResponse(allTables) {
        const sections = Object.entries(allTables).map(([dbName, tables]) => {
            if (tables.error) {
                return `**${dbName}**: Error - ${tables.error}`;
            }
            if (tables.length === 0) {
                return `**${dbName}**: No tables found`;
            }
            const tableList = tables.map(t => `  • ${t.TABLE_NAME}`).join('\n');
            return `**${dbName}** (${tables.length} tables):\n${tableList}`;
        });
        return sections.join('\n\n');
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

    formatAllSearchResponse(searchTerm, allResults) {
        const sections = Object.entries(allResults).map(([dbName, results]) => {
            if (results.error) {
                return `**${dbName}**: Error - ${results.error}`;
            }
            if (results.length === 0) {
                return `**${dbName}**: No matches`;
            }
            const grouped = {};
            results.forEach(row => {
                if (!grouped[row.TABLE_NAME]) grouped[row.TABLE_NAME] = [];
                grouped[row.TABLE_NAME].push(row.COLUMN_NAME);
            });
            const lines = Object.entries(grouped)
                .map(([table, columns]) => `  • ${table}: ${columns.join(', ')}`)
                .join('\n');
            return `**${dbName}**:\n${lines}`;
        });
        return `Search results for '${searchTerm}' across all databases:\n\n${sections.join('\n\n')}`;
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

    buildSystemPrompt() {
        let prompt = `You are Red Dog, a helpful farm data assistant for Zerosum Ag. You have direct access to SQL Server databases and can query them to answer questions.

When the user asks a question that needs data, respond with a JSON block containing the SQL query to run:
{"action": "query", "database": "database_name", "sql": "SELECT ..."}

Rules for SQL queries:
- Only generate SELECT queries, never INSERT/UPDATE/DELETE/DROP
- Always specify which database to query using the "database" field
- Use TOP 50 to limit large result sets
- Be precise with column names based on the schema below

If the question does NOT need a database query, just respond normally in plain text.

Available database schema:`;

        if (this.dbSchemaCache) {
            prompt += `\n${this.dbSchemaCache}`;
        } else {
            prompt += '\n(No schema available - databases may not be connected)';
        }

        return prompt;
    }

    async getAIResponse(content) {
        try {
            const systemPrompt = this.buildSystemPrompt();

            // Step 1: Ask AI what to do
            const firstResponse = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: content }
                ]
            }, {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            const aiReply = firstResponse.data.choices[0].message.content;

            // Step 2: Check if AI wants to run a query
            const queryMatch = aiReply.match(/\{[\s\S]*?"action"\s*:\s*"query"[\s\S]*?\}/)
            if (queryMatch && this.db.isConnected) {
                try {
                    const queryPlan = JSON.parse(queryMatch[0]);

                    if (this.isUnsafeQuery(queryPlan.sql)) {
                        return 'I can only run SELECT queries for safety reasons.';
                    }

                    console.log(`AI query on '${queryPlan.database}': ${queryPlan.sql}`);
                    const results = await this.db.query(queryPlan.sql, [], queryPlan.database);

                    // Step 3: Feed results back to AI for a natural language summary
                    const resultText = results.length === 0
                        ? 'Query returned no results.'
                        : JSON.stringify(results.slice(0, 50), null, 2);

                    const summaryResponse = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                        model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
                        messages: [
                            { role: 'system', content: 'You are Red Dog, a helpful farm data assistant. Summarise the following database query results in a clear, conversational way. Use bullet points or tables where appropriate. Keep it concise.' },
                            { role: 'user', content: content },
                            { role: 'assistant', content: `I ran this query: ${queryPlan.sql}` },
                            { role: 'user', content: `Here are the results:\n${resultText}\n\nPlease summarise these results for me.` }
                        ]
                    }, {
                        headers: {
                            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                            'Content-Type': 'application/json'
                        }
                    });

                    return summaryResponse.data.choices[0].message.content;
                } catch (queryError) {
                    console.error('AI-driven query failed:', queryError.message);
                    return `I tried to query the database but got an error: ${queryError.message}`;
                }
            }

            // No query needed — return the AI's direct response
            return aiReply;
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
