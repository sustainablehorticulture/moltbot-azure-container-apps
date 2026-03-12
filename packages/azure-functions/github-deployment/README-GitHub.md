# LoRaWAN Control Functions - GitHub Deployment

## 🚀 GitHub Actions Deployment

This repository is configured for automatic deployment to Azure Functions via GitHub Actions.

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

## 🔧 Setup Instructions

### 1. Create Azure Function App
```bash
az functionapp create \
  --resource-group AgenticAg \
  --name agricultural-lorawan-control \
  --storage-account agriculturallorawan \
  --consumption-plan-location australia-southeast \
  --runtime node \
  --runtime-version 18 \
  --functions-version 4
```

### 2. Get Publish Profile
1. Go to Azure Portal → Function App
2. **Configuration → Publish profile**
3. **Download** the publish profile
4. **Add to GitHub Secrets** as `AZURE_FUNCTIONAPP_PUBLISH_PROFILE`

### 3. Configure GitHub Secrets
1. Go to **GitHub Repository → Settings → Secrets**
2. **Add Repository Secret**
3. **Name**: `AZURE_FUNCTIONAPP_PUBLISH_PROFILE`
4. **Value**: Content of downloaded publish profile

### 4. Trigger Deployment
- **Push changes** to `lorawan-control/` folder
- **Manual trigger** via Actions tab
- **Automatic deployment** on main/master branch

## 🌐 API Endpoints

After deployment, your LoRaWAN control functions will be available at:

```
https://agricultural-lorawan-control.azurewebsites.net/api/sites/{siteId}/devices
https://agricultural-lorawan-control.azurewebsites.net/api/sites/{siteId}/relays/{deviceId}
https://agricultural-lorawan-control.azurewebsites.net/api/sites/{siteId}/digital/{deviceId}
https://agricultural-lorawan-control.azurewebsites.net/api/sites/{siteId}/batch
https://agricultural-lorawan-control.azurewebsites.net/api/sites/{siteId}/status/{deviceId}
https://agricultural-lorawan-control.azurewebsites.net/api/sites/{siteId}/schedules
https://agricultural-lorawan-control.azurewebsites.net/api/sites/{siteId}/uplink
```

## 🎯 Multi-Site Usage

### Control Relay for Farm A
```javascript
POST https://agricultural-lorawan-control.azurewebsites.net/api/sites/farm-a/relays/LT2222-FA-001
Headers:
  x-functions-key: your-function-key

Body:
{
  "relayId": 1,
  "state": true
}
```

### Get Devices for Farm B
```javascript
GET https://agricultural-lorawan-control.azurewebsites.net/api/sites/farm-b/devices
Headers:
  x-functions-key: your-function-key
```

## 🔒 Environment Variables

Set these in Azure Function App Configuration:

```bash
# LoRaWAN Network Server
LORAWAN_NETWORK_SERVER=https://your-lorawan-server.com
LORAWAN_API_KEY=your-api-key
LORAWAN_APPLICATION_ID=your-app-id

# Azure Functions
AzureWebJobsStorage=your-storage-connection-string
FUNCTIONS_WORKER_RUNTIME=node
WEBSITE_NODE_DEFAULT_VERSION=~18
```

## 📊 Monitoring

- **Application Insights**: Automatic monitoring enabled
- **Function Logs**: Available in Azure Portal
- **GitHub Actions**: Deployment logs and status

## 🚨 Troubleshooting

### Deployment Issues
1. Check GitHub Actions logs
2. Verify publish profile is correct
3. Ensure Function App exists
4. Check package.json dependencies

### Function Errors
1. Check Azure Function logs
2. Verify environment variables
3. Test with function keys
4. Monitor Application Insights

### Read-Only Mode
If you get "read-only mode" error:
```bash
# Disable run from package
az functionapp config appsettings delete \
  --resource-group AgenticAg \
  --name agricultural-lorawan-control \
  --setting-names WEBSITE_RUN_FROM_PACKAGE

# Restart app
az functionapp restart --resource-group AgenticAg --name agricultural-lorawan-control
```

## ✅ Testing Deployment

1. **Check deployment status** in GitHub Actions
2. **Verify Function App URL** is accessible
3. **Test API endpoints** with function keys
4. **Monitor logs** for any errors

## 🎉 Success!

Your LoRaWAN control functions are now deployed and ready for multi-site agricultural automation!
