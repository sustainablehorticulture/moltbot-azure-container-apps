# Separate Function Apps Deployment Guide

## 🎯 Goal
Deploy LoRaWAN Control and Alert System as separate Azure Function Apps

## 📁 Repository Structure

### Option 1: Two Separate Repositories (Recommended)

```
sustainablehorticulture/backendfunctions/
├── azure-functions/
│   └── lorawan-control/
│       ├── lorawan/
│       ├── services/
│       └── package.json
└── .github/workflows/
    └── lorawan-deploy-fixed.yml

sustainablehorticulture/agricultural-alert-system/
├── alerts/
│   ├── function.json
│   └── index.js
├── services/
│   ├── smsService.js
│   ├── emailService.js
│   └── alertProcessor.js
├── host.json
├── package.json
└── .github/workflows/
    └── deploy.yml
```

### Option 2: Single Repository with Two Workflows

```
sustainablehorticulture/backendfunctions/
├── azure-functions/
│   ├── lorawan-control/
│   └── alert-system/
├── .github/workflows/
│   ├── deploy-lorawan.yml
│   └── deploy-alerts.yml
```

## 🚀 Setup Steps

### Step 1: Create Alert System Repository

1. Create new GitHub repository: `agricultural-alert-system`
2. Copy alert system files to new repo
3. Add GitHub Actions workflow
4. Configure deployment

### Step 2: Create Azure Function Apps

```bash
# LoRaWAN Control (already exists)
az functionapp create \
  --resource-group AgenticAG \
  --name agricultural-lorawan-control \
  --storage-account agriculturallorawan \
  --consumption-plan-location australia-southeast \
  --runtime node \
  --runtime-version 22 \
  --functions-version 4

# Alert System (new)
az functionapp create \
  --resource-group AgenticAG \
  --name agricultural-alert-system \
  --storage-account agriculturalalerts \
  --consumption-plan-location australia-southeast \
  --runtime node \
  --runtime-version 22 \
  --functions-version 4
```

### Step 3: Configure GitHub Secrets

#### For LoRaWAN Control Repository
- `AZURE_CREDENTIALS`: Service principal JSON
- `AZUREAPPSERVICE_PUBLISHPROFILE_EA2651383CB745C5876E84CB9D3D77B0`

#### For Alert System Repository
- `AZURE_CREDENTIALS`: Service principal JSON
- `TWILIO_ACCOUNT_SID`: Twilio account SID
- `TWILIO_AUTH_TOKEN`: Twilio auth token
- `TWILIO_PHONE_NUMBER`: Twilio phone number
- `SENDGRID_API_KEY`: SendGrid API key
- `FROM_EMAIL`: From email address

### Step 4: Configure Environment Variables

#### LoRaWAN Control Function App
```bash
az functionapp config appsettings set \
  --resource-group AgenticAG \
  --name agricultural-lorawan-control \
  --settings \
  LORAWAN_NETWORK_SERVER=https://eu1.cloud.thethings.network \
  LORAWAN_API_KEY=your-ttn-api-key \
  LORAWAN_APPLICATION_ID=your-ttn-app-id
```

#### Alert System Function App
```bash
az functionapp config appsettings set \
  --resource-group AgenticAG \
  --name agricultural-alert-system \
  --settings \
  SMS_PROVIDER=twilio \
  EMAIL_PROVIDER=sendgrid \
  TWILIO_ACCOUNT_SID=your-sid \
  TWILIO_AUTH_TOKEN=your-token \
  TWILIO_PHONE_NUMBER=your-number \
  SENDGRID_API_KEY=your-key \
  FROM_EMAIL=alerts@yourfarm.com
```

## 🌐 API Endpoints

### LoRaWAN Control Functions
```
https://agricultural-lorawan-control.azurewebsites.net/api/sites/{siteId}/devices
https://agricultural-lorawan-control.azurewebsites.net/api/sites/{siteId}/relays/{deviceId}
https://agricultural-lorawan-control.azurewebsites.net/api/sites/{siteId}/digital/{deviceId}
```

### Alert System Functions
```
https://agricultural-alert-system.azurewebsites.net/api/alerts/process
https://agricultural-alert-system.azurewebsites.net/api/alerts/send
https://agricultural-alert-system.azurewebsites.net/api/alerts/config
https://agricultural-alert-system.azurewebsites.net/api/alerts/statistics
```

## ✅ Benefits

### Separate Function Apps
- ✅ **Independent scaling**: Each app scales separately
- ✅ **Isolated failures**: One app issue doesn't affect the other
- ✅ **Separate monitoring**: Individual Application Insights
- ✅ **Independent deployment**: Deploy one without affecting the other
- ✅ **Cost optimization**: Pay only for what each app uses

### Multi-Site Privacy
- ✅ **Complete data isolation** between function apps
- ✅ **Site-based routing** in each app
- ✅ **Independent configurations** per app
- ✅ **Separate authentication** per app

## 🎯 Dashboard Integration

Your agricultural dashboard will call two separate APIs:

```javascript
// LoRaWAN Control
const lorawanResponse = await fetch(
  'https://agricultural-lorawan-control.azurewebsites.net/api/sites/farm-a/relays/LT2222-FA-001',
  { method: 'POST', body: JSON.stringify({ relayId: 1, state: true }) }
);

// Alert System  
const alertResponse = await fetch(
  'https://agricultural-alert-system.azurewebsites.net/api/alerts/send',
  { 
    method: 'POST',
    headers: { 'x-site-id': 'farm-a' },
    body: JSON.stringify({ type: 'sms', recipients: [{ phone: '+1234567890' }] })
  }
);
```

## 📋 Migration Steps

1. ✅ Create alert system repository
2. ✅ Create agricultural-alert-system Function App
3. ✅ Deploy alert system functions
4. ✅ Update dashboard to use both URLs
5. ✅ Test both function apps
6. ✅ Monitor both Application Insights

This gives you complete separation and independent scaling for your agricultural automation system!
