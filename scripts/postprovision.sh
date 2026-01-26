#!/bin/bash
# ClawdBot Azure Container Apps - Post-Provision Script
# This script runs after infrastructure is provisioned

set -e

echo "ClawdBot Post-Provision Setup"
echo "================================="

# Check if required environment variables are set
if [ -z "$AZURE_RESOURCE_GROUP" ]; then
    echo "Error: AZURE_RESOURCE_GROUP environment variable is not set"
    exit 1
fi

if [ -z "$CONTAINER_REGISTRY_NAME" ]; then
    echo "Error: CONTAINER_REGISTRY_NAME environment variable is not set"
    exit 1
fi

echo ""
echo "Building and pushing ClawdBot container image..."

# Get ACR login server
ACR_LOGIN_SERVER=$(az acr show --name "$CONTAINER_REGISTRY_NAME" --query loginServer -o tsv)
if [ -z "$ACR_LOGIN_SERVER" ]; then
    echo "Error: Failed to get ACR login server"
    exit 1
fi

echo "   ACR Login Server: $ACR_LOGIN_SERVER"

# Log in to ACR
echo "   Logging in to ACR..."
az acr login --name "$CONTAINER_REGISTRY_NAME"

# Build and push the ClawdBot image
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKERFILE_PATH="$SCRIPT_DIR/../src/clawdbot"

if [ -f "$DOCKERFILE_PATH/Dockerfile" ]; then
    echo "   Building container image (this may take a few minutes)..."
    az acr build \
        --registry "$CONTAINER_REGISTRY_NAME" \
        --image "clawdbot:latest" \
        --file "$DOCKERFILE_PATH/Dockerfile" \
        "$DOCKERFILE_PATH"
else
    # Use the official ClawdBot image from GitHub Container Registry
    echo "   No custom Dockerfile found. Using official ClawdBot image..."
    echo "   Importing official ClawdBot image from GitHub Container Registry..."
    az acr import \
        --name "$CONTAINER_REGISTRY_NAME" \
        --source ghcr.io/clawdbot/clawdbot:latest \
        --image clawdbot:latest \
        --force
fi

echo ""
echo "Container image ready: $ACR_LOGIN_SERVER/clawdbot:latest"

# Configure storage for Container Apps
echo ""
echo "Configuring storage mount for persistent data..."

STORAGE_KEY=$(az storage account keys list \
    --resource-group "$AZURE_RESOURCE_GROUP" \
    --account-name "$STORAGE_ACCOUNT_NAME" \
    --query "[0].value" -o tsv)

ENV_NAME=$(az containerapp env list --resource-group "$AZURE_RESOURCE_GROUP" --query "[0].name" -o tsv)

if [ -n "$ENV_NAME" ]; then
    # Add storage to Container Apps Environment
    az containerapp env storage set \
        --name "$ENV_NAME" \
        --resource-group "$AZURE_RESOURCE_GROUP" \
        --storage-name "clawdbot-storage" \
        --azure-file-account-name "$STORAGE_ACCOUNT_NAME" \
        --azure-file-account-key "$STORAGE_KEY" \
        --azure-file-share-name "clawdbot-workspace" \
        --access-mode "ReadWrite" 2>/dev/null || true

    echo "Storage mount configured"
else
    echo "WARNING: Container Apps Environment not found - storage will be configured on deploy"
fi

echo ""
echo "Post-provision setup complete!"
echo ""
echo "Next steps:"
echo "  1. Run 'azd deploy' to deploy ClawdBot"
echo "  2. Configure your Telegram/Discord bot tokens"
echo "  3. Start chatting with your AI assistant!"
