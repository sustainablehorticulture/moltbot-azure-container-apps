const axios = require('axios');
const path = require('path');
const fs = require('fs');
const TopicManager = require('./topic-manager');
const KnowledgeGraph = require('./knowledge-graph');

class AIEngine {
    constructor(db, billing = null, blobStorage = null, serviceBus = null, approvalManager = null, deviceCommands = null, sensorCommands = null) {
        this.db = db;
        this.billing = billing;
        this.blobStorage = blobStorage;
        this.serviceBus = serviceBus;
        this.approvalManager = approvalManager;
        this.deviceCommands = deviceCommands;
        this.sensorCommands = sensorCommands;
        this.schemaCache = null;
        this.model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
        this.apiKey = process.env.OPENROUTER_API_KEY;
        this.conversations = new Map(); // userId -> message history
        this.maxHistory = parseInt(process.env.CONVERSATION_HISTORY_LENGTH) || 20;
        this.persona = this.loadPersona();
        this.dbContext = this.loadDatabaseContext();
        this.topicManager = new TopicManager();
        this.knowledgeGraph = new KnowledgeGraph();
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

If the question does NOT need a database query, just respond normally in plain text with your Red Dog personality.

When the user asks to CONTROL a device (turn on/off a relay, open/close a switch, check device status), respond with a JSON block:
{"action": "device_control", "device_type": "<type>", "device_id": "<id>", ...}

Device types and required fields:
- lorawan_relay: device_id, relay_id (1 or 2), state (true=ON, false=OFF)
- lorawan_digital: device_id, pin_id (1-4), state (true=HIGH, false=LOW), mode (optional: "output")
- wattwatchers_switch: device_id, switch_id (e.g. "S1"), state ("open" or "closed"), site_id (optional)
- lorawan_status: device_id (get device status)
- lorawan_devices: (list all LoRaWAN devices)
- wattwatchers_status: device_id (get switch status)
- wattwatchers_energy: device_id (get latest energy data)

IMPORTANT: Never emit device_control JSON for queries — only for actual control commands or status reads.

When the user asks for LIVE or REAL-TIME sensor data from an external provider (Selectronic, weather stations, soil sensors, energy meters, WattWatchers energy data), respond with:
{"action": "sensor_api", "farm": "<farm name>", "provider": "<provider>", "type": "<type>"}

Sensor API fields:
- farm: exact farm name from Site Overview table (e.g. "Grassgum Farm") or "all" for all farms
- provider: lowercase provider name e.g. "selectronic", "weather", "soil", "energy", "lorawan" — omit for all providers
- type: "latest" (default), "history" (requires hours field), "device" (requires device_id), "list_farms"
- hours: number of hours for history (default 24)
- device_id: specific device ID for device type

Use database queries (SQL) for averages, trends, historical analysis from stored data.
Use sensor_api for LIVE real-time readings directly from sensor APIs.

When the user asks to post on social media, run an ad, or message the team, respond with:
{"action": "social_action", "platform": "<platform>", "type": "<type>", "content": "<suggested content>"}

Social action fields:
- platform: "instagram", "facebook", "linkedin", "whatsapp"
- type: "post" (instagram/facebook/linkedin), "ad" (facebook), "message" (whatsapp)
- content: draft caption, post text, ad copy, or message text — write this as Red Dog would, farm-themed and punchy
- recipients: (whatsapp only) list of recipient numbers if known, otherwise omit

Always draft compelling content based on any recent farm data you have. If posting, suggest a suitable image description too.

When the user asks about courses, education, learning, or wants to start a lesson, respond with:
{"action": "course_action", "type": "<type>", "courseId": "<id>", "background": "<profile>"}

Course action types:
- "list" — show available courses (no courseId needed)
- "start" — begin a course session (requires courseId, background: beginner|farmer|student|technical|professional|sprouts)
- "question" — get the next question in the current session
- "teacher_prompts" — get teacher prompt suggestions for a course (requires courseId)

Student backgrounds: beginner, farmer, student, technical, professional, sprouts (kids)
Available course IDs: dashboard-intro, farmyard-energy, farmyard-soil-climate, ai-agents, silo-management, sustainable-farming, precision-agriculture, off-grid-energy, sprouts, farmg8-marketplace

Always detect the user's likely background from context and suggest the most relevant course.
`;

        // Inject available sensor providers dynamically from registry
        if (this.sensorCommands && this.sensorCommands.buildProviderPrompt) {
            prompt += this.sensorCommands.buildProviderPrompt();
        }

        // Add topic awareness
        if (this.topicManager) {
            prompt += this.topicManager.buildTopicAwarePrompt();
        }

        // Add knowledge graph ontology
        if (this.knowledgeGraph) {
            prompt += this.knowledgeGraph.getOntologySummary();
        }

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

    _getCourseTeacher() {
        if (!this._courseTeacher) {
            const CourseTeacher = require('./course-teacher');
            this._courseTeacher = new CourseTeacher({ apiKey: this.apiKey, model: this.model });
        }
        return this._courseTeacher;
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

            // Handle device command confirmations (yes/no replies)
            if (this.deviceCommands && this.deviceCommands.isConfirmation(userMessage)) {
                const confirmation = await this.deviceCommands.resolveConfirmation(userId, userMessage);
                if (confirmation.reply !== null) {
                    await this.addToHistory(userId, 'user', userMessage);
                    await this.addToHistory(userId, 'assistant', confirmation.reply);
                    return { reply: confirmation.reply };
                }
            }

            // Handle topic list request
            if (this.topicManager && this.topicManager.isTopicListRequest(userMessage)) {
                const topicList = this.topicManager.formatTopicsForDisplay();
                return { reply: topicList };
            }

            // Handle approval commands
            if (this.approvalCommands) {
                const approvalCommand = this.approvalCommands.parseCommand(userMessage);
                if (approvalCommand) {
                    const result = await this.approvalCommands.execute(approvalCommand, userId);
                    return { reply: result.message, ...result };
                }
            }

            // Detect topics in the message
            let detectedTopics = [];
            let topicContext = '';
            if (this.topicManager) {
                detectedTopics = this.topicManager.detectTopics(userMessage);
                if (detectedTopics.length > 0) {
                    topicContext = this.topicManager.buildTopicContext(detectedTopics);
                    console.log(`[AI] Detected topics: ${detectedTopics.map(t => t.name).join(', ')}`);
                }
            }

            const systemPrompt = this.buildSystemPrompt();
            const history = await this.getHistory(userId);

            // Add topic context to user message if topics detected
            const enhancedMessage = topicContext 
                ? `${userMessage}${topicContext}`
                : userMessage;

            const messages = [
                { role: 'system', content: systemPrompt },
                ...history,
                { role: 'user', content: enhancedMessage }
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

            // Step 2a: Check if AI wants to fetch live sensor data
            if (this.sensorCommands) {
                const sensorAction = this.sensorCommands.parseSensorAction(aiReply);
                if (sensorAction) {
                    const result = await this.sensorCommands.executeAction(sensorAction);
                    await this.addToHistory(userId, 'user', userMessage);
                    await this.addToHistory(userId, 'assistant', result.reply);
                    return { reply: result.reply, sensorAction };
                }
            }

            // Step 2b: Check if AI wants to control a device
            if (this.deviceCommands) {
                const deviceAction = this.deviceCommands.parseDeviceAction(aiReply);
                if (deviceAction) {
                    // Read-only status queries execute immediately, control commands need confirmation
                    if (this.deviceCommands.isReadOnlyAction(deviceAction)) {
                        const result = await this.deviceCommands.executeCommand(deviceAction);
                        await this.addToHistory(userId, 'user', userMessage);
                        await this.addToHistory(userId, 'assistant', result.reply);
                        return { reply: result.reply, deviceAction };
                    } else {
                        const confirmMsg = await this.deviceCommands.requestConfirmation(deviceAction, userId);
                        await this.addToHistory(userId, 'user', userMessage);
                        await this.addToHistory(userId, 'assistant', confirmMsg);
                        return { reply: confirmMsg, deviceAction, awaitingConfirmation: true };
                    }
                }
            }

            // Step 2c: Check if AI wants to post to social media
            const socialMatch = aiReply.match(/\{[\s\S]*?"action"\s*:\s*"social_action"[\s\S]*?\}/);
            if (socialMatch) {
                try {
                    const socialAction = JSON.parse(socialMatch[0]);
                    const platformLabels = { instagram: '📸 Instagram', facebook: '📣 Facebook', linkedin: '💼 LinkedIn', whatsapp: '💬 WhatsApp' };
                    const label = platformLabels[socialAction.platform] || socialAction.platform;
                    const reply = `${label} ${socialAction.type === 'ad' ? 'Ad' : socialAction.type === 'message' ? 'Message' : 'Post'} — here's what I'd say, mate:\n\n${socialAction.content}${socialAction.imageDescription ? `\n\n📷 _Suggested image: ${socialAction.imageDescription}_` : ''}`;
                    await this.addToHistory(userId, 'user', userMessage);
                    await this.addToHistory(userId, 'assistant', reply);
                    return { reply, socialAction };
                } catch (_) {}
            }

            // Step 2d: Check if AI wants to run a course action
            const courseMatch = aiReply.match(/\{[\s\S]*?"action"\s*:\s*"course_action"[\s\S]*?\}/);
            if (courseMatch) {
                try {
                    const courseAction = JSON.parse(courseMatch[0]);
                    let reply = '';
                    const courseTeacher = this._getCourseTeacher?.();
                    if (courseTeacher) {
                        if (courseAction.type === 'list') {
                            const courses = courseTeacher.listCourses();
                            reply = `🎓 **Available Courses on Agentic Ag**\n\n` +
                                courses.map(c => `**${c.title}** (${c.level}, ${c.duration}${c.price != null ? `, $${c.price || 'Free'}` : ''})\n_${c.tagline}_\nID: \`${c.id}\``).join('\n\n');
                            reply += `\n\nTell me which one interests ya and I'll get the lesson started, mate! 🐾`;
                        } else if (courseAction.type === 'start' && courseAction.courseId) {
                            const result = courseTeacher.startSession(userId, courseAction.courseId, courseAction.background || 'beginner');
                            reply = `🎓 Righto! Starting **${result.course.title}** for you.\n_Student profile: ${result.profile.label}_\n\n${result.profile.description}\n\nSay **"next question"** to get your first question, or **"teacher prompts"** if you're running a class! 🐾`;
                        } else if (courseAction.type === 'question') {
                            const q = await courseTeacher.generateQuestion(userId);
                            const opts = q.options ? `\n\n${q.options.join('\n')}` : '';
                            reply = `🐾 _${q.voicePrompt}_\n\n**${q.question}**${opts}\n\n_Hint: ${q.hint}_`;
                        } else if (courseAction.type === 'teacher_prompts' && courseAction.courseId) {
                            const result = await courseTeacher.getTeacherPrompts(courseAction.courseId, courseAction.background || 'farmer');
                            reply = `👨‍🏫 **Teacher Prompts — ${courseAction.courseId}**\n\n` +
                                (result.prompts || []).map((p, i) => `**${i + 1}. [${p.type}]** ${p.prompt}\n_Purpose: ${p.purpose}_`).join('\n\n');
                        }
                    }
                    if (!reply) reply = aiReply;
                    await this.addToHistory(userId, 'user', userMessage);
                    await this.addToHistory(userId, 'assistant', reply);
                    return { reply, courseAction };
                } catch (_) {}
            }

            // Step 2e: Check if AI wants to run a query
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
