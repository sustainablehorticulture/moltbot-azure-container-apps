#!/bin/bash
# Build ClawdBot Docker image and push to Azure Container Registry
# This script must be run after ACR is provisioned

set -e

ACR_NAME=${1:-""}
IMAGE_TAG=${2:-"latest"}
CLAWDBOT_VERSION=${3:-"main"}

echo "Building ClawdBot image for Azure Container Apps"

# Get ACR name from azd environment if not provided
if [ -z "$ACR_NAME" ]; then
    echo "Getting ACR name from azd environment..."
    ACR_NAME=$(azd env get-values | grep "AZURE_CONTAINER_REGISTRY_NAME=" | cut -d'=' -f2 | tr -d '"')
    
    if [ -z "$ACR_NAME" ]; then
        echo "ERROR: ACR name not found. Please provision infrastructure first with 'azd provision'"
        exit 1
    fi
fi

echo "Using ACR: $ACR_NAME"

# Get ACR login server
ACR_LOGIN_SERVER=$(az acr show --name "$ACR_NAME" --query loginServer -o tsv)
if [ -z "$ACR_LOGIN_SERVER" ]; then
    echo "ERROR: Could not get ACR login server"
    exit 1
fi

echo "ACR Login Server: $ACR_LOGIN_SERVER"

# Login to ACR
echo "Logging in to ACR..."
az acr login --name "$ACR_NAME"

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKERFILE_PATH="$SCRIPT_DIR/../src/clawdbot/Dockerfile"
BUILD_CONTEXT="$SCRIPT_DIR/../src/clawdbot"

# Build the image using ACR Tasks (cloud build - no local Docker required)
echo "Building ClawdBot image using ACR Tasks..."
echo "  - Version: $CLAWDBOT_VERSION"
echo "  - Tag: $IMAGE_TAG"

az acr build \
    --registry "$ACR_NAME" \
    --image "clawdbot:$IMAGE_TAG" \
    --file "$DOCKERFILE_PATH" \
    --build-arg "CLAWDBOT_VERSION=$CLAWDBOT_VERSION" \
    "$BUILD_CONTEXT"

echo ""
echo "SUCCESS: ClawdBot image built and pushed to ACR"
echo "  Image: $ACR_LOGIN_SERVER/clawdbot:$IMAGE_TAG"
echo ""
echo "Next steps:"
echo "  1. Run 'azd provision' to deploy the Container App"
echo "  2. Or run 'azd deploy' if infrastructure is already provisioned"
