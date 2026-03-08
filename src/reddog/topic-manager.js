/**
 * Red Dog Topic Manager
 * 
 * Manages topic-based conversation context and database query routing
 * for Agentic Ag dashboard integration
 */

const fs = require('fs');
const path = require('path');

class TopicManager {
    constructor() {
        this.topics = [];
        this.topicIndex = new Map();
        this.keywordIndex = new Map();
        this.loadTopics();
    }

    /**
     * Load topics from configuration file
     */
    loadTopics() {
        try {
            const topicsPath = path.join(__dirname, 'topics.json');
            const topicsData = JSON.parse(fs.readFileSync(topicsPath, 'utf8'));
            this.topics = topicsData.topics;
            
            // Build indexes for fast lookup
            this.buildIndexes();
            
            console.log(`[Topics] Loaded ${this.topics.length} main topics`);
        } catch (error) {
            console.error('[Topics] Failed to load topics:', error.message);
            this.topics = [];
        }
    }

    /**
     * Build indexes for topic and keyword lookup
     */
    buildIndexes() {
        this.topicIndex.clear();
        this.keywordIndex.clear();

        for (const topic of this.topics) {
            // Index main topic
            this.topicIndex.set(topic.id, topic);
            
            // Index main topic keywords
            if (topic.keywords) {
                for (const keyword of topic.keywords) {
                    this.addToKeywordIndex(keyword.toLowerCase(), topic.id);
                }
            }

            // Index subtopics
            if (topic.subtopics) {
                for (const subtopic of topic.subtopics) {
                    const subtopicId = `${topic.id}/${subtopic.id}`;
                    this.topicIndex.set(subtopicId, {
                        ...subtopic,
                        parentId: topic.id,
                        parentName: topic.name
                    });

                    // Index subtopic keywords
                    if (subtopic.keywords) {
                        for (const keyword of subtopic.keywords) {
                            this.addToKeywordIndex(keyword.toLowerCase(), subtopicId);
                        }
                    }
                }
            }
        }
    }

    /**
     * Add keyword to index
     */
    addToKeywordIndex(keyword, topicId) {
        if (!this.keywordIndex.has(keyword)) {
            this.keywordIndex.set(keyword, []);
        }
        this.keywordIndex.get(keyword).push(topicId);
    }

    /**
     * Detect topics in a user message
     */
    detectTopics(message) {
        const detectedTopics = new Set();
        const messageLower = message.toLowerCase();
        const words = messageLower.split(/\s+/);

        // Check for keyword matches
        for (const [keyword, topicIds] of this.keywordIndex) {
            if (messageLower.includes(keyword)) {
                for (const topicId of topicIds) {
                    detectedTopics.add(topicId);
                }
            }
        }

        // Check for multi-word phrases
        for (const word of words) {
            if (this.keywordIndex.has(word)) {
                for (const topicId of this.keywordIndex.get(word)) {
                    detectedTopics.add(topicId);
                }
            }
        }

        return Array.from(detectedTopics).map(id => this.topicIndex.get(id));
    }

    /**
     * Get topic by ID
     */
    getTopic(topicId) {
        return this.topicIndex.get(topicId);
    }

    /**
     * Get all main topics
     */
    getMainTopics() {
        return this.topics;
    }

    /**
     * Get subtopics for a main topic
     */
    getSubtopics(mainTopicId) {
        const topic = this.topicIndex.get(mainTopicId);
        return topic?.subtopics || [];
    }

    /**
     * Get related database tables for detected topics
     */
    getRelatedTables(detectedTopics) {
        const tables = new Set();
        
        for (const topic of detectedTopics) {
            if (topic.relatedTables) {
                for (const table of topic.relatedTables) {
                    tables.add(table);
                }
            }
        }

        return Array.from(tables);
    }

    /**
     * Build topic context for AI prompt
     */
    buildTopicContext(detectedTopics) {
        if (detectedTopics.length === 0) {
            return '';
        }

        let context = '\n\n**Detected Topics:**\n';
        
        for (const topic of detectedTopics) {
            const topicName = topic.parentName 
                ? `${topic.parentName} > ${topic.name}` 
                : topic.name;
            
            context += `- **${topicName}**: ${topic.description}\n`;
            
            if (topic.relatedTables && topic.relatedTables.length > 0) {
                context += `  Relevant tables: ${topic.relatedTables.join(', ')}\n`;
            }
        }

        return context;
    }

    /**
     * Get topic-specific query hints
     */
    getQueryHints(detectedTopics) {
        const hints = [];

        for (const topic of detectedTopics) {
            if (topic.relatedTables && topic.relatedTables.length > 0) {
                hints.push({
                    topic: topic.name,
                    tables: topic.relatedTables,
                    description: topic.description
                });
            }
        }

        return hints;
    }

    /**
     * Format topics for display
     */
    formatTopicsForDisplay() {
        let output = '# Agentic Ag Topics\n\n';

        for (const topic of this.topics) {
            output += `## ${topic.name}\n`;
            output += `${topic.description}\n\n`;

            if (topic.subtopics && topic.subtopics.length > 0) {
                output += '**Subtopics:**\n';
                for (const subtopic of topic.subtopics) {
                    output += `- **${subtopic.name}**: ${subtopic.description}\n`;
                }
                output += '\n';
            }
        }

        return output;
    }

    /**
     * Get topic summary for AI system prompt
     */
    getTopicSummary() {
        const summary = {
            mainTopics: this.topics.map(t => ({
                name: t.name,
                description: t.description,
                subtopics: t.subtopics?.map(st => st.name) || []
            })),
            totalTopics: this.topics.length,
            totalSubtopics: this.topics.reduce((sum, t) => sum + (t.subtopics?.length || 0), 0)
        };

        return summary;
    }

    /**
     * Build enhanced system prompt with topic awareness
     */
    buildTopicAwarePrompt() {
        let prompt = '\n\n**Farm Data Topics:**\n';
        prompt += 'You have expertise in the following areas of farm operations:\n\n';

        for (const topic of this.topics) {
            prompt += `**${topic.name}**\n`;
            
            if (topic.subtopics && topic.subtopics.length > 0) {
                for (const subtopic of topic.subtopics) {
                    prompt += `  - ${subtopic.name}: ${subtopic.description}\n`;
                }
            } else {
                prompt += `  ${topic.description}\n`;
            }
            prompt += '\n';
        }

        prompt += 'When users ask about these topics, provide relevant insights from the farm data.\n';
        
        return prompt;
    }

    /**
     * Check if a message is asking about available topics
     */
    isTopicListRequest(message) {
        const messageLower = message.toLowerCase();
        const triggers = [
            'what topics',
            'what can you help with',
            'what areas',
            'what do you know about',
            'list topics',
            'show topics',
            'available topics',
            'what categories'
        ];

        return triggers.some(trigger => messageLower.includes(trigger));
    }

    /**
     * Get status information
     */
    getStatus() {
        return {
            topicsLoaded: this.topics.length,
            subtopicsLoaded: this.topics.reduce((sum, t) => sum + (t.subtopics?.length || 0), 0),
            keywordsIndexed: this.keywordIndex.size,
            topicsIndexed: this.topicIndex.size
        };
    }
}

module.exports = TopicManager;
