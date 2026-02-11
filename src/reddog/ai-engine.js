const axios = require('axios');
const path = require('path');
const fs = require('fs');

class AIEngine {
    constructor(db) {
        this.db = db;
        this.schemaCache = null;
        this.model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
        this.apiKey = process.env.OPENROUTER_API_KEY;
        this.conversations = new Map(); // userId -> message history
        this.maxHistory = parseInt(process.env.CONVERSATION_HISTORY_LENGTH) || 20;
        this.persona = this.loadPersona();
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

    getHistory(userId) {
        if (!this.conversations.has(userId)) {
            this.conversations.set(userId, []);
        }
        return this.conversations.get(userId);
    }

    addToHistory(userId, role, content) {
        const history = this.getHistory(userId);
        history.push({ role, content });
        // Keep only the last N messages
        while (history.length > this.maxHistory) {
            history.shift();
        }
    }

    clearHistory(userId) {
        this.conversations.delete(userId);
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
- IMPORTANT: Only query the specific database the user asks about. If a database has no tables, tell the user honestly — do NOT pull data from a different database instead.
- If a database is marked as having no tables, do NOT generate a query for it. Just explain that the database is empty.

If the question does NOT need a database query, just respond normally in plain text with your Red Dog personality.

Available database schema:`;

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
                this.clearHistory(userId);
                return { reply: "No worries, mate — slate's clean! What's next?" };
            }

            const systemPrompt = this.buildSystemPrompt();
            const history = this.getHistory(userId);

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
                        this.addToHistory(userId, 'user', userMessage);
                        this.addToHistory(userId, 'assistant', reply);
                        return {
                            reply,
                            query: queryPlan.sql,
                            database: queryPlan.database,
                            error: 'unsafe_query'
                        };
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
                    this.addToHistory(userId, 'user', userMessage);
                    this.addToHistory(userId, 'assistant', summaryReply);

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
                    this.addToHistory(userId, 'user', userMessage);
                    this.addToHistory(userId, 'assistant', errReply);
                    return {
                        reply: errReply,
                        error: queryError.message
                    };
                }
            }

            // No query needed — return the AI's direct response
            this.addToHistory(userId, 'user', userMessage);
            this.addToHistory(userId, 'assistant', aiReply);
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
