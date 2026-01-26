targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Name of the environment that can be used as part of naming resource convention')
param environmentName string

@minLength(1)
@description('Primary location for all resources')
param location string

@description('Anthropic API key for Claude models (optional if using OpenRouter)')
@secure()
param anthropicApiKey string = ''

@description('OpenRouter API key (alternative to Anthropic)')
@secure()
param openRouterApiKey string = ''

@description('OpenAI API key for fallback models (optional)')
@secure()
param openaiApiKey string = ''

@description('Telegram Bot Token for messaging (optional)')
@secure()
param telegramBotToken string = ''

@description('Telegram User ID for allowlist (optional)')
param telegramAllowedUserId string = ''

@description('Discord Bot Token for messaging (optional)')
@secure()
param discordBotToken string = ''

@description('Discord User IDs allowed to DM the bot (comma-separated, e.g., "123456789,987654321")')
param discordAllowedUsers string = ''

@description('ClawdBot Gateway Token for web UI authentication (will be auto-generated if not provided)')
@secure()
param clawdbotGatewayToken string = ''

@description('ClawdBot persona name (default: Clawd)')
param clawdbotPersonaName string = 'Clawd'

@description('The model to use - must use exact OpenRouter model ID (e.g., openrouter/anthropic/claude-3.5-sonnet)')
param clawdbotModel string = 'openrouter/anthropic/claude-3.5-sonnet'

@description('Container image tag (default: latest for ACR-built image)')
param imageTag string = 'latest'

@description('Use official GHCR image (requires building from source first - see scripts/build-image.ps1)')
param useOfficialImage bool = false

@description('Container CPU cores')
param containerCpu string = '1.0'

@description('Container memory in Gi')
param containerMemory string = '2.0Gi'

@description('Minimum number of replicas')
param minReplicas int = 1

@description('Maximum number of replicas')
param maxReplicas int = 1

@description('IP addresses allowed to access the gateway (comma-separated CIDR blocks, e.g., "1.2.3.4/32,10.0.0.0/8"). Leave empty for public access.')
param allowedIpRanges string = ''

@description('Enable internal-only ingress (requires VNet-integrated environment)')
param internalOnly bool = false

@description('Enable security and availability alerts')
param enableAlerts bool = true

@description('Email address for alert notifications (leave empty to disable email alerts)')
param alertEmailAddress string = ''

// Generate unique suffix for resources
var abbrs = loadJsonContent('./abbreviations.json')
var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))
var tags = { 'azd-env-name': environmentName }

// Resource Group
resource rg 'Microsoft.Resources/resourceGroups@2022-09-01' = {
  name: '${abbrs.resourcesResourceGroups}${environmentName}'
  location: location
  tags: tags
}

// Log Analytics Workspace for monitoring
module logAnalytics './modules/log-analytics.bicep' = {
  name: 'log-analytics'
  scope: rg
  params: {
    name: '${abbrs.operationalInsightsWorkspaces}${resourceToken}'
    location: location
    tags: tags
  }
}

// Azure Container Registry for images
module containerRegistry './modules/container-registry.bicep' = {
  name: 'container-registry'
  scope: rg
  params: {
    name: '${abbrs.containerRegistryRegistries}${resourceToken}'
    location: location
    tags: tags
  }
}

// Storage Account for ClawdBot persistent data
module storageAccount './modules/storage-account.bicep' = {
  name: 'storage-account'
  scope: rg
  params: {
    name: '${abbrs.storageStorageAccounts}${resourceToken}'
    location: location
    tags: tags
  }
}

// Container Apps Environment
module containerAppsEnvironment './modules/container-apps-env.bicep' = {
  name: 'container-apps-env'
  scope: rg
  params: {
    name: '${abbrs.appContainerAppsEnvironments}${resourceToken}'
    location: location
    tags: tags
    logAnalyticsWorkspaceCustomerId: logAnalytics.outputs.customerId
    logAnalyticsWorkspaceSharedKey: logAnalytics.outputs.primarySharedKey
  }
}

// ClawdBot Container App
module clawdbotApp './modules/clawdbot-app.bicep' = {
  name: 'clawdbot-app'
  scope: rg
  params: {
    name: 'clawdbot'
    location: location
    tags: tags
    containerAppsEnvironmentId: containerAppsEnvironment.outputs.id
    containerRegistryName: containerRegistry.outputs.name
    containerRegistryLoginServer: containerRegistry.outputs.loginServer
    storageAccountName: storageAccount.outputs.name
    imageTag: imageTag
    useOfficialImage: useOfficialImage
    anthropicApiKey: anthropicApiKey
    openRouterApiKey: openRouterApiKey
    openaiApiKey: openaiApiKey
    telegramBotToken: telegramBotToken
    telegramAllowedUserId: telegramAllowedUserId
    discordBotToken: discordBotToken
    discordAllowedUsers: discordAllowedUsers
    clawdbotGatewayToken: clawdbotGatewayToken
    clawdbotPersonaName: clawdbotPersonaName
    clawdbotModel: clawdbotModel
    containerCpu: containerCpu
    containerMemory: containerMemory
    minReplicas: minReplicas
    maxReplicas: maxReplicas
    allowedIpRanges: allowedIpRanges
    internalOnly: internalOnly
  }
}

// Security and availability alerts
module alerts './modules/alerts.bicep' = if (enableAlerts) {
  name: 'alerts'
  scope: rg
  params: {
    namePrefix: 'clawdbot'
    location: location
    tags: tags
    logAnalyticsWorkspaceId: logAnalytics.outputs.id
    containerAppName: 'clawdbot'
    enableAlerts: enableAlerts
    alertEmailAddress: alertEmailAddress
  }
  dependsOn: [
    clawdbotApp
  ]
}

// Outputs
output AZURE_LOCATION string = location
output AZURE_TENANT_ID string = subscription().tenantId
output AZURE_SUBSCRIPTION_ID string = subscription().subscriptionId
output AZURE_RESOURCE_GROUP string = rg.name

output CONTAINER_REGISTRY_NAME string = containerRegistry.outputs.name
output CONTAINER_REGISTRY_LOGIN_SERVER string = containerRegistry.outputs.loginServer

output CLAWDBOT_APP_NAME string = clawdbotApp.outputs.name
output CLAWDBOT_APP_FQDN string = clawdbotApp.outputs.fqdn
output CLAWDBOT_GATEWAY_URL string = 'https://${clawdbotApp.outputs.fqdn}'

output LOG_ANALYTICS_WORKSPACE_ID string = logAnalytics.outputs.id
output STORAGE_ACCOUNT_NAME string = storageAccount.outputs.name
