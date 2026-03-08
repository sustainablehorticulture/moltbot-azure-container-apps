# Red Dog Knowledge Graph & Ontology

Red Dog uses a comprehensive knowledge graph and ontology system to understand farm domain concepts, relationships, and enable semantic reasoning for intelligent data queries and insights.

## Overview

The knowledge graph provides:
- **Domain Ontology**: Formal definitions of farm entities, relationships, and properties
- **Semantic Reasoning**: Infer new knowledge from existing relationships
- **Intelligent Queries**: Enhance user queries with domain knowledge
- **Context Awareness**: Understand how farm data relates and connects

## Architecture

### Components

1. **Ontology** (`ontology.json`)
   - Entity classes (Farm, Paddock, Device, Crop, etc.)
   - Relationships (hasPaddock, monitors, irrigates, etc.)
   - Properties (name, location, status, etc.)
   - Inference rules and constraints
   - Taxonomies and hierarchies

2. **Knowledge Graph** (`knowledge-graph.js`)
   - Entity storage and indexing
   - Relationship management
   - Graph traversal and pathfinding
   - Semantic query engine
   - Export capabilities (JSON, Cypher, RDF)

3. **Integration with AI Engine**
   - Ontology summary in system prompts
   - Semantic suggestions for queries
   - Entity context for conversations

## Ontology Structure

### Entity Classes

#### Core Entities

**Farm**
- Description: A farm property with land, operations, and resources
- Properties: name, location, size, farmType, owner
- Relationships: hasPaddock, hasDevice, hasLivestock, hasCrop, employs

**Paddock**
- Description: A field or paddock within a farm
- Properties: name, area, soilType, currentCrop, irrigationType
- Relationships: partOf, hasDevice, growsCrop, adjacentTo

**Device**
- Description: IoT device or sensor
- Properties: deviceId, deviceType, manufacturer, installDate, status
- Relationships: locatedAt, monitors, partOf, communicatesWith

**Crop**
- Description: Agricultural crop or plant
- Properties: species, variety, plantingDate, harvestDate, growthStage
- Relationships: grownIn, requires, produces, susceptibleTo

#### Resource Entities

**Water**
- Parent: Resource
- Properties: source, quality, flowRate, storageCapacity
- Relationships: irrigates, storedIn, suppliedBy

**Energy**
- Parent: Resource
- Properties: energyType, capacity, generation, consumption
- Relationships: powersDevice, generatedBy, storedIn

**Soil**
- Properties: soilType, pH, organicMatter, nutrients, moisture
- Relationships: foundIn, supports, requires

#### Measurement Entities

**Metric**
- Description: Measurement or metric
- Properties: metricType, value, unit, timestamp, source
- Relationships: measuredBy, relatesTo, indicatesHealth

**CarbonMetric**
- Parent: Metric
- Properties: carbonType, sequestration, emissions, netBalance
- Relationships: measuredIn, contributesTo

### Relationships

| Relationship | Domain | Range | Description |
|--------------|--------|-------|-------------|
| hasPaddock | Farm | Paddock | Farm contains paddocks |
| hasDevice | Farm, Paddock | Device | Entity has IoT devices |
| monitors | Device | Crop, Soil, Water, Weather | Device monitors an entity |
| growsCrop | Paddock | Crop | Paddock grows a crop |
| irrigates | Water | Paddock, Crop | Water irrigates land or crops |
| affects | Weather, Disease, Pest | Crop, Livestock, Soil | Entity affects another |
| requires | Crop, Livestock | Water, Energy, Resource | Entity requires a resource |
| produces | Crop, Livestock, Farm | Resource, Metric | Entity produces something |
| manages | Person | Farm, Paddock | Person manages an entity |

### Taxonomies

**Device Types**
```
Device
├── Sensor
│   ├── SoilMoistureSensor
│   ├── TemperatureSensor
│   ├── RainfallSensor
│   ├── pHSensor
│   └── NDVISensor
├── Actuator
│   ├── IrrigationValve
│   ├── Pump
│   └── VentilationFan
├── Gateway
│   ├── LoRaWANGateway
│   ├── CellularGateway
│   └── WiFiGateway
└── Camera
    ├── SecurityCamera
    ├── CropCamera
    └── LivestockCamera
```

**Crop Types**
```
Crop
├── Cereal (Wheat, Barley, Oats, Corn)
├── Legume (Soybean, Peas, Lentils, Chickpeas)
├── Vegetable (Tomato, Lettuce, Carrot, Potato)
├── Fruit (Apple, Orange, Grape, Strawberry)
└── Pasture (Ryegrass, Clover, Lucerne)
```

**Metric Types**
```
Metric
├── Environmental (Temperature, Humidity, Rainfall, WindSpeed)
├── Soil (SoilMoisture, SoilpH, SoilNutrients, SoilTemperature)
├── Plant (NDVI, GrowthStage, LeafArea, YieldEstimate)
├── Resource (WaterUsage, EnergyConsumption, FuelUsage)
└── Carbon (Sequestration, Emissions, NetBalance)
```

## Inference Rules

### Transitive Location
```
IF Device is located at Paddock
AND Paddock is part of Farm
THEN Device is located at Farm
```

### Crop Water Requirement
```
IF Crop requires Water
AND Water irrigates Paddock
AND Crop grows in Paddock
THEN Water requirement is met
```

### Device Monitoring
```
IF Sensor measures Metric
AND Metric indicates health of Crop
THEN Sensor monitors Crop
```

## Usage Examples

### Adding Entities

```javascript
// Add a farm
kg.addEntity('grassgum-farm', 'Farm', {
    name: 'Grassgum Farm',
    location: '-37.8136,144.9631',
    size: 500,
    farmType: 'mixed'
});

// Add a paddock
kg.addEntity('paddock-north', 'Paddock', {
    name: 'North Paddock',
    area: 50,
    soilType: 'loam',
    currentCrop: 'wheat'
});

// Add relationship
kg.addRelationship('grassgum-farm', 'hasPaddock', 'paddock-north');
```

### Querying the Graph

```javascript
// Find all devices
const devices = kg.findEntitiesByType('Device');

// Find entities by property
const activeDevices = kg.findEntitiesByProperty('status', 'active');

// Get related entities
const paddocks = kg.getRelatedEntities('grassgum-farm', 'hasPaddock');

// Traverse relationships
const allDevices = kg.traverse('grassgum-farm', 'hasDevice', 3);

// Find path between entities
const path = kg.findPath('sensor-001', 'grassgum-farm');
```

### Semantic Queries

```javascript
// Query pattern matching
const results = kg.query({
    type: 'Device',
    property: 'status',
    value: 'active'
});

// Get semantic suggestions
const suggestions = kg.getSemanticSuggestions('soil moisture in north paddock');
// Returns: entities, relationships, properties related to the query
```

### Applying Inference

```javascript
// Apply inference rules to derive new knowledge
kg.applyInferenceRules();
// Automatically infers transitive relationships and other patterns
```

## Integration with Red Dog

### AI Context Enhancement

The ontology is automatically included in Red Dog's system prompt:

```
**Farm Domain Ontology:**
Knowledge graph ontology for farm operations, sustainability, and data management

**Entity Types:**
- Farm: A farm property with land, operations, and resources
- Paddock: A field or paddock within a farm
- Device: IoT device or sensor
...

**Key Relationships:**
- hasPaddock: Farm contains paddocks
- monitors: Device monitors an entity
...
```

### Semantic Query Enhancement

When users ask questions, Red Dog:
1. Detects entities and relationships in the query
2. Provides semantic suggestions
3. Enhances the query with domain knowledge
4. Uses ontology to understand context

Example:
```
User: "What's the soil moisture in the north paddock?"

Red Dog detects:
- Entity: Paddock (north paddock)
- Metric: SoilMoisture
- Relationship: Sensor measures SoilMoisture, located at Paddock

Enhanced query uses knowledge of:
- Which sensors measure soil moisture
- Which sensors are in north paddock
- Relationship between sensors and paddocks
```

## Export Formats

### JSON
```javascript
const data = kg.exportGraph('json');
// Returns: { entities: [...], relationships: [...] }
```

### Neo4j Cypher
```javascript
const cypher = kg.exportGraph('cypher');
// Returns Cypher CREATE statements for Neo4j import
```

### RDF/Turtle
```javascript
const rdf = kg.exportGraph('rdf');
// Returns RDF triples in Turtle format
```

## Integration with Apache Jena Fuseki

The knowledge graph can be exported to RDF and loaded into Apache Jena Fuseki (available in your AADX stack at `http://localhost:3030`):

```bash
# Export to RDF
curl http://localhost:18789/api/knowledge-graph/export?format=rdf > farm-ontology.ttl

# Load into Fuseki
curl -X POST http://localhost:3030/ds/data \
  -H "Content-Type: text/turtle" \
  --data-binary @farm-ontology.ttl
```

Then query with SPARQL:
```sparql
PREFIX ag: <https://agenticag.com/ontology#>

SELECT ?paddock ?crop
WHERE {
  ?farm a ag:Farm ;
        ag:hasPaddock ?paddock .
  ?paddock ag:growsCrop ?crop .
}
```

## Future Enhancements

1. **SPARQL Query Support**
   - Full SPARQL 1.1 query language
   - Federated queries across multiple graphs

2. **Reasoning Engine**
   - OWL reasoning for complex inferences
   - Rule-based reasoning with SWRL

3. **Graph Visualization**
   - Interactive graph visualization
   - Relationship explorer
   - Entity browser

4. **Temporal Knowledge**
   - Time-based relationships
   - Historical state tracking
   - Temporal queries

5. **Probabilistic Reasoning**
   - Uncertainty handling
   - Bayesian inference
   - Confidence scores

6. **External Ontology Integration**
   - AgriOnt (agriculture ontology)
   - SOSA/SSN (sensor ontology)
   - PROV-O (provenance ontology)

7. **Machine Learning Integration**
   - Graph embeddings
   - Link prediction
   - Entity classification

## Benefits

1. **Semantic Understanding**: Red Dog understands farm concepts and relationships
2. **Intelligent Queries**: Queries are enhanced with domain knowledge
3. **Inference**: Derive new knowledge from existing data
4. **Interoperability**: Standard formats (RDF, OWL) for data exchange
5. **Scalability**: Graph structure handles complex relationships
6. **Flexibility**: Easy to extend with new entities and relationships

## API Reference

### KnowledgeGraph Class

```javascript
const kg = new KnowledgeGraph();

// Entity management
kg.addEntity(id, type, properties)
kg.getEntity(id)
kg.findEntitiesByType(type)
kg.findEntitiesByProperty(property, value)

// Relationship management
kg.addRelationship(subjectId, relationshipType, objectId)
kg.getRelatedEntities(entityId, relationshipType)

// Graph traversal
kg.traverse(startEntityId, relationshipType, maxDepth)
kg.findPath(startId, endId, maxDepth)

// Querying
kg.query(pattern)
kg.getSemanticSuggestions(userQuery)

// Reasoning
kg.applyInferenceRules()
kg.isSubclassOf(type, parentType)

// Export
kg.exportGraph(format) // 'json', 'cypher', 'rdf'
kg.getOntologySummary()

// Utility
kg.getStatus()
kg.clear()
```

## Status Monitoring

Check knowledge graph status:

```javascript
const status = kg.getStatus();
console.log(status);
// {
//   ontologyLoaded: true,
//   ontologyVersion: "1.0.0",
//   entityCount: 150,
//   relationshipCount: 320,
//   entityTypes: 17,
//   relationshipTypes: 15
// }
```

---

**Note:** The knowledge graph is a foundational component that enables Red Dog to understand and reason about farm data in a semantically meaningful way. It bridges the gap between raw data and actionable insights.
