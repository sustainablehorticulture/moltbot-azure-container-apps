# Build ClawdBot Docker image and push to Azure Container Registry
# This script must be run after ACR is provisioned

param(
    [Parameter(Mandatory=$false)]
    [string]$AcrName,
    
    [Parameter(Mandatory=$false)]
    [string]$ImageTag = "latest",
    
    [Parameter(Mandatory=$false)]
    [string]$ClawdbotVersion = "main"
)

$ErrorActionPreference = "Stop"

Write-Host "Building ClawdBot image for Azure Container Apps" -ForegroundColor Cyan

# Get ACR name from azd environment if not provided
if (-not $AcrName) {
    Write-Host "Getting ACR name from azd environment..." -ForegroundColor Yellow
    $AcrName = (azd env get-values | Select-String -Pattern "AZURE_CONTAINER_REGISTRY_NAME=(.+)" | ForEach-Object { $_.Matches[0].Groups[1].Value }).Trim('"')
    
    if (-not $AcrName) {
        Write-Host "ERROR: ACR name not found. Please provision infrastructure first with 'azd provision'" -ForegroundColor Red
        exit 1
    }
}

Write-Host "Using ACR: $AcrName" -ForegroundColor Green

# Get ACR login server
$AcrLoginServer = az acr show --name $AcrName --query loginServer -o tsv
if (-not $AcrLoginServer) {
    Write-Host "ERROR: Could not get ACR login server" -ForegroundColor Red
    exit 1
}

Write-Host "ACR Login Server: $AcrLoginServer" -ForegroundColor Green

# Login to ACR
Write-Host "Logging in to ACR..." -ForegroundColor Yellow
az acr login --name $AcrName

# Build the image using ACR Tasks (cloud build - no local Docker required)
Write-Host "Building ClawdBot image using ACR Tasks..." -ForegroundColor Yellow
Write-Host "  - Version: $ClawdbotVersion" -ForegroundColor Cyan
Write-Host "  - Tag: $ImageTag" -ForegroundColor Cyan

$DockerfilePath = Join-Path $PSScriptRoot "..\src\clawdbot\Dockerfile"

# Use ACR build to build in the cloud
az acr build `
    --registry $AcrName `
    --image "clawdbot:$ImageTag" `
    --file $DockerfilePath `
    --build-arg "CLAWDBOT_VERSION=$ClawdbotVersion" `
    (Join-Path $PSScriptRoot "..\src\clawdbot")

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to build image" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "SUCCESS: ClawdBot image built and pushed to ACR" -ForegroundColor Green
Write-Host "  Image: $AcrLoginServer/clawdbot:$ImageTag" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Run 'azd provision' to deploy the Container App" -ForegroundColor White
Write-Host "  2. Or run 'azd deploy' if infrastructure is already provisioned" -ForegroundColor White
