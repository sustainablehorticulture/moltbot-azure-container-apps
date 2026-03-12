# Fix Azure Functions Read-Only Mode

## Issue
"Your app is currently in read only mode because you have source control integration enabled."

## Solutions

### Option 1: Disable Run from Package (Recommended)

#### Azure Portal Method:
1. Go to your Azure Function App in Azure Portal
2. Navigate to **Settings → Configuration**
3. Go to **Application settings**
4. Find `WEBSITE_RUN_FROM_PACKAGE` setting
5. **Delete** or set to `0`
6. **Save** configuration
7. **Restart** the Function App

#### Azure CLI Method:
```bash
# For LoRaWAN Control App
az functionapp config appsettings delete \
  --resource-group AgenticAg \
  --name agricultural-lorawan-control \
  --setting-names WEBSITE_RUN_FROM_PACKAGE

# For Alert System App
az functionapp config appsettings delete \
  --resource-group AgenticAg \
  --name agricultural-alert-system \
  --setting-names WEBSITE_RUN_FROM_PACKAGE

# Restart both apps
az functionapp restart --resource-group AgenticAg --name agricultural-lorawan-control
az functionapp restart --resource-group AgenticAg --name agricultural-alert-system
```

### Option 2: Use Proper ZIP Deployment

If you want to keep Run from Package mode:

#### Create Proper ZIP Structure:
```bash
# LoRaWAN Control
cd azure-functions/lorawan-control
zip -r ../../lorawan-control-deploy.zip .

# Alert System  
cd azure-functions/alert-system
zip -r ../../alert-system-deploy.zip .
```

#### Deploy with Azure CLI:
```bash
# Deploy LoRaWAN Control
az functionapp deployment source config-zip \
  --resource-group AgenticAg \
  --name agricultural-lorawan-control \
  --src lorawan-control-deploy.zip

# Deploy Alert System
az functionapp deployment source config-zip \
  --resource-group AgenticAg \
  --name agricultural-alert-system \
  --src alert-system-deploy.zip
```

### Option 3: Disable Source Control Integration

#### Azure Portal Method:
1. Go to your Function App
2. Navigate to **Deployment Center**
3. Click **Disconnect** to remove source control integration
4. **Save** changes

#### Azure CLI Method:
```bash
# Disable source control integration
az functionapp deployment source delete \
  --resource-group AgenticAg \
  --name agricultural-lorawan-control

az functionapp deployment source delete \
  --resource-group AgenticAg \
  --name agricultural-alert-system
```

## Recommended Approach

### For Development:
1. **Disable Run from Package** (Option 1)
2. **Use manual deployment** for testing
3. **Enable source control** later for CI/CD

### For Production:
1. **Keep Run from Package** enabled
2. **Use proper ZIP deployment** (Option 2)
3. **Configure Azure DevOps pipelines** for automated deployment

## Verification

After applying fixes:

1. Check Function App is no longer read-only
2. Test function endpoints
3. Verify deployment worked correctly
4. Monitor Application Insights for errors

## Next Steps

1. Choose your preferred fix method
2. Apply the changes
3. Test the Function Apps
4. Update deployment pipelines if needed
