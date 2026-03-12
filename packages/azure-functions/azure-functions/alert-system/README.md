# Alert System Functions

Multi-site agricultural alert system Azure Functions with privacy isolation.

## 🚀 Features

- **Multi-Site Support**: Isolated alert management per farm site
- **Intelligent Processing**: Threshold monitoring with hysteresis and cooldowns
- **Multi-Channel Notifications**: SMS and email alerts
- **Privacy Isolation**: Complete data separation between sites
- **Alert History**: Track and analyze alert patterns
- **Configurable Thresholds**: Site-specific alert configurations
- **Batch Processing**: Handle multiple alerts simultaneously

## 📁 Structure

```
alert-system/
├── alerts/
│   ├── function.json
│   └── index.js
├── services/
│   ├── smsService.js
│   ├── emailService.js
│   └── alertProcessor.js
├── host.json
├── package.json
└── README.md
```

## 🌐 API Endpoints

### Alert Processing
```
POST /api/alerts/process          # Process sensor data and generate alerts
POST /api/alerts/batch            # Process multiple alerts
```

### Notification Sending
```
POST /api/alerts/send             # Send SMS/email notifications
```

### Configuration Management
```
GET  /api/alerts/config           # Get alert configuration
POST /api/alerts/config           # Update alert configuration
PUT  /api/alerts/config           # Update alert configuration
```

### Alert History & Statistics
```
GET /api/alerts/history           # Get alert history
GET /api/alerts/statistics        # Get alert statistics
```

## 🔧 Usage Examples

### Process Alert for Site A
```javascript
POST /api/alerts/process
Headers:
  x-site-id: farm-a

Body:
{
  "sensorId": "IR1OT",
  "value": 40,
  "deviceId": "BD-BZD"
}
```

### Send SMS Notification
```javascript
POST /api/alerts/send
Headers:
  x-site-id: farm-a

Body:
{
  "type": "sms",
  "recipients": [
    { "phone": "+1234567890" }
  ],
  "message": "High temperature alert: 40°C detected"
}
```

### Send Email Notification
```javascript
POST /api/alerts/send
Headers:
  x-site-id: farm-a

Body:
{
  "type": "email",
  "recipients": [
    { "email": "farmer@example.com" }
  ],
  "subject": "Temperature Alert",
  "message": "High temperature detected in greenhouse"
}
```

### Batch Process Alerts
```javascript
POST /api/alerts/batch
Headers:
  x-site-id: farm-a

Body:
{
  "alerts": [
    {
      "sensorId": "IR1OT",
      "value": 40,
      "deviceId": "BD-BZD"
    },
    {
      "sensorId": "HM1RH",
      "value": 85,
      "deviceId": "BD-BZD"
    }
  ]
}
```

### Get Alert Statistics
```javascript
GET /api/alerts/statistics?timeRange=24h
Headers:
  x-site-id: farm-a
```

## 🔒 Privacy & Security

- **Site Isolation**: Each site has completely isolated alert data
- **Authentication**: Function key required for all endpoints
- **Site Header**: `x-site-id` header required for privacy
- **Input Validation**: All inputs validated and sanitized
- **Audit Logging**: All actions logged with site context

## ⚙️ Configuration

### Environment Variables
```bash
# SMS Provider (Twilio)
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=your_twilio_number

# Email Provider (SendGrid)
SENDGRID_API_KEY=your_sendgrid_key
FROM_EMAIL=alerts@yourfarm.com

# Azure Communication Services (Alternative)
AZURE_COMMUNICATION_CONNECTION_STRING=your_connection_string
AZURE_PHONE_NUMBER=your_azure_number

# Azure Functions
AzureWebJobsStorage=your-storage-connection-string
FUNCTIONS_WORKER_RUNTIME=node
```

### Alert Configuration
```javascript
// Default alert thresholds per sensor type
{
  "temperature": {
    "high": { "threshold": 35, "hysteresis": 2, "enabled": true },
    "low": { "threshold": 5, "hysteresis": 2, "enabled": true }
  },
  "humidity": {
    "high": { "threshold": 80, "hysteresis": 5, "enabled": true },
    "low": { "threshold": 30, "hysteresis": 5, "enabled": true }
  },
  "soilMoisture": {
    "low": { "threshold": 30, "hysteresis": 5, "enabled": true }
  },
  "battery": {
    "low": { "threshold": 20, "hysteresis": 2, "enabled": true }
  }
}
```

## 🧠 Intelligent Alert Processing

### Features
- **Threshold Monitoring**: Configurable high/low thresholds
- **Hysteresis**: Prevent alert flapping around thresholds
- **Cooldown Periods**: Rate limiting to prevent alert storms
- **Severity Levels**: Warning and critical alert classification
- **Sensor Type Detection**: Automatic sensor type identification

### Alert Types
- **Temperature**: High/low temperature alerts
- **Humidity**: High/low humidity alerts
- **Soil Moisture**: Low soil moisture alerts
- **Battery**: Low battery alerts

## 📱 Notification Providers

### SMS (Twilio/Azure)
- Site-prefixed messages for easy identification
- Phone number validation
- Batch SMS support
- Delivery status tracking

### Email (SendGrid/Azure)
- HTML email templates
- Site-specific branding
- Batch email support
- Delivery status tracking

## 📊 Analytics & Reporting

### Alert Statistics
```javascript
{
  "siteId": "farm-a",
  "timeRange": "24h",
  "total": 15,
  "byType": {
    "high_temperature": 8,
    "low_soil_moisture": 5,
    "low_battery": 2
  },
  "bySeverity": {
    "warning": 12,
    "critical": 3
  },
  "bySensor": {
    "IR1OT": 8,
    "SM1SM": 5,
    "BT1VL": 2
  }
}
```

### Alert History
- Complete alert history per site
- Filterable by sensor ID
- Timestamp tracking
- Alert severity and type

## 🚀 Deployment

### Azure DevOps Pipeline
```bash
# Deploy to Azure Functions
az functionapp deployment source config-zip \
  --resource-group your-rg \
  --name your-alert-app \
  --src alert-system.zip
```

### Local Development
```bash
# Install dependencies
npm install

# Start local functions
func start
```

## 🎯 Multi-Site Architecture

The system supports multiple farm sites with complete privacy isolation:

- **Data Separation**: Each site's alert data is completely isolated
- **Configuration**: Site-specific alert thresholds and settings
- **Notifications**: Site-prefixed messages for easy identification
- **Analytics**: Separate statistics and history per site
- **Scalability**: Easy to add new sites without affecting existing ones

## 📱 Dashboard Integration

Your agricultural dashboard can integrate with these functions:

```javascript
// Process sensor data for specific site
const response = await fetch('/api/alerts/process', {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'x-site-id': 'farm-a'
  },
  body: JSON.stringify({
    sensorId: 'IR1OT',
    value: 40,
    deviceId: 'BD-BZD'
  })
});

// Send notification for specific site
const response = await fetch('/api/alerts/send', {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'x-site-id': 'farm-a'
  },
  body: JSON.stringify({
    type: 'sms',
    recipients: [{ phone: '+1234567890' }],
    message: 'High temperature alert detected'
  })
});
```

## 📜 License

MIT License
