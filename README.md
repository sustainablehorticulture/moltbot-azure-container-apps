# 🦞 MoltBot on Azure Container Apps

Deploy your personal AI assistant to Azure Container Apps with Discord integration. This sample shows how to run [MoltBot](https://molt.bot) - an open-source personal AI assistant - on Azure's serverless container platform.

## What You'll Get

- 🦞 **MoltBot AI Assistant** running on Azure Container Apps
- 💬 **Discord Integration** - Chat with your AI via Discord DMs
- 🔐 **Secure by Default** - Gateway token authentication + DM allowlist
- 📊 **Azure Monitoring** - Full observability via Log Analytics

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Azure Resource Group                               │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                  Azure Container Apps Environment                       ││
│  │                                                                         ││
│  │  ┌───────────────────────────────────────────────────────────────────┐  ││
│  │  │                    MoltBot Container App                          │  ││
│  │  │                                                                    │  ││
│  │  │  • Gateway (port 18789)          • Discord Bot Connection         │  ││
│  │  │  • Control UI (web chat)         • OpenRouter API Integration     │  ││
│  │  │  • Dynamic Config Generation     • DM Allowlist Security          │  ││
│  │  └───────────────────────────────────────────────────────────────────┘  ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐ │
│  │  Container Registry │  │   Managed Identity  │  │  Log Analytics     │ │
│  │                     │  │                     │  │                     │ │
│  │  Stores MoltBot    │  │  Secure ACR access  │  │  Logs & metrics    │ │
│  │  container image    │  │  (no passwords!)    │  │  for monitoring    │ │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Prerequisites

- ✅ Azure subscription with Contributor access
- ✅ [Azure Developer CLI (azd)](https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd) installed
- ✅ [Azure CLI](https://docs.microsoft.com/cli/azure/install-azure-cli) installed
- ✅ [OpenRouter API key](https://openrouter.ai/keys) for LLM access
- ✅ Discord account for bot creation

## One-Click Deployment with azd

The fastest way to deploy MoltBot is using Azure Developer CLI (`azd`). This provisions all infrastructure, builds the container image, and deploys everything in one command.

### Step 1: Create Discord Bot (Do This First!)

Before deploying, you need a Discord bot token:

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application** → Name it (e.g., "MoltBot-Azure")
3. Go to **Bot** → Click **Add Bot** (or **Reset Token** if exists)
4. Enable these **Privileged Gateway Intents**:
   - ✅ Message Content Intent
   - ✅ Server Members Intent
5. Click **Reset Token** → **Copy the bot token** (save it!)
6. Go to **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Send Messages`, `Read Message History`, `View Channels`
7. **Copy the generated OAuth2 URL** - you'll need this to invite the bot later

**Get Your Discord User ID:**
1. In Discord: Settings → Advanced → Enable **Developer Mode**
2. Right-click your username → **Copy User ID**

### Step 2: Provision Infrastructure

```bash
# Clone this sample
git clone https://github.com/BandaruDheeraj/moltbot-azure-container-apps.git
cd moltbot-azure-container-apps

# Login to Azure
azd auth login

# Provision infrastructure (creates ACR, Container Apps Environment, etc.)
azd provision
```

When prompted, enter:
- **Environment name**: e.g., `MoltBot-prod`
- **Azure subscription**: Select your subscription
- **Location**: e.g., `eastus2`

### Step 3: Build the Container Image

**⚠️ Required before deploying.** The container image must exist in ACR first.

```bash
# Get your ACR name
ACR_NAME=$(az acr list --resource-group rg-MoltBot-prod --query "[0].name" -o tsv)

# Build the image in Azure (no local Docker needed!)
az acr build --registry $ACR_NAME --image "MoltBot:latest" --file src/MoltBot/Dockerfile src/MoltBot/
```

**Understanding this command:**
- `--registry $ACR_NAME` - Build in your ACR (in the cloud)
- `--image "MoltBot:latest"` - Name the output image (we choose this name)
- `--file src/MoltBot/Dockerfile` - Use the Dockerfile from this repo
- `src/MoltBot/` - Send this folder as build context

This takes about 3-5 minutes. The Dockerfile automatically:
1. Clones the official [MoltBot source](https://github.com/MoltBot/MoltBot) from GitHub
2. Installs dependencies and builds the app
3. Adds our custom `entrypoint.sh` for Azure configuration

> **Note:** You don't need to download MoltBot separately - it's pulled fresh during the build. The resulting image is stored in your ACR as `MoltBot:latest`.

### Step 4: Configure Your Credentials

```bash
# Set your required secrets
azd env set OPENROUTER_API_KEY "sk-or-v1-your-key-here"
azd env set DISCORD_BOT_TOKEN "your-discord-bot-token"
azd env set DISCORD_ALLOWED_USERS "your-discord-user-id"
```

**Where to get these values:**

| Variable | Where to Get It |
|----------|-----------------|
| `OPENROUTER_API_KEY` | [openrouter.ai/keys](https://openrouter.ai/keys) |
| `DISCORD_BOT_TOKEN` | Discord Developer Portal → Your App → Bot → Reset Token |
| `DISCORD_ALLOWED_USERS` | Discord → Settings → Advanced → Developer Mode → Right-click username → Copy User ID |

**Optional settings:**

```bash
azd env set MOLTBOT_MODEL "openrouter/anthropic/claude-3.5-sonnet"
azd env set MOLTBOT_PERSONA_NAME "Clawd"
azd env set ALLOWED_IP_RANGES "1.2.3.4/32"  # IP restrictions
azd env set ALERT_EMAIL_ADDRESS "your-email@example.com"
```

### Step 5: Deploy the Application

```bash
azd deploy
```

### Step 6: Invite Bot to Server & Test

1. **Open the OAuth2 URL** from Step 1 to invite the bot to a server
2. **Find the bot** in the server's member list
3. **Right-click → Message** to start a DM
4. Send: `Hello!` 
5. Wait a few seconds for the response 🎉

### What Gets Deployed

| Resource | Purpose |
|----------|---------|
| Azure Container Registry | Stores your MoltBot container image |
| Container Apps Environment | Hosting platform with built-in scaling |
| MoltBot Container App | Your AI assistant (1 CPU, 2GB RAM) |
| Managed Identity | Secure passwordless access to ACR |
| Log Analytics Workspace | Logs and monitoring |
| Storage Account | Persistent data storage |

### Updating After Deployment

```bash
# Change configuration (e.g., add another Discord user)
azd env set DISCORD_ALLOWED_USERS "user1-id,user2-id"
azd deploy

# Rebuild image with latest MoltBot
az acr build --registry $ACR_NAME --image "MoltBot:latest" --file src/MoltBot/Dockerfile src/MoltBot/
azd deploy
```

---

## Manual Deployment (Alternative)

If you prefer to deploy step-by-step without `azd`, follow these instructions:

### Step 1: Create Azure Resources

```bash
# Variables - customize these
RESOURCE_GROUP="rg-MoltBot"
LOCATION="eastus2"
ENVIRONMENT_NAME="cae-MoltBot"
ACR_NAME="crMoltBot$(openssl rand -hex 4)"  # Must be globally unique
IDENTITY_NAME="MoltBot-identity"
APP_NAME="MoltBot"

# Create resource group
az group create --name $RESOURCE_GROUP --location $LOCATION

# Create Azure Container Registry
az acr create --resource-group $RESOURCE_GROUP --name $ACR_NAME --sku Basic

# Create User-Assigned Managed Identity
az identity create --resource-group $RESOURCE_GROUP --name $IDENTITY_NAME

# Get identity details
IDENTITY_ID=$(az identity show --resource-group $RESOURCE_GROUP --name $IDENTITY_NAME --query id -o tsv)
IDENTITY_CLIENT_ID=$(az identity show --resource-group $RESOURCE_GROUP --name $IDENTITY_NAME --query clientId -o tsv)
IDENTITY_PRINCIPAL_ID=$(az identity show --resource-group $RESOURCE_GROUP --name $IDENTITY_NAME --query principalId -o tsv)

# Grant identity access to ACR
ACR_ID=$(az acr show --resource-group $RESOURCE_GROUP --name $ACR_NAME --query id -o tsv)
az role assignment create --assignee $IDENTITY_PRINCIPAL_ID --role AcrPull --scope $ACR_ID

# Create Container Apps Environment
az containerapp env create \
  --name $ENVIRONMENT_NAME \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION
```

### Step 2: Build MoltBot Image

MoltBot must be built from source. We use Azure Container Registry Tasks (no local Docker required):

```bash
# Build the image in ACR (runs in the cloud)
az acr build \
  --registry $ACR_NAME \
  --image "MoltBot:v1" \
  --file src/MoltBot/Dockerfile \
  src/MoltBot/
```

This takes about 5 minutes. The build:
1. Clones MoltBot from GitHub
2. Installs dependencies with pnpm
3. Builds the TypeScript application
4. Builds the Control UI
5. Copies our custom `entrypoint.sh` for Azure configuration

### Step 3: Create Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application** → Name it (e.g., "MoltBot-Azure")
3. Go to **Bot** → Click **Add Bot**
4. Enable these **Privileged Gateway Intents**:
   - ✅ Message Content Intent
   - ✅ Server Members Intent
5. Click **Reset Token** → Copy the bot token (save it securely!)
6. Go to **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Send Messages`, `Read Message History`, `View Channels`
7. Copy the generated URL and open it to invite the bot to your server

**Get Your Discord User ID:**
1. In Discord: Settings → Advanced → Enable **Developer Mode**
2. Right-click your username → **Copy User ID**

### Step 4: Generate Gateway Token

```bash
# Generate a secure random token for gateway authentication
GATEWAY_TOKEN=$(openssl rand -hex 16)
echo "Gateway Token: $GATEWAY_TOKEN"
# Save this! You'll need it for the Control UI
```

### Step 5: Create Container App with Secrets

```bash
# Set your actual values here
OPENROUTER_API_KEY="sk-or-v1-your-key-here"
DISCORD_BOT_TOKEN="your-discord-bot-token"
DISCORD_USER_ID="your-discord-user-id"

# Create the Container App with secrets
az containerapp create \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --environment $ENVIRONMENT_NAME \
  --image "${ACR_NAME}.azurecr.io/MoltBot:v1" \
  --registry-server "${ACR_NAME}.azurecr.io" \
  --registry-identity $IDENTITY_ID \
  --user-assigned $IDENTITY_ID \
  --target-port 18789 \
  --ingress external \
  --min-replicas 1 \
  --max-replicas 1 \
  --cpu 1.0 \
  --memory 2Gi \
  --secrets \
    "openrouter-api-key=$OPENROUTER_API_KEY" \
    "discord-bot-token=$DISCORD_BOT_TOKEN" \
    "gateway-token=$GATEWAY_TOKEN" \
  --env-vars \
    "OPENROUTER_API_KEY=secretref:openrouter-api-key" \
    "DISCORD_BOT_TOKEN=secretref:discord-bot-token" \
    "MOLTBOT_GATEWAY_TOKEN=secretref:gateway-token" \
    "DISCORD_ALLOWED_USERS=$DISCORD_USER_ID" \
    "MOLTBOT_MODEL=openrouter/anthropic/claude-3.5-sonnet" \
    "MOLTBOT_PERSONA_NAME=Clawd" \
    "GATEWAY_PORT=18789" \
    "NODE_ENV=production"
```

### Step 6: Get Your Bot URL

```bash
# Get the Container App URL
az containerapp show --name $APP_NAME --resource-group $RESOURCE_GROUP --query "properties.configuration.ingress.fqdn" -o tsv
```

## Testing Your Bot

### Via Discord (Recommended)

**Important:** Discord requires you to share a server with the bot before you can DM it.

1. **Create or use an existing Discord server** where you can add the bot
2. **Invite the bot** using the OAuth2 URL you generated earlier:
   ```
   https://discord.com/oauth2/authorize?client_id=<BOT_USER_ID>&permissions=274877991936&scope=bot%20applications.commands
   ```
3. **Find the bot** in the server's member list (right sidebar)
4. **Right-click the bot → Message** to open a DM
5. Send: `Hello!`
6. Wait a few seconds for the response

### Via Control UI (Web Chat)

The Control UI is available but shows "pairing required" by default. Discord DMs are the primary interface.

To access the Control UI:
```
https://<your-app-url>/?token=<your-gateway-token>
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | ✅ | OpenRouter API key for LLM access |
| `DISCORD_BOT_TOKEN` | ✅ | Discord bot token from Developer Portal |
| `MOLTBOT_GATEWAY_TOKEN` | ✅ | Random token for gateway authentication |
| `DISCORD_ALLOWED_USERS` | ✅ | Your Discord user ID (DM allowlist) |
| `MOLTBOT_MODEL` | No | Model ID (default: `openrouter/anthropic/claude-3.5-sonnet`) |
| `MOLTBOT_PERSONA_NAME` | No | Bot name (default: `Clawd`) |

### Security Parameters (azd)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `ALLOWED_IP_RANGES` | (empty) | Comma-separated CIDR blocks allowed to access the gateway (e.g., `1.2.3.4/32,10.0.0.0/8`) |
| `INTERNAL_ONLY` | `false` | Deploy with no public ingress (VNet-only access) |
| `ENABLE_ALERTS` | `true` | Deploy Azure Monitor alerts for security events |
| `ALERT_EMAIL_ADDRESS` | (empty) | Email for alert notifications |

**Enable IP restrictions:**
```bash
azd env set ALLOWED_IP_RANGES "1.2.3.4/32"
azd deploy
```

**Enable email alerts:**
```bash
azd env set ALERT_EMAIL_ADDRESS "security@example.com"
azd deploy
```

### Supported Models (via OpenRouter)

| Model | ID |
|-------|-----|
| Claude 3.5 Sonnet | `openrouter/anthropic/claude-3.5-sonnet` |
| Claude 3 Opus | `openrouter/anthropic/claude-3-opus` |
| GPT-4 Turbo | `openrouter/openai/gpt-4-turbo` |
| Gemini Pro | `openrouter/google/gemini-pro` |

**⚠️ Important:** Model IDs must use the exact format shown. For example:
- ✅ `openrouter/anthropic/claude-3.5-sonnet`
- ❌ `openrouter/anthropic/claude-sonnet-4-5` (doesn't exist)

See [OpenRouter Models](https://openrouter.ai/models) for the full list.

### Alternative: Azure AI Foundry

This sample uses **OpenRouter** for simplicity, but you can also use **Azure AI Foundry** (formerly Azure OpenAI Service) for enhanced security and compliance:

| Feature | OpenRouter | Azure AI Foundry |
|---------|:----------:|:----------------:|
| Data residency | Third-party | Your Azure subscription |
| Private networking | ❌ Public API | ✅ Private Endpoints |
| Managed Identity | ❌ API key only | ✅ Passwordless auth |

**Integration Status:** Azure AI Foundry works with MoltBot but requires a proxy like [LiteLLM](https://github.com/BerriAI/litellm) because Azure OpenAI uses a different auth format (`api-key` header instead of `Authorization: Bearer`).

**Quick Setup with LiteLLM:**
```bash
# Run LiteLLM proxy for Azure OpenAI
pip install litellm
export AZURE_API_KEY="<your-key>"
export AZURE_API_BASE="https://<resource>.openai.azure.com"
litellm --model azure/<deployment-name> --port 4000

# Configure MoltBot to use LiteLLM (in moltbot.json)
# "models": { "providers": { "azure-proxy": { "baseUrl": "http://localhost:4000/v1" } } }
```

See the [blog post](./blog-post.md#-alternative-azure-ai-foundry) for detailed Azure AI Foundry configuration instructions.

### How the Entrypoint Works

The `entrypoint.sh` script dynamically generates MoltBot's configuration from environment variables at container startup:

```json
{
  "agents": {
    "defaults": {
      "model": { "primary": "openrouter/anthropic/claude-3.5-sonnet" }
    },
    "list": [{ "id": "main", "identity": { "name": "Clawd" } }]
  },
  "channels": {
    "discord": {
      "enabled": true,
      "dm": { "policy": "allowlist", "allowFrom": ["your-user-id"] }
    }
  },
  "gateway": {
    "auth": { "mode": "token", "token": "<your-gateway-token>" }
  }
}
```

This approach:
- Keeps secrets out of the container image
- Allows configuration changes without rebuilding
- Generates proper MoltBot JSON config format

## Updating Your Bot

### Update Configuration

```bash
# Change model
az containerapp update --name $APP_NAME --resource-group $RESOURCE_GROUP \
  --set-env-vars "MOLTBOT_MODEL=openrouter/anthropic/claude-3-opus"

# Add another allowed Discord user
az containerapp update --name $APP_NAME --resource-group $RESOURCE_GROUP \
  --set-env-vars "DISCORD_ALLOWED_USERS=user1-id,user2-id"
```

### Update Secrets

```bash
# Update API key
az containerapp secret set --name $APP_NAME --resource-group $RESOURCE_GROUP \
  --secrets "openrouter-api-key=sk-or-v1-new-key"

# Restart to apply secret changes
REVISION=$(az containerapp show --name $APP_NAME --resource-group $RESOURCE_GROUP --query "properties.latestRevisionName" -o tsv)
az containerapp revision restart --name $APP_NAME --resource-group $RESOURCE_GROUP --revision $REVISION
```

### Update MoltBot Version

```bash
# Rebuild with latest MoltBot
az acr build --registry $ACR_NAME --image "MoltBot:v2" \
  --file src/MoltBot/Dockerfile src/MoltBot/

# Deploy new image
az containerapp update --name $APP_NAME --resource-group $RESOURCE_GROUP \
  --image "${ACR_NAME}.azurecr.io/MoltBot:v2"
```

## Monitoring

### View Logs

```bash
# Stream live logs
az containerapp logs show --name $APP_NAME --resource-group $RESOURCE_GROUP \
  --follow --tail 50 --type console

# Check for errors
az containerapp logs show --name $APP_NAME --resource-group $RESOURCE_GROUP \
  --tail 100 --type console | grep -i error
```

### What to Look For

✅ **Healthy startup:**
```
Discord channel configured: yes (DM allowlist: 123456789)
MoltBot configuration written to /home/node/.MoltBot/MoltBot.json
Gateway token configured: yes
[discord] logged in to discord as 987654321
[gateway] agent model: openrouter/anthropic/claude-3.5-sonnet
[gateway] listening on ws://0.0.0.0:18789
```

❌ **Common errors:**
- `Unknown model: ...` - Check the model ID format (must be exact)
- `HTTP 401: authentication_error` - Invalid API key
- `[discord] channel exited` - Invalid Discord bot token

## Troubleshooting

### Bot doesn't respond in Discord

1. **Check logs** for errors:
   ```bash
   az containerapp logs show --name $APP_NAME --resource-group $RESOURCE_GROUP --tail 50
   ```

2. **Verify Discord connection:**
   Look for: `[discord] logged in to discord as <bot-id>`

3. **Check DM allowlist:** 
   Make sure your Discord user ID is in `DISCORD_ALLOWED_USERS`

4. **Verify model format:** 
   Must be exactly `openrouter/anthropic/claude-3.5-sonnet` (not variations like `claude-sonnet-4-5`)

### "Unknown model" Error

The model ID format is very specific. Common mistakes:
- ❌ `anthropic/claude-sonnet-4-5` → Model doesn't exist
- ❌ `openrouter:anthropic/claude-3.5-sonnet` → Wrong prefix format
- ✅ `openrouter/anthropic/claude-3.5-sonnet` → Correct!

### API Authentication Errors (401)

1. Verify your OpenRouter API key at [openrouter.ai/keys](https://openrouter.ai/keys)
2. Check the key has credits available
3. Update the secret:
   ```bash
   az containerapp secret set --name $APP_NAME --resource-group $RESOURCE_GROUP \
     --secrets "openrouter-api-key=sk-or-v1-correct-key"
   ```
4. Restart the container to apply

### Container won't start

1. Check if image exists:
   ```bash
   az acr repository show-tags --name $ACR_NAME --repository MoltBot
   ```

2. Verify managed identity has ACR pull permission:
   ```bash
   az role assignment list --assignee $IDENTITY_PRINCIPAL_ID --scope $ACR_ID
   ```

### Can't DM the bot

Discord requires bots and users to share at least one server:
1. Create a private Discord server (just for you and the bot)
2. Invite the bot using the OAuth2 URL
3. Now you can DM the bot

## Security

This deployment addresses common security concerns raised by the community:

### Security Features Included

| Concern | How ACA Addresses It |
|---------|---------------------|
| **1. Close ports / IP allowlist** | ✅ Built-in ingress IP restrictions via `ALLOWED_IP_RANGES` |
| **2. Auth (strong secret + TLS)** | ✅ Gateway token auth + automatic HTTPS certificates |
| **3. Rotate keys** | ✅ `az containerapp secret set` + restart |
| **4. Rate limit + logs + alerts** | ✅ Log Analytics + 4 preconfigured Azure Monitor alerts |

### Preconfigured Security Alerts

The deployment includes four Azure Monitor alerts (enabled by default):

| Alert | Trigger | Indicates |
|-------|---------|-----------|
| **High Error Rate** | >10 auth errors in 5 min | Brute force attack |
| **Container Restarts** | >3 restarts in 15 min | Crash or OOM attack |
| **Unusual Activity** | >100 messages/hour | Abuse |
| **Channel Disconnect** | Discord goes offline | Token issue |

### Enable IP Restrictions

Restrict who can access your MoltBot gateway:

```bash
# Only allow specific IPs (e.g., your home + VPN)
azd env set ALLOWED_IP_RANGES "1.2.3.4/32,10.0.0.0/8"
azd deploy
```

### Enable Internal-Only Access

For maximum security, deploy with no public ingress:

```bash
azd env set INTERNAL_ONLY "true"
azd deploy
```

This makes MoltBot accessible only from within your Azure VNet.

### Key Rotation

Rotate API keys without rebuilding:

```bash
# Rotate OpenRouter API key
az containerapp secret set --name MoltBot --resource-group $RESOURCE_GROUP \
  --secrets "openrouter-api-key=sk-or-v1-new-key"

# Restart to apply
REVISION=$(az containerapp show --name MoltBot --resource-group $RESOURCE_GROUP \
  --query "properties.latestRevisionName" -o tsv)
az containerapp revision restart --name MoltBot --resource-group $RESOURCE_GROUP \
  --revision $REVISION
```

### Security Comparison: ACA vs Other Platforms

| Feature | Azure Container Apps | VPS (Hetzner/DO) | Home Server |
|---------|:--------------------:|:----------------:|:-----------:|
| IP Restrictions | ✅ Built-in | ⚠️ Manual iptables | ⚠️ Manual |
| Automatic TLS | ✅ Free certs | ❌ Manual | ❌ Manual |
| Secrets Management | ✅ Native | ❌ .env files | ❌ .env files |
| Security Alerts | ✅ Azure Monitor | ❌ Self-built | ❌ None |
| Container Isolation | ✅ Hyper-V | ⚠️ Shared kernel | ❌ None |
| Compliance | ✅ SOC2/ISO/HIPAA | ❌ None | ❌ None |

## Estimated Costs

| Resource | Monthly Cost |
|----------|--------------|
| Container Apps (1 CPU, 2GB RAM, always-on) | ~$30-50 |
| Container Registry (Basic) | ~$5 |
| Log Analytics (1GB ingestion) | ~$2-5 |
| **Total** | **~$40-60/month** |

**Cost Optimization:**
- Scale to 0 replicas when not in use (note: breaks Discord connection)
- Use a smaller/cheaper model via OpenRouter
- Monitor usage in Azure Portal

## Clean Up

```bash
# Delete everything
az group delete --name $RESOURCE_GROUP --yes --no-wait
```

## Key Learnings from This Deployment

During the development of this sample, we discovered several important details:

1. **MoltBot requires config file, not just env vars** - The gateway reads from `~/.MoltBot/MoltBot.json`, so we need an entrypoint script to generate it from environment variables.

2. **Config schema matters** - Use `agents.defaults` and `agents.list[].identity`, not the legacy `agent` and `identity` format.

3. **Model IDs must be exact** - `claude-3.5-sonnet` exists, but `claude-sonnet-4-5` does not. Check OpenRouter for current model names.

4. **Discord requires shared server** - You can't DM a Discord bot unless you share at least one server with it.

5. **Secrets need restart** - After updating Container App secrets, you must restart the revision for changes to take effect.

## Resources

- [MoltBot Documentation](https://docs.molt.bot)
- [MoltBot Discord Channel Setup](https://docs.molt.bot/channels/discord)
- [MoltBot Model Providers](https://docs.molt.bot/concepts/model-providers)
- [OpenRouter API](https://openrouter.ai)
- [Azure Container Apps Documentation](https://learn.microsoft.com/azure/container-apps)

---

> 🦞 Built with MoltBot. Questions? Check [docs.molt.bot](https://docs.molt.bot)
