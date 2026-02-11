const axios = require('axios');

class AIEngine {
    constructor(db) {
        this.db = db;
        this.schemaCache = null;
        this.model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
        this.apiKey = process.env.OPENROUTER_API_KEY;
    }

    async cacheSchema() {
        if (!this.db || !this.db.isConnected) return;
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

    async chat(userMessage, conversationHistory = []) {
        try {
            const systemPrompt = this.buildSystemPrompt();

            const messages = [
                { role: 'system', content: systemPrompt },
                ...conversationHistory,
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
                        return {
                            reply: 'I can only run SELECT queries for safety reasons.',
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
                            { role: 'system', content: 'You are Red Dog, a helpful farm data assistant. Summarise the following database query results in a clear, conversational way. Use bullet points or tables where appropriate. Keep it concise.' },
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

                    return {
                        reply: summaryResponse.data.choices[0].message.content,
                        query: queryPlan.sql,
                        database: queryPlan.database,
                        rowCount: results.length,
                        data: results.slice(0, 50)
                    };
                } catch (queryError) {
                    console.error('AI-driven query failed:', queryError.message);
                    return {
                        reply: `I tried to query the database but got an error: ${queryError.message}`,
                        error: queryError.message
                    };
                }
            }

            // No query needed — return the AI's direct response
            return { reply: aiReply };
        } catch (error) {
            console.error('AI response error:', error.message);
            return {
                reply: 'Sorry, I encountered an error getting an AI response.',
                error: error.message
            };
        }
    }
}

module.exports = AIEngine;
