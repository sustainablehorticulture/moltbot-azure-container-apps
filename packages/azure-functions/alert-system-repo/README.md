# Agricultural Alert System - Azure Functions

Multi-site agricultural alert processing system with SMS and email notifications.

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

## 🚀 Deployment

### Azure Function App
- **Name**: `agricultural-alert-system`
- **Runtime**: Node.js 22
- **Region**: Australia Southeast

### GitHub Actions
- **Repository**: `sustainablehorticulture/agricultural-alert-system`
- **Trigger**: Push to master branch
- **Deploy**: Automatic to Azure Functions

## 🔧 Setup

1. Create Azure Function App
2. Add GitHub secrets
3. Configure environment variables
4. Deploy via GitHub Actions

## 🌐 API Endpoints

```
https://agricultural-alert-system.azurewebsites.net/api/alerts/process
https://agricultural-alert-system.azurewebsites.net/api/alerts/send
https://agricultural-alert-system.azurewebsites.net/api/alerts/config
https://agricultural-alert-system.azurewebsites.net/api/alerts/statistics
```

## 🔒 Environment Variables

```bash
# SMS Provider (Twilio)
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=your_number

# Email Provider (SendGrid)
SENDGRID_API_KEY=your_key
FROM_EMAIL=alerts@yourfarm.com

# Azure Communication (Alternative)
AZURE_COMMUNICATION_CONNECTION_STRING=your_connection_string
AZURE_PHONE_NUMBER=your_number
```
