# Get Azure Credentials for GitHub Deployment

## Method 1: Create Service Principal (Recommended)

### Step 1: Create Service Principal
```bash
# In Azure CLI or Cloud Shell
az ad sp create-for-rbac \
  --name "github-deployment-sp" \
  --role contributor \
  --scopes /subscriptions/YOUR-SUBSCRIPTION-ID/resourceGroups/AgenticAg
```

### Step 2: Get Credentials JSON
The output will be like:
```json
{
  "appId": "12345678-1234-1234-1234-123456789012",
  "displayName": "github-deployment-sp",
  "password": "ABC123XYZ789DEF456...",
  "tenant": "87654321-4321-4321-4321-210987654321"
}
```

### Step 3: Create GitHub Secret
Create a secret named `AZURE_CREDENTIALS` with this JSON:
```json
{
  "clientId": "12345678-1234-1234-1234-123456789012",
  "clientSecret": "ABC123XYZ789DEF456...",
  "subscriptionId": "YOUR-SUBSCRIPTION-ID",
  "tenantId": "87654321-4321-4321-4321-210987654321"
}
```

## Method 2: Use Existing Service Principal

If you already have a service principal:
```bash
# Get your subscription ID
az account show --query id -o tsv

# Get existing service principal
az ad sp list --display-name "your-sp-name" --query "[].{appId:appId, tenant:appOwnerTenantId}" -o json
```

## Method 3: Use Azure CLI Direct (No Secrets)

Alternative workflow that doesn't need secrets:
```yaml
- name: 'Deploy to Azure Functions'
  run: |
    az functionapp deployment source config-zip \
      --resource-group AgenticAg \
      --name agricultural-lorawan-control \
      --src ./lorawan-control-deploy.zip
```

## Method 4: Manual Deployment

If automated deployment doesn't work:

### Local Deployment
```bash
# Create zip package
cd lorawan-control
zip -r ../lorawan-control-deploy.zip .

# Deploy manually
az functionapp deployment source config-zip \
  --resource-group AgenticAg \
  --name agricultural-lorawan-control \
  --src ../lorawan-control-deploy.zip
```

### GitHub Actions without Secrets
```yaml
name: Manual Deployment Trigger

on:
  workflow_dispatch:
  push:
    branches: [ main ]
    paths: [ 'lorawan-control/**' ]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: 'Setup Node.js'
      uses: actions/setup-node@v3
      with:
        node-version: '18.x'
    
    - name: 'Install and Build'
      run: |
        cd lorawan-control
        npm install
        zip -r ../lorawan-control-deploy.zip .
    
    - name: 'Upload Artifact'
      uses: actions/upload-artifact@v3
      with:
        name: lorawan-functions
        path: ./lorawan-control-deploy.zip
```

Then manually deploy:
```bash
# Download artifact from GitHub Actions
# Deploy locally using Azure CLI
az functionapp deployment source config-zip \
  --resource-group AgenticAg \
  --name agricultural-lorawan-control \
  --src lorawan-control-deploy.zip
```
