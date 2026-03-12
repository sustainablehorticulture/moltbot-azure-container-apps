# LoRaWAN Control Functions

Multi-site LoRaWAN device control Azure Functions with privacy isolation.

## 🚀 Features

- **Multi-Site Support**: Isolated device management per farm site
- **LT2222 Device Control**: Relay and digital I/O control
- **Privacy Isolation**: Complete data separation between sites
- **Device Management**: Register, configure, and monitor devices
- **Batch Operations**: Control multiple devices simultaneously
- **Scheduling**: Automated control based on time schedules
- **Real-time Monitoring**: Track device status and telemetry

## 📁 Structure

```
lorawan-control/
├── lorawan/
│   ├── function.json
│   └── index.js
├── services/
│   ├── lt2222Service.js
│   └── deviceManager.js
├── host.json
├── package.json
└── README.md
```

## 🌐 API Endpoints

### Device Management
```
GET    /api/sites/{siteId}/devices              # List all devices for site
GET    /api/sites/{siteId}/devices/{deviceId}   # Get specific device
POST   /api/sites/{siteId}/devices              # Create new device
PUT    /api/sites/{siteId}/devices/{deviceId}   # Update device
DELETE /api/sites/{siteId}/devices/{deviceId}   # Delete device
```

### Relay Control
```
GET  /api/sites/{siteId}/relays/{deviceId}      # Get relay status
POST /api/sites/{siteId}/relays/{deviceId}      # Control relay
```

### Digital I/O Control
```
GET  /api/sites/{siteId}/digital/{deviceId}     # Get digital I/O status
POST /api/sites/{siteId}/digital/{deviceId}     # Control digital I/O
```

### Batch Operations
```
POST /api/sites/{siteId}/batch                  # Batch device control
```

### Device Status
```
GET /api/sites/{siteId}/status/{deviceId}       # Get device status
GET /api/sites/{siteId}/status                  # Get all device status
```

### Scheduling
```
GET    /api/sites/{siteId}/schedules            # List schedules
POST   /api/sites/{siteId}/schedules            # Create schedule
GET    /api/sites/{siteId}/schedules/{id}       # Get specific schedule
PUT    /api/sites/{siteId}/schedules/{id}       # Update schedule
DELETE /api/sites/{siteId}/schedules/{id}       # Delete schedule
```

### Uplink Processing
```
POST /api/sites/{siteId}/uplink                  # Process device uplink
```

## 🔧 Usage Examples

### Control Relay for Site A
```javascript
POST /api/sites/farm-a/relays/LT2222-FA-001
{
  "relayId": 1,
  "state": true
}
```

### Batch Control for Site B
```javascript
POST /api/sites/farm-b/batch
{
  "operations": [
    {
      "type": "relay",
      "deviceId": "LT2222-FB-001",
      "relayId": 1,
      "state": true
    },
    {
      "type": "digital",
      "deviceId": "LT2222-FB-001",
      "pinId": 3,
      "state": false,
      "mode": "output"
    }
  ]
}
```

### Get Device Status
```javascript
GET /api/sites/farm-a/status/LT2222-FA-001
```

## 🔒 Privacy & Security

- **Site Isolation**: Each site has completely isolated data
- **Authentication**: Function key required for all endpoints
- **Input Validation**: All inputs validated and sanitized
- **Audit Logging**: All actions logged with site context

## ⚙️ Configuration

### Environment Variables
```bash
# LoRaWAN Network Server
LORAWAN_NETWORK_SERVER=https://your-lorawan-server.com
LORAWAN_API_KEY=your-api-key
LORAWAN_APPLICATION_ID=your-app-id

# Azure Functions
AzureWebJobsStorage=your-storage-connection-string
FUNCTIONS_WORKER_RUNTIME=node
```

## 🚀 Deployment

### Azure DevOps Pipeline
```bash
# Deploy to Azure Functions
az functionapp deployment source config-zip \
  --resource-group your-rg \
  --name your-lorawan-app \
  --src lorawan-control.zip
```

### Local Development
```bash
# Install dependencies
npm install

# Start local functions
func start
```

## 📊 Monitoring

- **Application Insights**: Performance and error monitoring
- **Site-specific Metrics**: Separate metrics per site
- **Device Health**: Track device connectivity and status
- **Alert Integration**: Generate alerts for device issues

## 🎯 Multi-Site Architecture

The system supports multiple farm sites with complete privacy isolation:

- **Data Separation**: Each site's data is completely isolated
- **Configuration**: Site-specific LoRaWAN network configurations
- **Scalability**: Easy to add new sites without affecting existing ones
- **Management**: Centralized deployment with site-specific access control

## 📱 Dashboard Integration

Your agricultural dashboard can integrate with these functions:

```javascript
// Get devices for specific site
const response = await fetch('/api/sites/farm-a/devices');

// Control device for specific site
const response = await fetch('/api/sites/farm-a/relays/LT2222-FA-001', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ relayId: 1, state: true })
});
```

## 📜 License

MIT License
