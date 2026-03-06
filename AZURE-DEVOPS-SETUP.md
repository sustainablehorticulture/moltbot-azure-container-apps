# Azure DevOps Pipeline Setup for Red Dog

This document explains how to set up the Azure DevOps pipeline for automated deployment of Red Dog to Azure Container Apps.

## Prerequisites

- Azure DevOps organization: `AgenticAg`
- Azure DevOps project: `Agentic Ag`
- Azure subscription: `eaec7538-5ab2-4d23-9903-6ff6ebbca7b0`
- Azure Container Registry: `cr5eqmkn3bypkyu.azurecr.io`
- Azure Container App: `clawdbot` in resource group `BotRedDog`

## Setup Steps

### 1. Create Service Connection in Azure DevOps

1. Go to Azure DevOps: https://dev.azure.com/AgenticAg/Agentic%20Ag
2. Navigate to **Project Settings** → **Service connections**
3. Click **New service connection** → **Azure Resource Manager**
4. Choose **Service principal (automatic)**
5. Configure:
   - **Subscription**: Select your Azure subscription
   - **Resource group**: `BotRedDog` (or leave empty for subscription-level access)
   - **Service connection name**: `Azure-RedDog-ServiceConnection`
   - Check **Grant access permission to all pipelines**
6. Click **Save**

### 2. Create the Pipeline

1. In Azure DevOps, go to **Pipelines** → **Pipelines**
2. Click **New pipeline**
3. Select **Azure Repos Git**
4. Choose the **Bot Red Dog** repository
5. Select **Existing Azure Pipelines YAML file**
6. Choose `/azure-pipelines.yml`
7. Click **Run** to start the first build

### 3. Configure Pipeline Variables (Optional)

If you need to override any variables:

1. Go to **Pipelines** → Select your pipeline → **Edit**
2. Click **Variables** (top right)
3. Add any custom variables:
   - `REGISTRY`: Container registry URL
   - `IMAGE_NAME`: Docker image name
   - `RESOURCE_GROUP`: Azure resource group
   - `CONTAINER_APP_NAME`: Container app name

## Pipeline Workflow

The pipeline consists of two stages:

### Build Stage
1. Logs into Azure using service connection
2. Builds the Docker image from `Dockerfile`
3. Pushes image to Azure Container Registry with two tags:
   - `latest`: Always points to the most recent build
   - `$(Build.BuildId)`: Specific build number for rollback capability

### Deploy Stage
1. Updates the Azure Container App with the new image
2. Verifies the deployment by listing the latest revision
3. Runs only if the Build stage succeeds

## Triggering Deployments

The pipeline automatically triggers on:
- Commits to `main` branch
- Commits to `master` branch

Manual triggers:
1. Go to **Pipelines** → Select pipeline
2. Click **Run pipeline**
3. Choose branch and click **Run**

## Monitoring Deployments

### In Azure DevOps
- View pipeline runs: **Pipelines** → **Pipelines** → Select pipeline
- View logs: Click on a specific run → Click on stage/job

### In Azure Portal
- Container App logs: Azure Portal → Container Apps → `clawdbot` → Logs
- Revisions: Azure Portal → Container Apps → `clawdbot` → Revisions

## Troubleshooting

### Service Connection Issues
If the pipeline fails with authentication errors:
1. Verify the service connection is active: **Project Settings** → **Service connections**
2. Check permissions: The service principal needs `Contributor` role on the resource group
3. Re-authorize if needed: Edit service connection → **Verify** → **Save**

### Build Failures
- Check Dockerfile syntax
- Verify all dependencies are in `package.json`
- Review build logs for specific errors

### Deployment Failures
- Verify Container App exists: `az containerapp show --name clawdbot --resource-group BotRedDog`
- Check image was pushed: `az acr repository show-tags --name cr5eqmkn3bypkyu --repository reddog`
- Review Container App logs for runtime errors

## Rollback

To rollback to a previous version:

```bash
# List available images
az acr repository show-tags --name cr5eqmkn3bypkyu --repository reddog --orderby time_desc

# Deploy specific version
az containerapp update \
  --name clawdbot \
  --resource-group BotRedDog \
  --image cr5eqmkn3bypkyu.azurecr.io/reddog:<BUILD_ID>
```

## Security Notes

- Service connection uses Azure AD authentication (no keys stored in repo)
- Container registry credentials are managed by Azure
- All secrets (database, Stripe, etc.) are stored in Container App secrets, not in the pipeline

## Related Files

- `azure-pipelines.yml`: Pipeline definition
- `Dockerfile`: Container image definition
- `.github/workflows/azure-deploy.yml`: GitHub Actions workflow (alternative deployment method)
