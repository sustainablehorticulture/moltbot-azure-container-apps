# Agricultural Automation Azure Functions

## 🚀 Overview

Serverless Azure Functions for agricultural automation with LoRaWAN device control and alert management.

## 📁 Project Structure

```
├── alerts/                    # Alert system functions
│   ├── function.json
│   └── index.js
├── lorawan/                   # LoRaWAN device control functions
│   ├── function.json
│   └── index.js
├── services/                  # Shared services
│   ├── smsService.js
│   ├── emailService.js
│   ├── alertProcessor.js
│   ├── lt2222Service.js
│   └── deviceManager.js
├── pipelines/                 # Azure DevOps pipelines
│   ├── alerts-ci.yml
│   ├── lorawan-ci.yml
│   └── release.yml
├── infrastructure/            # ARM templates
│   ├── alerts-function-app.json
│   └── lorawan-function-app.json
├── host.json                  # Azure Functions configuration
├── package.json               # Dependencies
├── local.settings.json        # Local environment variables
└── README.md
```

## 🔧 Features

### Alert System
- **Multi-channel notifications** (SMS, Email)
- **Intelligent alert processing** (thresholds, hysteresis, cooldowns)
- **Configurable sensor alerts**
- **Alert scheduling and batching**

### LoRaWAN Device Control
- **LT2222 device management**
- **Relay control** (2 relays per device)
- **Digital I/O control** (4 inputs, 4 outputs)
- **Analog input monitoring** (2 channels)
- **Device status monitoring**
- **Batch operations**
- **Automated scheduling**

## 🚀 Deployment

### Azure DevOps Pipeline
```bash
# Push to Azure DevOps
git init
git add .
git commit -m "Initial commit"
git remote add origin https://dev.azure.com/your-org/your-project/_git/your-repo
git push -u origin main
```

### Manual Deployment
```bash
# Deploy alerts
az functionapp deployment source config-zip \
  --resource-group your-rg \
  --name your-alerts-app \
  --src alerts-functions.zip

# Deploy LoRaWAN
az functionapp deployment source config-zip \
  --resource-group your-rg \
  --name your-lorawan-app \
  --src lorawan-functions.zip
```

## 🌐 API Endpoints

### Alert System
```
POST /api/alerts/process          # Process sensor data
POST /api/alerts/send             # Send notifications
GET  /api/alerts/config           # Get alert configurations
POST /api/alerts/config           # Update alert configuration
```

### LoRaWAN Control
```
GET/POST/PUT/DELETE /api/lorawan/device/{deviceId}     # Device management
GET/POST        /api/lorawan/relay/{deviceId}            # Relay control
GET/POST        /api/lorawan/digital/{deviceId}         # Digital I/O control
POST            /api/lorawan/batch                      # Batch operations
GET             /api/lorawan/status/{deviceId}          # Device status
POST            /api/lorawan/uplink                     # Process uplink data
GET/POST/PUT/DELETE /api/lorawan/schedule/{scheduleId} # Schedule management
```

## ⚙️ Configuration

### Environment Variables
```bash
# Alert System
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=your_twilio_number
SENDGRID_API_KEY=your_sendgrid_key
FROM_EMAIL=alerts@yourfarm.com

# LoRaWAN
LORAWAN_NETWORK_SERVER=https://your-lorawan-server.com
LORAWAN_API_KEY=your_api_key
LORAWAN_APPLICATION_ID=your_app_id
```

## 💰 Cost Estimates

**Consumption Tier Pricing:**
- **1M executions/month:** Free
- **$0.20 per million executions** after free tier
- **$0.000016 per GB-second** compute time

**Typical farm operation:** $10-50/month including SMS notifications

## 📱 Multi-Site Support

Supports multiple farm sites with isolated device management:
```
/api/sites/{siteId}/devices/{deviceId}
/api/sites/{siteId}/relay/{deviceId}
/api/sites/{siteId}/digital/{deviceId}
```

## 🔒 Security

- **Function key authentication**
- **Input validation and sanitization**
- **Rate limiting**
- **Secure credential management**

## 📊 Monitoring

- **Application Insights integration**
- **Custom metrics and logging**
- **Health monitoring**
- **Performance tracking**

## 📜 License

MIT License - See LICENSE file for details
