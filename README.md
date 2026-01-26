# 🦞 ClawdBot on Azure Container Apps

Deploy your personal AI assistant to Azure Container Apps with Discord integration. This sample shows how to run [ClawdBot](https://clawd.bot) - an open-source personal AI assistant - on Azure's serverless container platform.

## What You'll Get

- 🦞 **ClawdBot AI Assistant** running on Azure Container Apps
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
│  │  │                    ClawdBot Container App                          │  ││
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
│  │  Stores ClawdBot    │  │  Secure ACR access  │  │  Logs & metrics    │ │
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

The fastest way to deploy ClawdBot is using Azure Developer CLI (`azd`). This provisions all infrastructure, builds the container image, and deploys everything in one command.

### Step 1: Create Discord Bot (Do This First!)

Before deploying, you need a Discord bot token:

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application** → Name it (e.g., "ClawdBot-Azure")
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

### Step 2: Deploy with azd up

```bash
# Clone this sample
git clone https://github.com/Azure-Samples/clawdbot-azure-container-apps.git
cd clawdbot-azure-container-apps

# Login to Azure
azd auth login

# Deploy everything (you'll be prompted for values)
azd up
```

When prompted, enter:
- **Environment name**: e.g., `clawdbot-prod`
- **Azure subscription**: Select your subscription
- **Location**: e.g., `eastus2`
- **OpenRouter API Key**: Your key from [openrouter.ai/keys](https://openrouter.ai/keys)
- **Discord Bot Token**: The token from Step 1
- **Discord Allowed Users**: Your Discord user ID from Step 1

The deployment takes about 5-7 minutes and:
1. Creates Azure Container Registry
2. Builds ClawdBot from source (no local Docker needed!)
3. Creates Container Apps Environment
4. Deploys ClawdBot with all your configuration
5. Sets up monitoring via Log Analytics

### Step 3: Invite Bot to Server & Test

1. **Open the OAuth2 URL** from Step 1 to invite the bot to a server
2. **Find the bot** in the server's member list
3. **Right-click → Message** to start a DM
4. Send: `Hello!` 
5. Wait a few seconds for the response 🎉

### What Gets Deployed

| Resource | Purpose |
|----------|---------|
| Azure Container Registry | Stores your ClawdBot container image |
| Container Apps Environment | Hosting platform with built-in scaling |
| ClawdBot Container App | Your AI assistant (1 CPU, 2GB RAM) |
| Managed Identity | Secure passwordless access to ACR |
| Log Analytics Workspace | Logs and monitoring |
| Storage Account | Persistent data storage |

### Updating After Deployment

```bash
# Change configuration (e.g., add another Discord user)
azd env set DISCORD_ALLOWED_USERS "user1-id,user2-id"
azd deploy

# Update to latest ClawdBot version
azd deploy  # Rebuilds from source automatically
```

---

## Manual Deployment (Alternative)

If you prefer to deploy step-by-step without `azd`, follow these instructions:

### Step 1: Create Azure Resources

```bash
# Variables - customize these
RESOURCE_GROUP="rg-clawdbot"
LOCATION="eastus2"
ENVIRONMENT_NAME="cae-clawdbot"
ACR_NAME="crclawdbot$(openssl rand -hex 4)"  # Must be globally unique
IDENTITY_NAME="clawdbot-identity"
APP_NAME="clawdbot"

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

### Step 2: Build ClawdBot Image

ClawdBot must be built from source. We use Azure Container Registry Tasks (no local Docker required):

```bash
# Build the image in ACR (runs in the cloud)
az acr build \
  --registry $ACR_NAME \
  --image "clawdbot:v1" \
  --file src/clawdbot/Dockerfile \
  src/clawdbot/
```

This takes about 5 minutes. The build:
1. Clones ClawdBot from GitHub
2. Installs dependencies with pnpm
3. Builds the TypeScript application
4. Builds the Control UI
5. Copies our custom `entrypoint.sh` for Azure configuration

### Step 3: Create Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application** → Name it (e.g., "ClawdBot-Azure")
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
  --image "${ACR_NAME}.azurecr.io/clawdbot:v1" \
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
    "CLAWDBOT_GATEWAY_TOKEN=secretref:gateway-token" \
    "DISCORD_ALLOWED_USERS=$DISCORD_USER_ID" \
    "CLAWDBOT_MODEL=openrouter/anthropic/claude-3.5-sonnet" \
    "CLAWDBOT_PERSONA_NAME=Clawd" \
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
| `CLAWDBOT_GATEWAY_TOKEN` | ✅ | Random token for gateway authentication |
| `DISCORD_ALLOWED_USERS` | ✅ | Your Discord user ID (DM allowlist) |
| `CLAWDBOT_MODEL` | No | Model ID (default: `openrouter/anthropic/claude-3.5-sonnet`) |
| `CLAWDBOT_PERSONA_NAME` | No | Bot name (default: `Clawd`) |

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

### How the Entrypoint Works

The `entrypoint.sh` script dynamically generates ClawdBot's configuration from environment variables at container startup:

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
- Generates proper ClawdBot JSON config format

## Updating Your Bot

### Update Configuration

```bash
# Change model
az containerapp update --name $APP_NAME --resource-group $RESOURCE_GROUP \
  --set-env-vars "CLAWDBOT_MODEL=openrouter/anthropic/claude-3-opus"

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

### Update ClawdBot Version

```bash
# Rebuild with latest ClawdBot
az acr build --registry $ACR_NAME --image "clawdbot:v2" \
  --file src/clawdbot/Dockerfile src/clawdbot/

# Deploy new image
az containerapp update --name $APP_NAME --resource-group $RESOURCE_GROUP \
  --image "${ACR_NAME}.azurecr.io/clawdbot:v2"
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
ClawdBot configuration written to /home/node/.clawdbot/clawdbot.json
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
   az acr repository show-tags --name $ACR_NAME --repository clawdbot
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

Restrict who can access your ClawdBot gateway:

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

This makes ClawdBot accessible only from within your Azure VNet.

### Key Rotation

Rotate API keys without rebuilding:

```bash
# Rotate OpenRouter API key
az containerapp secret set --name clawdbot --resource-group $RESOURCE_GROUP \
  --secrets "openrouter-api-key=sk-or-v1-new-key"

# Restart to apply
REVISION=$(az containerapp show --name clawdbot --resource-group $RESOURCE_GROUP \
  --query "properties.latestRevisionName" -o tsv)
az containerapp revision restart --name clawdbot --resource-group $RESOURCE_GROUP \
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

1. **ClawdBot requires config file, not just env vars** - The gateway reads from `~/.clawdbot/clawdbot.json`, so we need an entrypoint script to generate it from environment variables.

2. **Config schema matters** - Use `agents.defaults` and `agents.list[].identity`, not the legacy `agent` and `identity` format.

3. **Model IDs must be exact** - `claude-3.5-sonnet` exists, but `claude-sonnet-4-5` does not. Check OpenRouter for current model names.

4. **Discord requires shared server** - You can't DM a Discord bot unless you share at least one server with it.

5. **Secrets need restart** - After updating Container App secrets, you must restart the revision for changes to take effect.

## Resources

- [ClawdBot Documentation](https://docs.clawd.bot)
- [ClawdBot Discord Channel Setup](https://docs.clawd.bot/channels/discord)
- [ClawdBot Model Providers](https://docs.clawd.bot/concepts/model-providers)
- [OpenRouter API](https://openrouter.ai)
- [Azure Container Apps Documentation](https://learn.microsoft.com/azure/container-apps)

---

> 🦞 Built with ClawdBot. Questions? Check [docs.clawd.bot](https://docs.clawd.bot)
