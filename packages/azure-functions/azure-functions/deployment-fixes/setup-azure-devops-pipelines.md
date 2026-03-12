# Azure DevOps Pipeline Setup Guide

## Issue: "No deployments found"

## Solution: Set Up Azure DevOps Pipelines

### Step 1: Create Azure Service Connection

1. **Go to Azure DevOps Project**
2. **Project Settings → Service connections**
3. **New service connection**
4. **Azure Resource Manager**
5. **Service principal (automatic)**
6. **Select your Azure subscription**
7. **Name it**: `AgenticAg-Connection`
8. **Save**

### Step 2: Create LoRaWAN Control Pipeline

1. **Pipelines → New pipeline**
2. **Azure Repos Git**
3. **Select your repository**
4. **Existing Azure Pipelines YAML file**
5. **Branch**: `master`
6. **Path**: `/azure-functions/pipelines/lorawan-control-ci.yml`
7. **Continue**
8. **Save and run**

### Step 3: Create Alert System Pipeline

1. **Pipelines → New pipeline**
2. **Azure Repos Git**
3. **Select your repository**
4. **Existing Azure Pipelines YAML file**
5. **Branch**: `master`
6. **Path**: `/azure-functions/pipelines/alert-system-ci.yml`
7. **Continue**
8. **Save and run**

### Step 4: Create Release Pipeline (Optional)

1. **Pipelines → New pipeline**
2. **Azure Repos Git**
3. **Select your repository**
4. **Existing Azure Pipelines YAML file**
5. **Branch**: `master`
6. **Path**: `/azure-functions/pipelines/release.yml`
7. **Continue**
8. **Save and run**

### Step 5: Update Service Connection Name

Edit each pipeline YAML file to use your actual service connection:

```yaml
variables:
  azureSubscription: 'AgenticAg-Connection'  # Use your actual connection name
```

### Step 6: Create Azure Function Apps

If not created yet:

```bash
# LoRaWAN Control App
az functionapp create \
  --resource-group AgenticAg \
  --name agricultural-lorawan-control \
  --storage-account agriculturallorawan \
  --consumption-plan-location australia-southeast \
  --runtime node \
  --runtime-version 18 \
  --functions-version 4

# Alert System App
az functionapp create \
  --resource-group AgenticAg \
  --name agricultural-alert-system \
  --storage-account agriculturalalerts \
  --consumption-plan-location australia-southeast \
  --runtime node \
  --runtime-version 18 \
  --functions-version 4
```

### Step 7: Run Pipelines Manually

1. Go to **Pipelines → [Pipeline Name]**
2. Click **Run pipeline**
3. Select **master** branch
4. **Run**

### Step 8: Monitor Deployment

1. **Pipelines → Pipelines**
2. Click on individual pipeline runs
3. Check **Jobs** and **Steps**
4. Look for any errors
5. Check **Logs** for detailed output

## Troubleshooting

### No Pipelines Created
- Make sure you're in the correct Azure DevOps project
- Check you have permissions to create pipelines
- Verify the YAML files exist in the repository

### Service Connection Error
- Ensure service connection exists
- Check service connection name matches YAML
- Verify connection has proper permissions

### Function App Not Found
- Create Function Apps first
- Check Function App names match pipeline variables
- Verify resource group is correct

### Deployment Failed
- Check pipeline logs for errors
- Verify zip package structure
- Ensure Function App is not in read-only mode

## Expected Results

After setup:
1. **LoRaWAN Control Pipeline**: Deploys to `agricultural-lorawan-control`
2. **Alert System Pipeline**: Deploys to `agricultural-alert-system`
3. **Release Pipeline**: Deploys both with health checks
4. **Deployment History**: Shows successful deployments

## Quick Test

To trigger a pipeline manually:

```bash
# Make a small change to trigger pipeline
echo "# Test change" >> azure-functions/lorawan-control/README.md
git add azure-functions/lorawan-control/README.md
git commit -m "Test pipeline trigger"
git push origin master
```

This should automatically trigger the LoRaWAN Control pipeline!
