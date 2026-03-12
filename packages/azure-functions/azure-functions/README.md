# Agricultural Automation Azure Functions

Multi-site agricultural automation system with complete privacy isolation between farm sites.

## 🏗️ Architecture

Two separate Azure Function Apps with site-based privacy isolation:

```
azure-functions/
├── lorawan-control/          # LoRaWAN device control
│   ├── lorawan/
│   ├── services/
│   ├── host.json
│   ├── package.json
│   └── README.md
├── alert-system/             # Alert processing and notifications
│   ├── alerts/
│   ├── services/
│   ├── host.json
│   ├── package.json
│   └── README.md
└── README.md
```

## 🚀 Features

### LoRaWAN Control Functions
- **Multi-Site Device Management**: Isolated device control per farm
- **LT2222 Device Control**: Relay and digital I/O operations
- **Batch Operations**: Control multiple devices simultaneously
- **Real-time Monitoring**: Device status and telemetry
- **Scheduling**: Automated control based on time schedules
- **Uplink Processing**: Handle device telemetry data

### Alert System Functions
- **Intelligent Alert Processing**: Threshold monitoring with hysteresis
- **Multi-Channel Notifications**: SMS and email alerts
- **Privacy Isolation**: Complete data separation between sites
- **Alert History**: Track and analyze alert patterns
- **Batch Processing**: Handle multiple alerts simultaneously
- **Statistics**: Per-site alert analytics

## 🔒 Privacy & Security

### Site Isolation
- **Complete Data Separation**: Each farm site has isolated data
- **Site-based Routing**: All API calls require site ID
- **Access Control**: Site-specific access and permissions
- **Audit Logging**: All actions logged with site context

### API Security
- **Function Key Authentication**: All endpoints require function keys
- **Input Validation**: Comprehensive input validation and sanitization
- **Rate Limiting**: Built-in cooldown periods and rate limiting
- **Error Handling**: Secure error responses without data leakage

## 🌐 API Structure

### LoRaWAN Control API
```
/api/sites/{siteId}/devices/{deviceId}     # Device management
/api/sites/{siteId}/relays/{deviceId}      # Relay control
/api/sites/{siteId}/digital/{deviceId}     # Digital I/O control
/api/sites/{siteId}/batch                  # Batch operations
/api/sites/{siteId}/status/{deviceId}      # Device status
/api/sites/{siteId}/schedules/{id}         # Schedule management
/api/sites/{siteId}/uplink                  # Uplink processing
```

### Alert System API
```
/api/alerts/process          # Process sensor data
/api/alerts/send             # Send notifications
/api/alerts/config           # Alert configuration
/api/alerts/batch            # Batch processing
/api/alerts/history          # Alert history
/api/alerts/statistics       # Alert statistics
```

## 🎯 Multi-Site Usage

### Site Identification
All API calls must include site identification:

```javascript
// Method 1: Route parameter (LoRaWAN)
GET /api/sites/farm-a/devices

// Method 2: Header (Alerts)
GET /api/alerts/config
Headers: x-site-id: farm-a

// Method 3: Query parameter (Alerts)
GET /api/alerts/config?siteId=farm-a
```

### Example: Control Device for Farm A
```javascript
POST /api/sites/farm-a/relays/LT2222-FA-001
{
  "relayId": 1,
  "state": true
}
```

### Example: Process Alert for Farm B
```javascript
POST /api/alerts/process
Headers: x-site-id: farm-b
{
  "sensorId": "IR1OT",
  "value": 40,
  "deviceId": "BD-BZD"
}
```

## 🚀 Deployment

### Azure DevOps Structure
```
pipelines/
├── lorawan-control-ci.yml    # LoRaWAN functions pipeline
├── alert-system-ci.yml      # Alert functions pipeline
└── release.yml              # Release pipeline
```

### Deployment Steps
1. **Create two Function Apps** in Azure Portal
2. **Configure environment variables** for each app
3. **Deploy using Azure DevOps pipelines**
4. **Configure function keys** for security
5. **Test multi-site functionality**

### Environment Variables

#### LoRaWAN Control App
```bash
LORAWAN_NETWORK_SERVER=https://your-lorawan-server.com
LORAWAN_API_KEY=your-api-key
LORAWAN_APPLICATION_ID=your-app-id
```

#### Alert System App
```bash
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=your_twilio_number
SENDGRID_API_KEY=your_sendgrid_key
FROM_EMAIL=alerts@yourfarm.com
```

## 📱 Dashboard Integration

### Multi-Site Dashboard
Your agricultural dashboard can manage multiple sites:

```javascript
// Get devices for specific site
const devices = await fetch('/api/sites/farm-a/devices');

// Control device for specific site
await fetch('/api/sites/farm-a/relays/LT2222-FA-001', {
  method: 'POST',
  body: JSON.stringify({ relayId: 1, state: true })
});

// Process alert for specific site
await fetch('/api/alerts/process', {
  method: 'POST',
  headers: { 'x-site-id': 'farm-a' },
  body: JSON.stringify({ sensorId: 'IR1OT', value: 40 })
});
```

### Site Management
```javascript
// Switch between sites
const currentSite = 'farm-a';
const apiUrl = `/api/sites/${currentSite}`;

// Get site summary
const summary = await fetch(`/api/sites/${currentSite}/devices`);

// Process alerts for current site
await fetch('/api/alerts/process', {
  headers: { 'x-site-id': currentSite },
  // ... alert data
});
```

## 💰 Cost Management

### Azure Functions (Consumption Tier)
- **1M executions/month**: Free tier
- **$0.20 per million executions**: After free tier
- **$0.000016 per GB-second**: Compute time

### Estimated Monthly Costs
| Farm Sites | Devices | Executions | Functions Cost | SMS/Email | **Total** |
|------------|----------|------------|----------------|-----------|-----------|
| 1-5        | 10-50    | <500K      | $0             | $10-25    | $10-25    |
| 5-10       | 50-200   | 500K-2M    | $0.30          | $25-50    | $25-80    |
| 10+        | 200+     | 2M+        | $0.60+         | $50+      | $50+      |

## 📊 Monitoring & Analytics

### Application Insights
- **Per-Site Metrics**: Separate monitoring for each site
- **Performance Tracking**: Function execution times and success rates
- **Error Analysis**: Site-specific error tracking
- **Custom Metrics**: Device status, alert frequency, etc.

### Health Monitoring
- **Function Health**: Monitor function availability and performance
- **Device Connectivity**: Track LoRaWAN device online status
- **Alert Volume**: Monitor alert frequency and patterns
- **Notification Delivery**: Track SMS/email delivery success rates

## 🔧 Configuration Management

### Site-Specific Settings
Each site can have its own:
- **LoRaWAN Network Server**: Different network servers per site
- **Alert Thresholds**: Site-specific alert configurations
- **Notification Recipients**: Different contact lists per site
- **Device Configurations**: Site-specific device settings

### Dynamic Configuration
```javascript
// Update alert configuration for specific site
await fetch('/api/alerts/config', {
  method: 'PUT',
  headers: { 'x-site-id': 'farm-a' },
  body: JSON.stringify({
    temperature: {
      high: { threshold: 40, hysteresis: 2, enabled: true },
      low: { threshold: 10, hysteresis: 2, enabled: true }
    }
  })
});
```

## 📜 License

MIT License
