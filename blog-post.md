---
title: "Deploy MoltBot to Azure Container Apps: Your 24/7 AI Assistant in 30 Minutes"
date: "2026-01-26"
slug: "deploy-moltbot-azure-container-apps"
category: "Technology"
tags: ["Azure", "Container Apps", "MoltBot", "AI Assistant", "Serverless", "Claude", "Open Source"]
excerpt: "Deploy MoltBot - the open-source personal AI assistant - on Azure Container Apps with a single command. Get built-in security features, automatic TLS, and 24/7 operation for ~$40-60/month."
metaDescription: "Complete guide to deploying MoltBot on Azure Container Apps. One-click deployment with azd up, built-in security features, and cost-efficient 24/7 AI assistant hosting."
author: "Dheeraj Bandaru"
---

# 🦞 Deploy MoltBot to Azure Container Apps: Your 24/7 AI Assistant in 30 Minutes

---

## ⚡ TL;DR

MoltBot is an open-source personal AI assistant that runs 24/7 and communicates through Discord, Telegram, WhatsApp, and more. This guide shows you how to deploy it on Azure Container Apps with a single command (`azd up`), with built-in security features like automatic TLS, secrets management, and IP restrictions.

> **🚀 The Quick Version:** Create a Discord bot, clone the repo, run `azd up`, invite bot to server, start chatting. Total time: ~25 minutes. Total cost: ~$40-60/month.

**Why Azure Container Apps over other options?**
- ✅ **Managed Identity** - No credentials in config files
- ✅ **Built-in Secrets** - API keys never exposed in logs
- ✅ **Automatic HTTPS** - Free TLS certificates
- ✅ **Hyper-V Isolation** - Hardware-level container security
- ✅ **Compliance Ready** - SOC2, ISO, HIPAA certifications

---

## 🤖 What is MoltBot?

If you've ever wanted a personal AI assistant that *actually does things* - not just answers questions - MoltBot is for you. Created by Peter Steinberger and a growing open-source community, MoltBot is a personal AI assistant that:

| Capability | Description |
|------------|-------------|
| 🔄 **Runs 24/7** | On your own infrastructure, always available |
| 💬 **Multi-channel** | Telegram, Discord, WhatsApp, Slack, iMessage, and more |
| 🧠 **Persistent memory** | Remembers your preferences and context across sessions |
| ⚙️ **Task execution** | Autonomously clears inboxes, deploys code, manages files |
| 📚 **Skill learning** | Creates reusable "skills" that you teach it |

> 💡 **Think of it as:** A very capable coworker who never sleeps, works for pennies per hour, and gets better over time.

---

### 🌟 Why People Are Excited

The community response has been remarkable:

> **🏢 "It's running my company."** — @therno

> **🎯 "After years of AI hype, I thought nothing could faze me. Then I installed @MoltBot. From nervous 'hi what can you do?' to full throttle - design, code review, taxes, PM, content pipelines..."** — @lycfyi

> **☕ "Me reading about @MoltBot: 'this looks complicated' 😅 me 30 mins later: controlling Gmail, Calendar, WordPress, Hetzner from Telegram like a boss. Smooth as single malt."** — @Abhay08

> **🔮 "Using @MoltBot for a week and it genuinely feels like early AGI. The gap between 'what I can imagine' and 'what actually works' has never been smaller."** — @tobi_bsf

---

## ☁️ Why Azure Container Apps?

The original setup guide for MoltBot uses AWS EC2, but Azure Container Apps offers significant advantages for running a 24/7 AI assistant - especially around security.

---

### 🔐 Security Posture Comparison

When deploying a personal AI assistant that can execute code, access APIs, and potentially connect to sensitive services, security isn't optional. Here's how Azure Container Apps compares to other popular deployment options:

| Security Feature | Azure Container Apps | AWS EC2 | DigitalOcean Droplet | Home Server | Hetzner VPS |
|-----------------|:--------------------:|:-------:|:--------------------:|:-----------:|:-----------:|
| **Managed Identity (passwordless auth)** | ✅ Native | ⚠️ IAM roles | ❌ Manual | ❌ N/A | ❌ Manual |
| **Secrets Management** | ✅ Built-in secrets | ⚠️ SSM Parameter Store | ❌ Env vars | ❌ .env files | ❌ .env files |
| **VNet Integration** | ✅ Native | ✅ VPC | ⚠️ Limited | ❌ N/A | ❌ N/A |
| **Private Endpoints** | ✅ Supported | ✅ PrivateLink | ❌ No | ❌ N/A | ❌ N/A |
| **Automatic TLS/HTTPS** | ✅ Free, auto-renewed | ❌ Manual (ACM + ALB) | ❌ Manual (Let's Encrypt) | ❌ Manual | ❌ Manual |
| **DDoS Protection** | ✅ Azure DDoS | ✅ Shield (extra $) | ⚠️ Basic | ❌ None | ⚠️ Basic |
| **Compliance Certifications** | ✅ SOC2, ISO, HIPAA | ✅ SOC2, ISO, HIPAA | ⚠️ SOC2 only | ❌ None | ❌ None |
| **RBAC (Role-Based Access)** | ✅ Azure RBAC | ✅ IAM | ⚠️ Teams | ❌ N/A | ❌ N/A |
| **Audit Logging** | ✅ Log Analytics | ✅ CloudTrail | ⚠️ Basic | ❌ Manual | ❌ Manual |
| **Container Isolation** | ✅ Hyper-V | ✅ Firecracker | ⚠️ Shared kernel | ❌ None | ⚠️ Shared kernel |
| **Network Policies** | ✅ Native | ⚠️ Security Groups | ⚠️ Firewall | ❌ Manual iptables | ⚠️ Firewall |
| **Vulnerability Scanning** | ✅ Defender for Cloud | ✅ Inspector | ❌ Manual | ❌ Manual | ❌ Manual |

#### 🛡️ Why Security Matters for AI Assistants

MoltBot isn't just a chatbot - it can:
- **Execute shell commands** on the container
- **Access external APIs** with your credentials
- **Store conversation history** including potentially sensitive information
- **Connect to messaging platforms** with bot tokens

This makes security architecture critical. Let's break down the key advantages:

#### 1. Managed Identity: Zero Secrets in Code

**Azure Container Apps:**
```bicep
// No credentials needed - Azure handles auth automatically
identity: {
  type: 'UserAssigned'
  userAssignedIdentities: { '${managedIdentity.id}': {} }
}
```

**Other platforms:** Require storing access keys in environment variables or config files, creating potential leak vectors.

#### 2. Secrets Management: First-Class Support

**Azure Container Apps:**
```bash
# Secrets stored securely, referenced by name
az containerapp secret set --name MoltBot --secrets "api-key=$MY_KEY"
# Used as: secretRef: 'api-key'
```

**Other platforms:** Secrets typically live in `.env` files on disk, visible to anyone with SSH access.

#### 3. Network Isolation: VNet by Default

Azure Container Apps can be deployed into a VNet with:
- **Private ingress only** - no public IP
- **Private Endpoints** for Azure services
- **Network Security Groups** for fine-grained control
- **Service Endpoints** for secure storage access

This means your MoltBot can be completely isolated from the public internet while still connecting to your messaging channels.

#### 4. Container Runtime Security

Azure Container Apps runs on **Hyper-V isolated containers**, providing:
- Kernel-level isolation between workloads
- No shared kernel vulnerabilities
- Hardware-backed security boundaries

Compare this to standard Docker on VPS providers where containers share the host kernel.

#### 5. Compliance Ready

Azure Container Apps inherits Azure's compliance certifications (if relevant to your use case):
- SOC 2 Type II
- ISO 27001, 27017, 27018
- HIPAA BAA available
- FedRAMP High
- PCI DSS

This matters when MoltBot handles sensitive business data or connects to regulated systems.

---

### 💰 Cost Comparison

| Platform | Monthly Cost | What You Get |
|----------|:------------:|--------------|
| 🟠 AWS EC2 (t3.medium) | ~$30-40 | Fixed VM, you manage everything |
| 🔵 **Azure Container Apps** | **~$40-60** | **Managed platform, auto-scaling, built-in HTTPS** |
| 🍎 Running on your Mac | $0 + electricity | Works, but must stay on 24/7 |
| 💬 ChatGPT Plus | $20/month | Easy to use | Can't execute tasks |
| 🤖 Claude Max | $100-200/month | Great model | Can't run 24/7 autonomously |

---

### 🏆 Why Container Apps Wins

| Benefit | Description |
|---------|-------------|
| 🔧 **Zero Maintenance** | No VMs to patch, no Kubernetes to manage |
| 📈 **Auto-scaling** | Scales to zero when idle, scales up under load |
| 🔒 **Built-in HTTPS** | Automatic TLS certificates from Azure |
| 📊 **Integrated Monitoring** | Logs flow to Azure Log Analytics automatically |
| 🛡️ **Security Features** | Managed Identity, VNet integration, Private Endpoints |
| 🌍 **Global Reach** | Deploy to any Azure region worldwide |

---

## 🚀 The 30-Minute Setup

### 📋 Prerequisites

Before you start, you'll need:

| Requirement | Link |
|-------------|------|
| ✅ Azure subscription | Free tier works for testing |
| ✅ Azure CLI | [Install here](https://docs.microsoft.com/cli/azure/install-azure-cli) |
| ✅ Azure Developer CLI (azd) | [Install here](https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd) |
| ✅ OpenRouter API Key | [openrouter.ai/keys](https://openrouter.ai/keys) (recommended) |
| ✅ Discord Account | For bot creation |

> **💡 Why OpenRouter?** OpenRouter provides access to multiple AI models (Claude, GPT-4, Gemini) through a single API. It's the recommended provider for MoltBot on Azure.

---

### 0️⃣ Create Your Discord Bot First! (5 minutes)

**⚠️ Important:** Do this before running `azd up` - you'll need the bot token during deployment.

| Step | Action |
|:----:|--------|
| 1 | Go to [Discord Developer Portal](https://discord.com/developers/applications) |
| 2 | Click **New Application** → Name it (e.g., "MoltBot-Azure") |
| 3 | Go to **Bot** → Click **Add Bot** |
| 4 | Enable **Privileged Gateway Intents**: Message Content ✅, Server Members ✅ |
| 5 | Click **Reset Token** → **Copy the bot token** (save it securely!) |
| 6 | Go to **OAuth2 → URL Generator** |
| 7 | Select Scopes: `bot`, `applications.commands` |
| 8 | Select Permissions: `Send Messages`, `Read Message History`, `View Channels` |
| 9 | **Copy the generated OAuth2 URL** (you'll need this to invite the bot) |

**Get Your Discord User ID:**

| Step | Action |
|:----:|--------|
| 1 | In Discord: **Settings → Advanced → Enable Developer Mode** |
| 2 | Right-click your username → **Copy User ID** |

> **🔐 Security Note:** The Discord User ID is used for the DM allowlist. Only users in this list can message your bot directly.

---

### 1️⃣ Get the Sample (2 minutes)

Clone the deployment template:

```bash
git clone https://github.com/BandaruDheeraj/moltbot-azure-container-apps
cd moltbot-azure-container-apps
```

---

### 2️⃣ Provision Infrastructure (5-7 minutes)

Run the initial provisioning:

```bash
azd provision
```

You'll be prompted for:

| Prompt | What to Enter |
|--------|---------------|
| **Environment name** | `MoltBot-prod` |
| **Azure subscription** | Select from your list |
| **Azure location** | `eastus2` (recommended) |

> **Note:** `azd provision` creates the Azure infrastructure without deploying the app. We need to build the image first.

This creates:

| Step | What Happens |
|:----:|--------------|
| 1️⃣ | Creates a Resource Group |
| 2️⃣ | Deploys Azure Container Registry |
| 3️⃣ | Sets up Azure Storage for persistent data |
| 4️⃣ | Creates a Container Apps Environment |
| 5️⃣ | Configures Log Analytics for monitoring |

---

### 2.5️⃣ Build the Container Image (Required - 3-5 minutes)

**⚠️ This must be done before deploying the app.** The container image needs to exist in ACR before the Container App can pull it.

```bash
# Get your ACR name from the provisioned resources
ACR_NAME=$(az acr list --resource-group rg-MoltBot-prod --query "[0].name" -o tsv)

# Build the image in Azure Container Registry (no local Docker needed!)
az acr build --registry $ACR_NAME --image "MoltBot:latest" --file src/MoltBot/Dockerfile src/MoltBot/
```

**Understanding this command:**

| Part | What It Does |
|------|--------------|
| `--registry $ACR_NAME` | Build in your Azure Container Registry (in the cloud) |
| `--image "MoltBot:latest"` | Name the output image `MoltBot:latest` (we choose this name) |
| `--file src/MoltBot/Dockerfile` | Use the Dockerfile from our sample repo |
| `src/MoltBot/` | Send this folder as the build context |

> **💡 What happens during the build?** The Dockerfile in our sample (at `src/MoltBot/Dockerfile`) automatically:
> 1. Starts from a Node.js base image
> 2. Clones the official [MoltBot source code](https://github.com/MoltBot/MoltBot) from GitHub
> 3. Installs dependencies with pnpm
> 4. Builds the TypeScript application
> 5. Builds the Control UI
> 6. Adds our custom `entrypoint.sh` that generates config from Azure environment variables
>
> **You don't need to download MoltBot separately** - it's pulled fresh from GitHub during the ACR build. The resulting image is stored in your ACR as `MoltBot:latest`.

---

### 2.6️⃣ Configure Your Credentials (Required)

Set your secrets before deploying:

```bash
cd moltbot-azure-container-apps

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
| `DISCORD_ALLOWED_USERS` | Discord → Settings → Advanced → Developer Mode → Right-click your username → Copy User ID |

**Optional settings:**

```bash
# Change the AI model
azd env set MOLTBOT_MODEL "openrouter/anthropic/claude-3.5-sonnet"

# Change the bot's name
azd env set MOLTBOT_PERSONA_NAME "Clawd"

# Add IP restrictions (for security)
azd env set ALLOWED_IP_RANGES "1.2.3.4/32"

# Enable email alerts
azd env set ALERT_EMAIL_ADDRESS "your-email@example.com"
```

---

### 2.7️⃣ Deploy the Application

Now deploy with your configuration:

```bash
azd deploy
```

This deploys MoltBot to Container Apps with all your secrets configured.

> **⚠️ Important:** If you change any environment variables later, run `azd deploy` again to apply them.

---

### 3️⃣ Invite Your Bot to a Server (2 minutes)

**⚠️ Critical:** Discord requires bots and users to share a server before DMs work!

| Step | Action |
|:----:|--------|
| 1 | Open the **OAuth2 URL** you copied in Step 0 |
| 2 | Select a server to invite the bot to (or create a new one) |
| 3 | Click **Authorize** |

---

### 4️⃣ Start Chatting! 💬

| Step | Action |
|:----:|--------|
| 1 | Find your bot in the server's member list (right sidebar) |
| 2 | **Right-click the bot → Message** to open a DM |
| 3 | Send: `Hello!` |
| 4 | Wait a few seconds for the response 🎉 |

> **🎉 You're now chatting with your personal AI assistant running 24/7 on Azure!**

---

### 🐛 Troubleshooting Common Issues

We encountered these issues during testing - here's how to fix them:

#### Container Image Not Found (MANIFEST_UNKNOWN)

**Problem:** Logs show `MANIFEST_UNKNOWN: manifest tagged by "latest" is not found`

**Cause:** The container image wasn't built before deployment.

**Solution:** Build the image manually:
```bash
ACR_NAME=$(az acr list --resource-group rg-MoltBot-prod --query "[0].name" -o tsv)
az acr build --registry $ACR_NAME --image "MoltBot:latest" --file src/MoltBot/Dockerfile src/MoltBot/
azd deploy
```

#### Windows Line Endings Breaking entrypoint.sh

**Problem:** Logs show `exec /app/entrypoint.sh: no such file or directory`

**Cause:** Windows CRLF line endings in shell scripts break Linux containers.

**Solution:** Convert to Unix line endings before building:
```powershell
# PowerShell - convert CRLF to LF
$content = Get-Content src/MoltBot/entrypoint.sh -Raw
$content -replace "`r`n", "`n" | Set-Content src/MoltBot/entrypoint.sh -NoNewline
```

Then rebuild the image:
```bash
az acr build --registry $ACR_NAME --image "MoltBot:latest" --file src/MoltBot/Dockerfile src/MoltBot/
```

#### Secrets Not Applied (Discord Application ID Error)

**Problem:** Logs show `Failed to resolve Discord application id`

**Cause:** `azd env set` stores values locally, but they weren't applied to the container.

**Solution:** Manually set secrets on the container app:
```bash
RESOURCE_GROUP="rg-MoltBot-prod"
APP_NAME="MoltBot"

az containerapp secret set --name $APP_NAME --resource-group $RESOURCE_GROUP \
  --secrets "discord-bot-token=YOUR_ACTUAL_TOKEN"

az containerapp update --name $APP_NAME --resource-group $RESOURCE_GROUP \
  --set-env-vars "DISCORD_ALLOWED_USERS=YOUR_DISCORD_USER_ID"

# Restart to apply
REVISION=$(az containerapp show --name $APP_NAME --resource-group $RESOURCE_GROUP \
  --query "properties.latestRevisionName" -o tsv)
az containerapp revision restart --name $APP_NAME --resource-group $RESOURCE_GROUP --revision $REVISION
```

#### "Unknown model" Error

**Problem:** MoltBot logs show `Unknown model: openrouter/anthropic/claude-sonnet-4-5`

**Cause:** Model IDs must be **exact**. There's no model called `claude-sonnet-4-5`.

**Solution:**
```bash
azd env set MOLTBOT_MODEL "openrouter/anthropic/claude-3.5-sonnet"
azd deploy
```

| ✅ Correct Model IDs | ❌ These Don't Exist |
|---------------------|---------------------|
| `openrouter/anthropic/claude-3.5-sonnet` | `claude-sonnet-4-5` |
| `openrouter/anthropic/claude-3-opus` | `openrouter:anthropic/claude-3.5-sonnet` |
| `openrouter/openai/gpt-4-turbo` | `anthropic/claude-opus-4-5` |

> **💡 Tip:** Check [openrouter.ai/models](https://openrouter.ai/models) for current model names.

#### HTTP 401 Authentication Error

**Problem:** Logs show `HTTP 401: authentication_error`

**Cause:** Invalid or missing OpenRouter API key.

**Solution:**
```bash
# Verify your key at openrouter.ai/keys first
azd env set OPENROUTER_API_KEY "sk-or-v1-your-actual-key"
azd deploy
```

#### Can't DM the Bot

**Problem:** Discord says "Unable to send messages to this user"

**Cause:** Discord requires a shared server before you can DM a bot.

**Solution:** 
1. Invite the bot to a server using the OAuth2 URL
2. Then DM the bot from that server's member list

#### Bot Doesn't Respond to DMs

**Problem:** Bot is online but ignores your messages.

**Cause:** Your Discord user ID isn't in the allowlist.

**Solution:**
```bash
azd env set DISCORD_ALLOWED_USERS "your-discord-user-id"
azd deploy
```

---

## 🏗️ What You Just Deployed

Here's what's running in your Azure subscription:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Azure Resource Group                               │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                  Azure Container Apps Environment                       ││
│  │                                                                          ││
│  │  ┌────────────────────────────────────────────────────────────────┐     ││
│  │  │                    🦞 MoltBot Container App                    │     ││
│  │  │                                                                  │     ││
│  │  │  Gateway     → Control plane for sessions and tools             │     ││
│  │  │  Control UI  → Web dashboard for management                     │     ││
│  │  │  Channels    → Telegram, Discord, WhatsApp connections          │     ││
│  │  │  Skills      → Extensible automation capabilities               │     ││
│  │  └────────────────────────────────────────────────────────────────┘     ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐ │
│  │  📦 Container       │  │   💾 Storage        │  │  📊 Log Analytics  │ │
│  │     Registry        │  │     Account         │  │                     │ │
│  │  (stores image)     │  │  (persistent data)  │  │  (logs & metrics)  │ │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 💪 Why This is So Powerful

### ⚙️ 1. It Actually Does Things

Unlike ChatGPT or other chat interfaces, MoltBot can:

| Capability | Example |
|------------|---------|
| 🖥️ Execute shell commands | Deploy code, manage files |
| 🌐 Browse the web | Fill forms, extract data |
| 📧 Connect to services | Gmail, Calendar, GitHub |
| 📁 Manage files | Create, edit, organize |
| ⏰ Run scheduled tasks | Cron jobs, reminders |
| 📞 Call you on the phone | With ElevenLabs integration |

---

### 📚 2. It Learns and Improves

MoltBot uses a "skills" system. Teach it something new:

> **"Create a skill that checks my flight status and texts me if there are delays"**

It will create that skill, test it, and run it whenever you ask (or on a schedule).

---

### 🧠 3. It Remembers Context

Unlike stateless AI chats, MoltBot maintains **persistent memory**:

- ✅ Your preferences
- ✅ Past conversations
- ✅ Files you've shared
- ✅ Skills you've taught it

This context persists across sessions, even if the container restarts.

---

### 🔐 4. Secure by Default

Running on Azure Container Apps means:

| Security Feature | Benefit |
|-----------------|---------|
| 🔐 SOC 2 / ISO 27001 | Azure's security certifications apply |
| 🌐 VNet integration | Keep traffic on private networks |
| 🪪 Managed Identity | No secrets in code |
| 👥 RBAC | Fine-grained access control |
| 📝 Audit logs | Everything logged to Log Analytics |

---

## 💵 Cost Efficiency Deep Dive

### 📊 Detailed Cost Breakdown

| Resource | What It Does | Monthly Cost |
|----------|--------------|:------------:|
| Container Apps | Runs MoltBot 24/7 | ~$30-50 |
| Container Registry (Basic) | Stores the image | ~$5 |
| Storage Account | Persists data | ~$1-2 |
| Log Analytics | Stores logs | ~$2-5 |
| **Total** | | **~$40-60/month** |

---

### 📈 ROI Comparison

| Solution | Monthly Cost | Capabilities | Best For |
|----------|:------------:|--------------|----------|
| **Azure Container Apps** | $40-60 | Full AI assistant | Production use |
| AWS EC2 | $30-40 | Same, but you manage | AWS shops |
| DigitalOcean | $24-48 | Same, manual setup | Simple deployments |
| Local machine | $10-20 | Requires 24/7 uptime | Hobbyists |
| ChatGPT Plus | $20 | Chat only | Q&A only |
| Claude Max | $100-200 | Great but no tasks | Heavy AI users |

> **💡 Key Insight:** $40-60/month for a 24/7 AI assistant that actually does work is **incredibly cheap** compared to any human alternative.

---

## 🧪 Quick Test Drive

Once deployed, try these commands with your MoltBot:

### 📝 Basic Tasks

> **"What's the weather in New York?"**

> **"Set a reminder for tomorrow at 9am to call the dentist"**

### 🔍 Research

> **"Research the top 5 project management tools and give me a comparison"**

### 📧 Automation

> **"Check my last 10 emails and tell me which ones need a response"**

### 🛠️ Skills

> **"Create a skill that summarizes any webpage I send you"**

---

## ⚙️ Advanced Configuration

### � How It Works Under the Hood

When you run `azd up`, the deployment does something clever: it builds MoltBot from source in Azure Container Registry, then injects your configuration at runtime via an **entrypoint script**.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   azd up        │────▶│  ACR Build      │────▶│  Container App  │
│                 │     │  (from source)  │     │  (your config)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                               ┌─────────────────┐
                                               │  entrypoint.sh  │
                                               │                 │
                                               │  Generates JSON │
                                               │  config from    │
                                               │  env variables  │
                                               └─────────────────┘
```

The entrypoint script converts your environment variables into MoltBot's JSON configuration format at startup. This means:
- **Secrets stay out of the image** - Configuration is injected at runtime
- **Easy updates** - Just change env vars and redeploy
- **No manual config files** - The script handles schema changes

---

### 📱 Adding More Channels

**Discord (Recommended):**
```bash
azd env set DISCORD_BOT_TOKEN "your-discord-token"
azd env set DISCORD_ALLOWED_USERS "user-id-1,user-id-2"  # Comma-separated for multiple users
azd deploy
```

**Telegram:**
```bash
azd env set TELEGRAM_BOT_TOKEN "your-telegram-token"
azd env set TELEGRAM_ALLOWED_USER_ID "your-telegram-user-id"
azd deploy
```

**WhatsApp:** Requires the desktop wizard to scan a QR code - not supported in headless container deployments.

---

### 🧠 Supported Models (via OpenRouter)

| Model | ID | Notes |
|-------|-----|-------|
| Claude 3.5 Sonnet | `openrouter/anthropic/claude-3.5-sonnet` | **Recommended** - Best balance of speed/quality |
| Claude 3 Opus | `openrouter/anthropic/claude-3-opus` | Most capable, slower |
| GPT-4 Turbo | `openrouter/openai/gpt-4-turbo` | Good alternative |
| Gemini Pro | `openrouter/google/gemini-pro` | Fast, lower cost |

Change model:
```bash
azd env set MOLTBOT_MODEL "openrouter/anthropic/claude-3-opus"
azd deploy
```

> **⚠️ Important:** Model IDs must be **exact**. Check [openrouter.ai/models](https://openrouter.ai/models) for current names.

---

### 🏭 Alternative: Azure AI Foundry

This sample uses **OpenRouter** as the model provider because it offers easy access to multiple AI models through a single API. However, you can also use **Azure AI Foundry** (formerly Azure OpenAI Service) to host your models directly within Azure for enhanced security and compliance.

#### Why Consider Azure AI Foundry?

| Feature | OpenRouter | Azure AI Foundry |
|---------|:----------:|:----------------:|
| **Data residency** | Third-party | Your Azure subscription |
| **Compliance** | Varies by model | Azure certifications apply |
| **Private networking** | ❌ Public API | ✅ Private Endpoints |
| **Model variety** | Many providers | Azure-hosted models |
| **Managed Identity** | ❌ API key only | ✅ Passwordless auth |
| **Enterprise agreements** | Pay-as-you-go | Azure commitment pricing |

#### Integration Status

We tested Azure AI Foundry integration and found:

| Test | Result |
|------|--------|
| **Azure OpenAI API** | ✅ Works - Successfully called GPT-4.1 deployment |
| **MoltBot Direct Integration** | ⚠️ Requires proxy - Azure uses different auth format |

**The Challenge:** Azure OpenAI uses a different authentication pattern than standard OpenAI:

| Feature | Standard OpenAI | Azure OpenAI |
|---------|-----------------|--------------|
| Auth Header | `Authorization: Bearer xxx` | `api-key: xxx` |
| API Version | Not required | Required (query param) |
| Endpoint Format | `api.openai.com/v1/...` | `{resource}.openai.azure.com/...` |

#### How to Use Azure AI Foundry with MoltBot

**Option A: Use LiteLLM as a Proxy (Recommended)**

[LiteLLM](https://github.com/BerriAI/litellm) provides an OpenAI-compatible proxy that natively supports Azure OpenAI:

```bash
# 1. Deploy a model in Azure AI Foundry
az cognitiveservices account create \
  --name my-ai-foundry \
  --resource-group rg-moltbot-prod \
  --kind OpenAI \
  --sku S0 \
  --location eastus2

az cognitiveservices account deployment create \
  --name my-ai-foundry \
  --resource-group rg-moltbot-prod \
  --deployment-name gpt-4o \
  --model-name gpt-4o \
  --model-version "2024-05-13" \
  --model-format OpenAI

# 2. Get your Azure OpenAI credentials
export AZURE_API_KEY=$(az cognitiveservices account keys list \
  --name my-ai-foundry \
  --resource-group rg-moltbot-prod \
  --query "key1" -o tsv)
export AZURE_API_BASE="https://my-ai-foundry.openai.azure.com"
export AZURE_API_VERSION="2024-08-01-preview"

# 3. Run LiteLLM proxy (add to your container or run as sidecar)
pip install litellm
litellm --model azure/gpt-4o --port 4000

# 4. Configure MoltBot to use LiteLLM
# In moltbot.json:
# {
#   "models": {
#     "providers": {
#       "azure-proxy": {
#         "baseUrl": "http://localhost:4000/v1",
#         "api": "openai-completions",
#         "models": [{ "id": "gpt-4o", "name": "GPT-4o (Azure)" }]
#       }
#     }
#   }
# }
```

**Option B: Wait for Native MoltBot Support**

MoltBot's model provider system is extensible. A future version may add native Azure OpenAI support with:
- Automatic `api-key` header handling
- Built-in `api-version` query parameter
- Managed Identity authentication

**Option C: Contribute to MoltBot**

Azure OpenAI support could be added as a community contribution to MoltBot. The provider would need to:
1. Use `api-key` header instead of `Authorization: Bearer`
2. Add `api-version` query parameter to all requests
3. Handle the different endpoint URL format

> **💡 Recommendation:** For production deployments requiring Azure AI Foundry, use the LiteLLM proxy approach. For simpler setups, OpenRouter remains the easiest option with excellent model variety.

---

### �🎭 Custom Persona

Change your bot's personality:
```bash
azd env set MOLTBOT_PERSONA_NAME "Jarvis"
azd deploy
```

---

### 📋 Viewing Logs

```bash
az containerapp logs show \
  --name MoltBot \
  --resource-group rg-MoltBot-prod \
  --follow --tail 50

# What healthy logs look like:
# Discord channel configured: yes (DM allowlist: 123456789)
# [discord] logged in to discord as 987654321
# [gateway] agent model: openrouter/anthropic/claude-3.5-sonnet
# [gateway] listening on ws://0.0.0.0:18789
```

---

### 🔄 Updating Secrets

After changing secrets, you must restart the container:

```bash
# Update a secret
az containerapp secret set --name MoltBot --resource-group rg-MoltBot-prod \
  --secrets "openrouter-api-key=sk-or-v1-new-key"

# Get current revision
REVISION=$(az containerapp show --name MoltBot --resource-group rg-MoltBot-prod \
  --query "properties.latestRevisionName" -o tsv)

# Restart to apply
az containerapp revision restart --name MoltBot --resource-group rg-MoltBot-prod \
  --revision $REVISION
```

---

## 🔒 Security Best Practices

Azure Container Apps includes several security features by default. Here's how to use them effectively for MoltBot:

### � Addressing Common Security Concerns

The community has raised several valid security concerns about self-hosting AI assistants. Here's how our Azure Container Apps deployment addresses each one:

| Security Concern | How ACA Addresses It | Configuration |
|-----------------|---------------------|---------------|
| **1. Close ports / IP allowlist** | ✅ Built-in IP restrictions on ingress | `ALLOWED_IP_RANGES` parameter |
| **2. Auth (JWT/OAuth/strong secret + TLS)** | ✅ Gateway token auth + automatic HTTPS | `MOLTBOT_GATEWAY_TOKEN` + free TLS certs |
| **3. Rotate keys (assume compromise)** | ✅ Container App secrets + easy rotation | `az containerapp secret set` |
| **4. Rate limiting + logs + alerts** | ✅ Log Analytics + Azure Monitor alerts | Preconfigured alerts included |

Let's dive into each:

---

### 🔐 1. IP Restrictions / VPN Access

**The Concern:** "Close the port/firewall to VPN or IP allowlist"

**ACA Solution:** Container Apps supports IP security restrictions at the ingress level - no need for external firewalls.

```bash
# Restrict access to your home IP and VPN
azd env set ALLOWED_IP_RANGES "1.2.3.4/32,10.0.0.0/8"
azd deploy
```

This creates ingress rules that:
- Allow traffic only from specified CIDR ranges
- Block all other IP addresses at the edge
- Apply before traffic reaches your container

**For maximum security (internal-only):**
```bash
# Deploy with no public ingress at all
azd env set INTERNAL_ONLY "true"
azd deploy
```

This makes MoltBot accessible only from within your Azure VNet - perfect for corporate environments with VPN access.

---

### 🔑 2. Authentication (Gateway Token + TLS)

**The Concern:** "Add auth - JWT/OAuth at least a strong secret + TLS"

**ACA Solution:** Multiple layers of authentication are enabled by default:

| Layer | What It Does | How It Works |
|-------|--------------|--------------|
| **HTTPS/TLS** | Encrypts all traffic | Automatic Let's Encrypt certificates |
| **Gateway Token** | Authenticates Control UI access | 32-char random token in secret |
| **DM Allowlist** | Restricts who can message the bot | Discord/Telegram user ID whitelist |
| **Managed Identity** | Authenticates to Azure services | No passwords in config |

The gateway token is auto-generated if not provided:
```bash
# Auto-generate (recommended)
azd up  # Token generated automatically

# Or specify your own
azd env set MOLTBOT_GATEWAY_TOKEN "your-strong-secret-here"
azd deploy
```

**Why this is better than JWT/OAuth:**
- JWT/OAuth requires identity provider setup and maintenance
- Gateway token is simpler but equally secure for single-user scenarios
- DM allowlist provides identity verification at the messaging layer
- Combined with IP restrictions, attack surface is minimal

---

### 🔄 3. Key Rotation (Assume Compromise)

**The Concern:** "Rotate keys regularly, assume compromise"

**ACA Solution:** Container App secrets can be rotated without rebuilding or redeploying:

```bash
# Rotate OpenRouter API key
az containerapp secret set --name MoltBot --resource-group rg-MoltBot \
  --secrets "openrouter-api-key=sk-or-v1-new-key-here"

# Rotate Discord bot token
az containerapp secret set --name MoltBot --resource-group rg-MoltBot \
  --secrets "discord-bot-token=new-discord-token"

# Rotate gateway token
az containerapp secret set --name MoltBot --resource-group rg-MoltBot \
  --secrets "gateway-token=new-32-char-secret"

# Restart to apply new secrets
REVISION=$(az containerapp show --name MoltBot --resource-group rg-MoltBot \
  --query "properties.latestRevisionName" -o tsv)
az containerapp revision restart --name MoltBot --resource-group rg-MoltBot \
  --revision $REVISION
```

**Rotation best practices:**
- Rotate API keys monthly or after any suspected exposure
- Use Azure Key Vault for automated rotation (optional)
- Monitor for failed auth attempts (covered by alerts below)

---

### 📊 4. Rate Limiting + Logs + Alerts

**The Concern:** "Rate limit + comprehensive logging + alerts for anomalies"

**ACA Solution:** Full observability stack included by default:

#### Logging (Included)
All container output flows automatically to Log Analytics:
```bash
# View real-time logs
az containerapp logs show --name MoltBot --resource-group rg-MoltBot \
  --follow --tail 50

# Query historical logs
az monitor log-analytics query \
  --workspace $LOG_ANALYTICS_WORKSPACE_ID \
  --analytics-query "ContainerAppConsoleLogs_CL | where TimeGenerated > ago(1h)"
```

#### Alerts (Preconfigured)
Our deployment includes four security-focused alerts:

| Alert | Trigger | Indicates |
|-------|---------|-----------|
| **High Error Rate** | >10 auth errors in 5 min | Potential brute force attack |
| **Container Restarts** | >3 restarts in 15 min | Crash loop or OOM attack |
| **Unusual Request Volume** | >100 messages/hour | Potential abuse |
| **Channel Disconnect** | Discord/Telegram goes offline | Token revoked or network issue |

Enable email notifications:
```bash
azd env set ALERT_EMAIL_ADDRESS "security@yourcompany.com"
azd deploy
```

#### Rate Limiting
While Container Apps doesn't have built-in rate limiting, you get effective protection from:

1. **Discord/Telegram rate limits** - Both platforms limit message frequency
2. **DM Allowlist** - Only approved users can send messages
3. **OpenRouter rate limits** - API calls are throttled by your plan
4. **Unusual activity alerts** - Notified when volume spikes

For additional rate limiting, add Azure API Management in front of the gateway.

---

### 🛡️ Defense in Depth Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                           SECURITY LAYERS                                   │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│   ┌─────────────────┐                                                      │
│   │ 1. IP RESTRICT  │  Only allowed IPs can reach the gateway              │
│   └────────┬────────┘                                                      │
│            ▼                                                               │
│   ┌─────────────────┐                                                      │
│   │ 2. TLS/HTTPS    │  All traffic encrypted with auto-renewed certs      │
│   └────────┬────────┘                                                      │
│            ▼                                                               │
│   ┌─────────────────┐                                                      │
│   │ 3. DM ALLOWLIST │  Only your Discord user ID can message the bot      │
│   └────────┬────────┘                                                      │
│            ▼                                                               │
│   ┌─────────────────┐                                                      │
│   │ 4. GATEWAY AUTH │  Token required for Control UI access               │
│   └────────┬────────┘                                                      │
│            ▼                                                               │
│   ┌─────────────────┐                                                      │
│   │ 5. SECRETS MGMT │  API keys stored as Container App secrets           │
│   └────────┬────────┘                                                      │
│            ▼                                                               │
│   ┌─────────────────┐                                                      │
│   │ 6. MANAGED ID   │  Passwordless auth to Azure services (ACR)          │
│   └────────┬────────┘                                                      │
│            ▼                                                               │
│   ┌─────────────────┐                                                      │
│   │ 7. HYPER-V      │  Container isolation at hardware level              │
│   └────────┬────────┘                                                      │
│            ▼                                                               │
│   ┌─────────────────┐                                                      │
│   │ 8. ALERTS       │  Notify on auth failures, restarts, abuse           │
│   └─────────────────┘                                                      │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### 🔑 Implementation Checklist

| Practice | How to Implement | Why It Matters |
|----------|------------------|----------------|
| 🔐 **DM Allowlist** | Set `DISCORD_ALLOWED_USERS` | Prevents strangers from using your AI |
| 🎫 **Gateway Token** | Auto-generated, use for Control UI | Protects web management interface |
| 🌐 **IP Restrictions** | Set `ALLOWED_IP_RANGES` | Limits network attack surface |
| 🔒 **Secrets in Azure** | Keys stored as secrets, not env vars | Never exposed in logs or source |
| 👤 **Managed Identity** | Enabled by default | No ACR passwords in config |
| 📝 **Audit Logs** | Log Analytics workspace | Track all API calls and access |
| 🚨 **Alerts** | Set `ALERT_EMAIL_ADDRESS` | Immediate notification of issues |
| 🔄 **Key Rotation** | `az containerapp secret set` | Mitigate compromised credentials |

### 🚨 What NOT to Do

| ❌ Don't | ✅ Do Instead |
|---------|---------------|
| Put API keys in Dockerfile | Use Container App secrets |
| Use `dm.policy: "open"` | Use `dm.policy: "allowlist"` |
| Disable gateway token auth | Always require token for Control UI |
| Skip DISCORD_ALLOWED_USERS | Always configure the allowlist |
| Leave IP restrictions empty for production | Set ALLOWED_IP_RANGES |
| Ignore alerts | Configure email notifications |

### 🔐 Optional: Private VNet Deployment

For highly sensitive deployments, deploy entirely within a VNet:

```bash
# Create a VNet-integrated environment
az containerapp env create \
  --name cae-MoltBot-private \
  --resource-group rg-MoltBot \
  --location eastus2 \
  --infrastructure-subnet-resource-id $SUBNET_ID \
  --internal-only
```

This makes MoltBot:
- Inaccessible from the public internet
- Reachable only from within your Azure VNet
- Suitable for sensitive workloads

---

## 🧹 Cleaning Up

When you're done experimenting:

```bash
azd down --purge
```

This removes all Azure resources. Your data in Azure Storage will be deleted.

---

## 🎯 What's Next?

Once your MoltBot is running, explore these capabilities:

| Next Step | Link/Action |
|-----------|-------------|
| 🔧 Browse Skills | [molthub.com](https://molthub.com) |
| 📚 Create Custom Skills | Teach through natural language |
| 🔗 Add Integrations | Gmail, Calendar, GitHub |
| ⏰ Set Up Cron Jobs | Schedule recurring tasks |
| 🎤 Enable Voice | Add ElevenLabs for voice |

---

## 📚 Resources

| Resource | Link |
|----------|------|
| 📖 MoltBot Docs | [docs.molt.bot](https://docs.molt.bot) |
| 💻 MoltBot GitHub | [github.com/MoltBot/MoltBot](https://github.com/MoltBot/MoltBot) |
| 💬 MoltBot Discord | [discord.gg/molt](https://discord.gg/molt) |
| ☁️ Azure Container Apps | [Documentation](https://learn.microsoft.com/azure/container-apps) |
| 📦 Sample Repository | [GitHub](https://github.com/BandaruDheeraj/moltbot-azure-container-apps) |

---

## 🎯 Key Takeaways

**🦞 MoltBot on Azure Container Apps** gives you the best of both worlds:

| Benefit | What It Means |
|---------|---------------|
| 🔓 **Open-source flexibility** | Full control over your AI assistant |
| 🏢 **Managed infrastructure** | Azure's scalability and reliability |
| 💰 **Cost efficiency** | ~$40-60/month for 24/7 operation |
| 🔧 **Zero maintenance** | No servers to patch, no Kubernetes to manage |
| 🔐 **Security by default** | Managed identity, secrets management, DM allowlist |

---

## 📝 Key Learnings from Our Deployment

During the development and testing of this sample, we discovered several important details that will save you hours:

### 1. MoltBot Requires Config File, Not Just Env Vars

**The Problem:** Setting environment variables directly doesn't configure MoltBot.

**The Solution:** MoltBot reads from `~/.MoltBot/MoltBot.json`. Our `entrypoint.sh` script generates this file from environment variables at container startup.

### 2. Config Schema Matters

**The Problem:** Using legacy config format causes silent failures.

**The Solution:** Use `agents.defaults` and `agents.list[].identity`, not the older `agent` and `identity` format:
```json
{
  "agents": {
    "defaults": { "model": { "primary": "..." } },
    "list": [{ "id": "main", "identity": { "name": "Clawd" } }]
  }
}
```

### 3. Model IDs Must Be Exact

**The Problem:** `openrouter/anthropic/claude-sonnet-4-5` returns "Unknown model".

**The Solution:** Check [openrouter.ai/models](https://openrouter.ai/models) for exact model names. Current working model: `openrouter/anthropic/claude-3.5-sonnet`.

### 4. Discord Requires Shared Server for DMs

**The Problem:** Can't find how to DM the bot.

**The Solution:** Discord bots can only receive DMs from users who share a server with them. Invite the bot to a server first, then DM it from the member list.

### 5. Secrets Changes Need Container Restart

**The Problem:** Updated API key but still getting auth errors.

**The Solution:** After `az containerapp secret set`, restart the revision:
```bash
az containerapp revision restart --name MoltBot --resource-group rg-MoltBot --revision $REVISION
```

---

> **🔮 The future of personal AI** isn't chatting with a website - it's having an always-on assistant that remembers you, learns from you, and actually gets things done.

> **🚀 Deploy your MoltBot today** and join the 40,000+ developers who've discovered what personal AI should feel like.

---

## 🚀 Try It Yourself

Deploy MoltBot with a single command:

```bash
# Clone the sample repository
git clone https://github.com/BandaruDheeraj/moltbot-azure-container-apps
cd moltbot-azure-container-apps

# Deploy everything with Azure Developer CLI
azd up
```

📦 **Repository:** [github.com/BandaruDheeraj/moltbot-azure-container-apps](https://github.com/BandaruDheeraj/moltbot-azure-container-apps)

---

> 💬 **Questions or feedback?** Join the [MoltBot Discord](https://discord.gg/molt) or open an issue on the [sample repository](https://github.com/BandaruDheeraj/moltbot-azure-container-apps).
