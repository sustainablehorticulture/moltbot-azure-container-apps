/**
 * Red Dog Knowledge Graph Manager
 * 
 * Manages farm domain ontology and knowledge graph for semantic reasoning
 * and intelligent query enhancement
 */

const fs = require('fs');
const path = require('path');

class KnowledgeGraph {
    constructor() {
        this.ontology = null;
        this.graph = new Map(); // entity ID -> entity data
        this.relationships = new Map(); // relationship type -> array of [subject, object]
        this.inverseIndex = new Map(); // property value -> entity IDs
        this.loadOntology();
    }

    /**
     * Load ontology from configuration file
     */
    loadOntology() {
        try {
            const ontologyPath = path.join(__dirname, 'ontology.json');
            this.ontology = JSON.parse(fs.readFileSync(ontologyPath, 'utf8'));
            console.log(`[KnowledgeGraph] Loaded ontology: ${this.ontology.metadata.name} v${this.ontology.metadata.version}`);
        } catch (error) {
            console.error('[KnowledgeGraph] Failed to load ontology:', error.message);
            this.ontology = null;
        }
    }

    /**
     * Add an entity to the knowledge graph
     */
    addEntity(id, type, properties = {}) {
        if (!this.ontology || !this.ontology.classes[type]) {
            throw new Error(`Unknown entity type: ${type}`);
        }

        const entity = {
            id,
            type,
            properties,
            relationships: {}
        };

        this.graph.set(id, entity);

        // Build inverse index for property values
        for (const [prop, value] of Object.entries(properties)) {
            const key = `${prop}:${value}`;
            if (!this.inverseIndex.has(key)) {
                this.inverseIndex.set(key, new Set());
            }
            this.inverseIndex.get(key).add(id);
        }

        return entity;
    }

    /**
     * Add a relationship between entities
     */
    addRelationship(subjectId, relationshipType, objectId) {
        const subject = this.graph.get(subjectId);
        const object = this.graph.get(objectId);

        if (!subject || !object) {
            throw new Error('Subject or object entity not found');
        }

        if (!this.ontology.relationships[relationshipType]) {
            throw new Error(`Unknown relationship type: ${relationshipType}`);
        }

        // Add to subject's relationships
        if (!subject.relationships[relationshipType]) {
            subject.relationships[relationshipType] = [];
        }
        subject.relationships[relationshipType].push(objectId);

        // Add to relationship index
        const key = relationshipType;
        if (!this.relationships.has(key)) {
            this.relationships.set(key, []);
        }
        this.relationships.get(key).push([subjectId, objectId]);

        // Add inverse relationship if defined
        const relDef = this.ontology.relationships[relationshipType];
        if (relDef.inverse) {
            if (!object.relationships[relDef.inverse]) {
                object.relationships[relDef.inverse] = [];
            }
            object.relationships[relDef.inverse].push(subjectId);
        }
    }

    /**
     * Get entity by ID
     */
    getEntity(id) {
        return this.graph.get(id);
    }

    /**
     * Find entities by type
     */
    findEntitiesByType(type) {
        const entities = [];
        for (const [id, entity] of this.graph) {
            if (entity.type === type) {
                entities.push(entity);
            }
        }
        return entities;
    }

    /**
     * Find entities by property value
     */
    findEntitiesByProperty(property, value) {
        const key = `${property}:${value}`;
        const ids = this.inverseIndex.get(key);
        if (!ids) return [];
        
        return Array.from(ids).map(id => this.graph.get(id));
    }

    /**
     * Get related entities
     */
    getRelatedEntities(entityId, relationshipType) {
        const entity = this.graph.get(entityId);
        if (!entity) return [];

        const relatedIds = entity.relationships[relationshipType] || [];
        return relatedIds.map(id => this.graph.get(id));
    }

    /**
     * Traverse relationships (depth-first)
     */
    traverse(startEntityId, relationshipType, maxDepth = 3) {
        const visited = new Set();
        const results = [];

        const dfs = (entityId, depth) => {
            if (depth > maxDepth || visited.has(entityId)) return;
            
            visited.add(entityId);
            const entity = this.graph.get(entityId);
            if (!entity) return;

            results.push(entity);

            const related = entity.relationships[relationshipType] || [];
            for (const relatedId of related) {
                dfs(relatedId, depth + 1);
            }
        };

        dfs(startEntityId, 0);
        return results;
    }

    /**
     * Find path between two entities
     */
    findPath(startId, endId, maxDepth = 5) {
        const queue = [[startId, [startId]]];
        const visited = new Set([startId]);

        while (queue.length > 0) {
            const [currentId, path] = queue.shift();

            if (currentId === endId) {
                return path.map(id => this.graph.get(id));
            }

            if (path.length > maxDepth) continue;

            const entity = this.graph.get(currentId);
            if (!entity) continue;

            for (const [relType, relatedIds] of Object.entries(entity.relationships)) {
                for (const relatedId of relatedIds) {
                    if (!visited.has(relatedId)) {
                        visited.add(relatedId);
                        queue.push([relatedId, [...path, relatedId]]);
                    }
                }
            }
        }

        return null; // No path found
    }

    /**
     * Apply inference rules
     */
    applyInferenceRules() {
        if (!this.ontology || !this.ontology.rules || !this.ontology.rules.inference) {
            return;
        }

        let inferencesApplied = 0;

        for (const rule of this.ontology.rules.inference) {
            // Simple pattern matching for transitive location
            if (rule.name === 'TransitiveLocation') {
                for (const [deviceId, device] of this.graph) {
                    if (device.type === 'Device' || this.isSubclassOf(device.type, 'Device')) {
                        const paddocks = device.relationships['locatedAt'] || [];
                        for (const paddockId of paddocks) {
                            const paddock = this.graph.get(paddockId);
                            if (paddock && paddock.type === 'Paddock') {
                                const farms = paddock.relationships['partOf'] || [];
                                for (const farmId of farms) {
                                    // Add inferred relationship
                                    if (!device.relationships['locatedAt'].includes(farmId)) {
                                        device.relationships['locatedAt'].push(farmId);
                                        inferencesApplied++;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        if (inferencesApplied > 0) {
            console.log(`[KnowledgeGraph] Applied ${inferencesApplied} inferences`);
        }
    }

    /**
     * Check if type is subclass of parent
     */
    isSubclassOf(type, parentType) {
        const classDef = this.ontology?.classes[type];
        if (!classDef) return false;
        
        if (classDef.parent === parentType) return true;
        if (classDef.parent) {
            return this.isSubclassOf(classDef.parent, parentType);
        }
        
        return false;
    }

    /**
     * Get entity context for AI
     */
    getEntityContext(entityId) {
        const entity = this.graph.get(entityId);
        if (!entity) return null;

        const context = {
            entity: entity,
            type: this.ontology.classes[entity.type],
            related: {}
        };

        // Get all related entities
        for (const [relType, relatedIds] of Object.entries(entity.relationships)) {
            context.related[relType] = relatedIds.map(id => {
                const relEntity = this.graph.get(id);
                return {
                    id: relEntity.id,
                    type: relEntity.type,
                    properties: relEntity.properties
                };
            });
        }

        return context;
    }

    /**
     * Query the knowledge graph using SPARQL-like syntax
     */
    query(pattern) {
        // Simple pattern matching: { type: 'Device', property: 'status', value: 'active' }
        const results = [];

        for (const [id, entity] of this.graph) {
            let matches = true;

            if (pattern.type && entity.type !== pattern.type) {
                matches = false;
            }

            if (pattern.property && pattern.value) {
                if (entity.properties[pattern.property] !== pattern.value) {
                    matches = false;
                }
            }

            if (pattern.relationship) {
                const hasRelationship = entity.relationships[pattern.relationship.type]?.includes(pattern.relationship.target);
                if (!hasRelationship) {
                    matches = false;
                }
            }

            if (matches) {
                results.push(entity);
            }
        }

        return results;
    }

    /**
     * Get semantic suggestions for a query
     */
    getSemanticSuggestions(userQuery) {
        const suggestions = {
            entities: [],
            relationships: [],
            properties: []
        };

        const queryLower = userQuery.toLowerCase();

        // Match entity types
        for (const [className, classDef] of Object.entries(this.ontology.classes)) {
            if (queryLower.includes(className.toLowerCase())) {
                suggestions.entities.push({
                    type: className,
                    description: classDef.description,
                    properties: classDef.properties
                });
            }
        }

        // Match relationships
        for (const [relName, relDef] of Object.entries(this.ontology.relationships)) {
            if (queryLower.includes(relName.toLowerCase())) {
                suggestions.relationships.push({
                    type: relName,
                    description: relDef.description,
                    domain: relDef.domain,
                    range: relDef.range
                });
            }
        }

        return suggestions;
    }

    /**
     * Export graph to various formats
     */
    exportGraph(format = 'json') {
        if (format === 'json') {
            return {
                entities: Array.from(this.graph.values()),
                relationships: Array.from(this.relationships.entries())
            };
        }

        if (format === 'cypher') {
            // Neo4j Cypher format
            const statements = [];
            
            // Create nodes
            for (const entity of this.graph.values()) {
                const props = Object.entries(entity.properties)
                    .map(([k, v]) => `${k}: "${v}"`)
                    .join(', ');
                statements.push(`CREATE (n:${entity.type} {id: "${entity.id}", ${props}})`);
            }

            // Create relationships
            for (const [relType, pairs] of this.relationships) {
                for (const [subj, obj] of pairs) {
                    statements.push(`MATCH (a {id: "${subj}"}), (b {id: "${obj}"}) CREATE (a)-[:${relType}]->(b)`);
                }
            }

            return statements.join(';\n');
        }

        if (format === 'rdf') {
            // RDF/Turtle format
            const ns = this.ontology.metadata.namespace;
            let rdf = `@prefix ag: <${ns}> .\n\n`;

            for (const entity of this.graph.values()) {
                rdf += `ag:${entity.id} a ag:${entity.type} ;\n`;
                for (const [prop, value] of Object.entries(entity.properties)) {
                    rdf += `  ag:${prop} "${value}" ;\n`;
                }
                rdf += '  .\n\n';
            }

            return rdf;
        }

        return null;
    }

    /**
     * Get ontology summary for AI context
     */
    getOntologySummary() {
        if (!this.ontology) return '';

        let summary = `\n\n**Farm Domain Ontology:**\n`;
        summary += `${this.ontology.metadata.description}\n\n`;

        summary += `**Entity Types:**\n`;
        for (const [className, classDef] of Object.entries(this.ontology.classes)) {
            summary += `- **${className}**: ${classDef.description}\n`;
        }

        summary += `\n**Key Relationships:**\n`;
        for (const [relName, relDef] of Object.entries(this.ontology.relationships)) {
            summary += `- **${relName}**: ${relDef.description}\n`;
        }

        return summary;
    }

    /**
     * Get status information
     */
    getStatus() {
        return {
            ontologyLoaded: !!this.ontology,
            ontologyVersion: this.ontology?.metadata.version,
            entityCount: this.graph.size,
            relationshipCount: Array.from(this.relationships.values()).reduce((sum, arr) => sum + arr.length, 0),
            entityTypes: this.ontology ? Object.keys(this.ontology.classes).length : 0,
            relationshipTypes: this.ontology ? Object.keys(this.ontology.relationships).length : 0
        };
    }

    /**
     * Clear the graph
     */
    clear() {
        this.graph.clear();
        this.relationships.clear();
        this.inverseIndex.clear();
    }
}

module.exports = KnowledgeGraph;
