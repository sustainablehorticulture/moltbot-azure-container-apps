# ClawdBot Azure Container Apps - Post-Provision Script
# This script runs after infrastructure is provisioned

param(
    [string]$ResourceGroup = $env:AZURE_RESOURCE_GROUP,
    [string]$ContainerRegistryName = $env:CONTAINER_REGISTRY_NAME,
    [string]$StorageAccountName = $env:STORAGE_ACCOUNT_NAME
)

Write-Host "ClawdBot Post-Provision Setup" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan

# Check if required environment variables are set
if (-not $ResourceGroup) {
    Write-Error "AZURE_RESOURCE_GROUP environment variable is not set"
    exit 1
}

if (-not $ContainerRegistryName) {
    Write-Error "CONTAINER_REGISTRY_NAME environment variable is not set"
    exit 1
}

Write-Host ""
Write-Host "Building and pushing ClawdBot container image..." -ForegroundColor Yellow

# Get ACR login server
$acrLoginServer = az acr show --name $ContainerRegistryName --query loginServer -o tsv
if (-not $acrLoginServer) {
    Write-Error "Failed to get ACR login server"
    exit 1
}

Write-Host "   ACR Login Server: $acrLoginServer" -ForegroundColor Gray

# Log in to ACR
Write-Host "   Logging in to ACR..." -ForegroundColor Gray
az acr login --name $ContainerRegistryName

# Build and push the ClawdBot image using ACR Tasks
Write-Host "   Building container image (this may take a few minutes)..." -ForegroundColor Gray
$dockerfilePath = Join-Path $PSScriptRoot ".." "src" "clawdbot"

if (Test-Path (Join-Path $dockerfilePath "Dockerfile")) {
    az acr build `
        --registry $ContainerRegistryName `
        --image "clawdbot:latest" `
        --file "$dockerfilePath/Dockerfile" `
        $dockerfilePath
} else {
    # Use the official ClawdBot image from GitHub Container Registry
    Write-Host "   No custom Dockerfile found. Using official ClawdBot image..." -ForegroundColor Gray
    
    # Pull from GHCR and push to ACR
    Write-Host "   Importing official ClawdBot image from GitHub Container Registry..." -ForegroundColor Gray
    az acr import `
        --name $ContainerRegistryName `
        --source ghcr.io/clawdbot/clawdbot:latest `
        --image clawdbot:latest `
        --force
}

Write-Host ""
Write-Host "Container image ready: $acrLoginServer/clawdbot:latest" -ForegroundColor Green

# Configure storage for Container Apps
Write-Host ""
Write-Host "Configuring storage mount for persistent data..." -ForegroundColor Yellow

$storageKey = az storage account keys list `
    --resource-group $ResourceGroup `
    --account-name $StorageAccountName `
    --query "[0].value" -o tsv

$envName = (az containerapp env list --resource-group $ResourceGroup --query "[0].name" -o tsv)

if ($envName) {
    # Add storage to Container Apps Environment
    az containerapp env storage set `
        --name $envName `
        --resource-group $ResourceGroup `
        --storage-name "clawdbot-storage" `
        --azure-file-account-name $StorageAccountName `
        --azure-file-account-key $storageKey `
        --azure-file-share-name "clawdbot-workspace" `
        --access-mode "ReadWrite" 2>$null

    Write-Host "Storage mount configured" -ForegroundColor Green
} else {
    Write-Host "WARNING: Container Apps Environment not found - storage will be configured on deploy" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Post-provision setup complete!" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Run 'azd deploy' to deploy ClawdBot" -ForegroundColor Gray
Write-Host "  2. Configure your Telegram/Discord bot tokens" -ForegroundColor Gray
Write-Host "  3. Start chatting with your AI assistant!" -ForegroundColor Gray
