const axios = require('axios');
const path = require('path');
const fs = require('fs');

class AIEngine {
    constructor(db, billing = null, blobStorage = null, serviceBus = null, approvalManager = null) {
        this.db = db;
        this.billing = billing;
        this.blobStorage = blobStorage;
        this.serviceBus = serviceBus;
        this.approvalManager = approvalManager;
        this.schemaCache = null;
        this.model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
        this.apiKey = process.env.OPENROUTER_API_KEY;
        this.conversations = new Map(); // userId -> message history
        this.maxHistory = parseInt(process.env.CONVERSATION_HISTORY_LENGTH) || 20;
        this.persona = this.loadPersona();
        this.dbContext = this.loadDatabaseContext();
        this.farmId = process.env.FARM_ID || 'grassgum'; // Default farm identifier
        this.persistentChatEnabled = process.env.PERSISTENT_CHAT_ENABLED !== 'false'; // Enabled by default
        this.autoSaveInterval = parseInt(process.env.CHAT_AUTOSAVE_INTERVAL) || 5; // Save every 5 messages
        this.messagesSinceLastSave = new Map(); // Track messages since last save per user
        
        // Initialize approval commands if approval manager is available
        if (this.approvalManager) {
            const ApprovalCommands = require('./approval-commands');
            this.approvalCommands = new ApprovalCommands({
                approvalManager: this.approvalManager,
                blobStorage: this.blobStorage,
                serviceBus: this.serviceBus
            });
        }
    }

    loadDatabaseContext() {
        try {
            const ctxPath = path.join(__dirname, 'database-context.json');
            const raw = fs.readFileSync(ctxPath, 'utf-8');
            const ctx = JSON.parse(raw);
            console.log('Database context loaded');
            return ctx;
        } catch (error) {
            console.error('Failed to load database context:', error.message);
            return null;
        }
    }

    loadPersona() {
        try {
            const personaPath = path.join(__dirname, 'persona.json');
            const raw = fs.readFileSync(personaPath, 'utf-8');
            const persona = JSON.parse(raw);
            console.log(`Persona loaded: ${persona.name}`);
            return persona;
        } catch (error) {
            console.error('Failed to load persona, using defaults:', error.message);
            return {
                name: 'Red Dog',
                personality: 'You are Red Dog, a helpful farm data assistant for Zerosum Ag.',
                summaryStyle: 'Summarise database results clearly and concisely.',
                errorMessage: 'Sorry, something went wrong. Please try again.',
                noDataMessage: 'No results found.',
                unsafeQueryMessage: 'I can only run SELECT queries for safety reasons.'
            };
        }
    }

    async getHistory(userId) {
        if (!this.conversations.has(userId)) {
            // Load chat history from blob storage on first access
            await this.loadChatHistoryForUser(userId);
        }
        return this.conversations.get(userId);
    }

    /**
     * Load chat history from blob storage for a user
     */
    async loadChatHistoryForUser(userId) {
        if (!this.persistentChatEnabled || !this.blobStorage || !this.blobStorage.isConnected) {
            this.conversations.set(userId, []);
            return;
        }

        try {
            const messages = await this.blobStorage.loadChatHistory({
                farmId: this.farmId,
                userId,
                maxMessages: this.maxHistory
            });
            
            this.conversations.set(userId, messages);
            this.messagesSinceLastSave.set(userId, 0);
            
            if (messages.length > 0) {
                console.log(`[AI] Loaded ${messages.length} messages from chat history for user ${userId}`);
            }
        } catch (err) {
            console.error(`[AI] Failed to load chat history: ${err.message}`);
            this.conversations.set(userId, []);
        }
    }

    /**
     * Save chat history to blob storage
     */
    async saveChatHistoryForUser(userId) {
        if (!this.persistentChatEnabled || !this.blobStorage || !this.blobStorage.isConnected) {
            return;
        }

        try {
            const messages = this.conversations.get(userId) || [];
            if (messages.length === 0) {
                return;
            }

            await this.blobStorage.saveChatHistory({
                farmId: this.farmId,
                userId,
                messages,
                metadata: {
                    sessionId: `session-${userId}-${Date.now()}`,
                    model: this.model,
                    savedAt: new Date().toISOString()
                }
            });
            
            this.messagesSinceLastSave.set(userId, 0);
            console.log(`[AI] Saved ${messages.length} messages to chat history for user ${userId}`);
        } catch (err) {
            console.error(`[AI] Failed to save chat history: ${err.message}`);
        }
    }

    async addToHistory(userId, role, content) {
        const history = await this.getHistory(userId);
        history.push({ role, content });
        
        // Keep only the last N messages
        while (history.length > this.maxHistory) {
            history.shift();
        }
        
        // Track messages since last save
        const count = (this.messagesSinceLastSave.get(userId) || 0) + 1;
        this.messagesSinceLastSave.set(userId, count);
        
        // Auto-save if we've reached the interval
        if (count >= this.autoSaveInterval) {
            await this.saveChatHistoryForUser(userId);
        }
    }

    async clearHistory(userId) {
        // Save before clearing
        await this.saveChatHistoryForUser(userId);
        this.conversations.delete(userId);
        this.messagesSinceLastSave.delete(userId);
    }

    async cacheSchema() {
        if (!this.db || !this.db.isConnected) return;
        try {
            const schemaLines = [];
            for (const dbName of Object.keys(this.db.pools)) {
                schemaLines.push(`\n## Database: ${dbName}`);
                const tables = await this.db.getTables(dbName);
                if (tables.length === 0) {
                    schemaLines.push(`(This database has NO tables and NO data. Do not query it.)`);
                } else {
                    for (const table of tables) {
                        const cols = await this.db.getTableSchema(table.TABLE_NAME, dbName);
                        const colList = cols.map(c => `${c.COLUMN_NAME} (${c.DATA_TYPE})`).join(', ');
                        schemaLines.push(`- ${table.TABLE_NAME}: ${colList}`);
                    }
                }
            }
            this.schemaCache = schemaLines.join('\n');
            console.log('Database schema cached for AI context');
        } catch (error) {
            console.error('Failed to cache DB schema:', error.message);
            this.schemaCache = null;
        }
    }

    getSchema() {
        return this.schemaCache;
    }

    buildSystemPrompt() {
        let prompt = `${this.persona.personality}

When the user asks a question that needs data, respond with a JSON block containing the SQL query to run:
{"action": "query", "database": "database_name", "sql": "SELECT ..."}

Rules for SQL queries:
- Only generate SELECT queries, never INSERT/UPDATE/DELETE/DROP
- Always specify which database to query using the "database" field
- Use TOP 50 to limit large result sets
- Be precise with column names based on the schema below
- If a database is marked as having no tables, do NOT generate a query for it. Just explain that the database is empty.

If the question does NOT need a database query, just respond normally in plain text with your Red Dog personality.`;

        // Add database relationship context
        if (this.dbContext) {
            prompt += `\n\n=== DATABASE RELATIONSHIPS ===\n${this.dbContext.overview}\n`;
            for (const [dbName, info] of Object.entries(this.dbContext.databases)) {
                prompt += `\n**${dbName}** (${info.role}): ${info.description}`;
                if (info.keyTables) {
                    for (const [table, desc] of Object.entries(info.keyTables)) {
                        prompt += `\n  - ${table}: ${desc}`;
                    }
                }
            }
            if (this.dbContext.queryGuidance) {
                prompt += `\n\n=== QUERY GUIDANCE ===`;
                for (const guidance of this.dbContext.queryGuidance) {
                    prompt += `\n- ${guidance}`;
                }
            }
        }

        prompt += `\n\n=== FULL DATABASE SCHEMA ===`;

        if (this.schemaCache) {
            prompt += `\n${this.schemaCache}`;
        } else {
            prompt += '\n(No schema available - databases may not be connected)';
        }

        return prompt;
    }

    isUnsafeQuery(sql) {
        const unsafeKeywords = ['drop', 'delete', 'update', 'insert', 'truncate', 'alter', 'create'];
        const lowerSql = sql.toLowerCase();
        return unsafeKeywords.some(keyword => lowerSql.includes(keyword));
    }

    async chat(userMessage, userId = 'default') {
        try {
            // Handle special commands
            if (userMessage.toLowerCase().trim() === 'clear' || userMessage.toLowerCase().trim() === 'reset') {
                await this.clearHistory(userId);
                return { reply: "No worries, mate — slate's clean! What's next?" };
            }

            // Handle approval commands
            if (this.approvalCommands) {
                const approvalCommand = this.approvalCommands.parseCommand(userMessage);
                if (approvalCommand) {
                    const result = await this.approvalCommands.execute(approvalCommand, userId);
                    return { reply: result.message, ...result };
                }
            }

            const systemPrompt = this.buildSystemPrompt();
            const history = await this.getHistory(userId);

            const messages = [
                { role: 'system', content: systemPrompt },
                ...history,
                { role: 'user', content: userMessage }
            ];

            // Step 1: Ask AI what to do
            const firstResponse = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                model: this.model,
                messages
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            const aiReply = firstResponse.data.choices[0].message.content;

            // Step 2: Check if AI wants to run a query
            const queryMatch = aiReply.match(/\{[\s\S]*?"action"\s*:\s*"query"[\s\S]*?\}/);
            if (queryMatch && this.db && this.db.isConnected) {
                try {
                    const queryPlan = JSON.parse(queryMatch[0]);

                    if (this.isUnsafeQuery(queryPlan.sql)) {
                        const reply = this.persona.unsafeQueryMessage;
                        await this.addToHistory(userId, 'user', userMessage);
                        await this.addToHistory(userId, 'assistant', reply);
                        return {
                            reply,
                            query: queryPlan.sql,
                            database: queryPlan.database,
                            error: 'unsafe_query'
                        };
                    }
                    
                    // Check credits for query operation (2 credits)
                    if (this.billing) {
                        const creditCheck = await this.billing.checkCreditsBeforeOperation(userId, 'farm_query');
                        if (!creditCheck.allowed) {
                            let reply;
                            if (creditCheck.reason === 'Account inactive') {
                                reply = `G'day mate! Looks like you don't have an active account yet. You'll need to set up billing to use Red Dog's database queries. Contact your admin to get started!`;
                            } else if (creditCheck.reason === 'Insufficient credits') {
                                reply = `Sorry mate, I need ${creditCheck.required} credits to run that query but you only have ${creditCheck.available}. ${creditCheck.suggestion}`;
                            } else {
                                reply = `Can't run that query right now: ${creditCheck.reason}`;
                            }
                            await this.addToHistory(userId, 'user', userMessage);
                            await this.addToHistory(userId, 'assistant', reply);
                            return {
                                reply,
                                query: queryPlan.sql,
                                database: queryPlan.database,
                                error: 'insufficient_credits',
                                required: creditCheck.required,
                                available: creditCheck.available,
                                reason: creditCheck.reason
                            };
                        }
                    }

                    console.log(`AI query on '${queryPlan.database}': ${queryPlan.sql}`);
                    const results = await this.db.query(queryPlan.sql, [], queryPlan.database);

                    // Step 3: Feed results back to AI for a natural language summary
                    const resultText = results.length === 0
                        ? 'Query returned no results.'
                        : JSON.stringify(results.slice(0, 50), null, 2);

                    const summaryResponse = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                        model: this.model,
                        messages: [
                            { role: 'system', content: this.persona.summaryStyle },
                            { role: 'user', content: userMessage },
                            { role: 'assistant', content: `I ran this query: ${queryPlan.sql}` },
                            { role: 'user', content: `Here are the results:\n${resultText}\n\nPlease summarise these results for me.` }
                        ]
                    }, {
                        headers: {
                            'Authorization': `Bearer ${this.apiKey}`,
                            'Content-Type': 'application/json'
                        }
                    });

                    const summaryReply = summaryResponse.data.choices[0].message.content;
                    await this.addToHistory(userId, 'user', userMessage);
                    await this.addToHistory(userId, 'assistant', summaryReply);

                    // Consume credits for successful query
                    if (this.billing) {
                        try {
                            await this.billing.consumeCredits(userId, 'farm_query', 2, {
                                operation: 'farm_query',
                                database: queryPlan.database,
                                rowCount: results.length
                            });
                        } catch (billingError) {
                            console.error('Failed to consume credits:', billingError.message);
                            // Don't fail the response, just log the error
                        }
                    }

                    return {
                        reply: summaryReply,
                        query: queryPlan.sql,
                        database: queryPlan.database,
                        rowCount: results.length,
                        data: results.slice(0, 50)
                    };
                } catch (queryError) {
                    console.error('AI-driven query failed:', queryError.message);
                    const errReply = `Bit of a hiccup fetching that data, mate: ${queryError.message}`;
                    await this.addToHistory(userId, 'user', userMessage);
                    await this.addToHistory(userId, 'assistant', errReply);
                    return {
                        reply: errReply,
                        error: queryError.message
                    };
                }
            }

            // No query needed — return the AI's direct response
            await this.addToHistory(userId, 'user', userMessage);
            await this.addToHistory(userId, 'assistant', aiReply);
            return { reply: aiReply };
        } catch (error) {
            console.error('AI response error:', error.message);
            return {
                reply: this.persona.errorMessage,
                error: error.message
            };
        }
    }
}

module.exports = AIEngine;
