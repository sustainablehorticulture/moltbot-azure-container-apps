@description('Name of the Container App')
param name string

@description('Location for the resource')
param location string = resourceGroup().location

@description('Tags for the resource')
param tags object = {}

@description('Container Apps Environment ID')
param containerAppsEnvironmentId string

@description('Container Registry Name')
param containerRegistryName string

@description('Container Registry Login Server')
param containerRegistryLoginServer string

@description('Storage Account Name')
param storageAccountName string

@description('Container image tag')
param imageTag string = 'latest'

@description('Use official GHCR image instead of ACR (not recommended - build from source instead)')
param useOfficialImage bool = false

@description('Anthropic API key')
@secure()
param anthropicApiKey string = ''

@description('OpenRouter API key')
@secure()
param openRouterApiKey string = ''

@description('OpenAI API key')
@secure()
param openaiApiKey string = ''

@description('Telegram Bot Token')
@secure()
param telegramBotToken string = ''

@description('Telegram Allowed User ID')
param telegramAllowedUserId string = ''

@description('Discord Bot Token')
@secure()
param discordBotToken string = ''

@description('Discord User IDs allowed to DM the bot (comma-separated)')
param discordAllowedUsers string = ''

@description('ClawdBot Gateway Token for authentication')
@secure()
param clawdbotGatewayToken string = ''

@description('ClawdBot Persona Name')
param clawdbotPersonaName string = 'Clawd'

@description('ClawdBot Model - must use exact OpenRouter model ID')
param clawdbotModel string = 'openrouter/anthropic/claude-3.5-sonnet'

@description('Database connection string for Azure SQL')
@secure()
param databaseConnectionString string = ''

@description('Comma-separated list of database names')
param databaseNames string = ''

@description('Enable database integration')
param databaseEnabled string = 'false'

@description('OpenRouter model for Red Dog AI engine')
param openRouterModel string = 'openai/gpt-4o-mini'

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

@description('Enable internal-only ingress (requires VNet integration)')
param internalOnly bool = false

// Reference existing storage account
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' existing = {
  name: storageAccountName
}

// Reference existing container registry
resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: containerRegistryName
}

// User-assigned managed identity for the Container App
resource managedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${name}-identity'
  location: location
  tags: tags
}

// Role assignment for ACR pull (only needed if not using official image)
resource acrPullRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!useOfficialImage) {
  name: guid(containerRegistry.id, managedIdentity.id, 'acrpull')
  scope: containerRegistry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d') // AcrPull role
    principalId: managedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// Role assignment for Storage File Data SMB Share Contributor
resource storageRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, managedIdentity.id, 'storagefile')
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '0c867c2a-1d8c-454a-a3db-ab2ea1bdc8bb') // Storage File Data SMB Share Contributor
    principalId: managedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// Parse IP ranges into array for security restrictions
var ipRangesArray = !empty(allowedIpRanges) ? split(allowedIpRanges, ',') : []
var ipSecurityRestrictions = [for (ipRange, i) in ipRangesArray: {
  name: 'allow-ip-${i}'
  action: 'Allow'
  ipAddressRange: trim(ipRange)
}]

// Container App
resource containerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: name
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerAppsEnvironmentId
    configuration: {
      ingress: {
        external: !internalOnly
        targetPort: 18789
        transport: 'auto'
        allowInsecure: false
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
        // IP restrictions - only allow specified IP ranges if configured
        ipSecurityRestrictions: ipSecurityRestrictions
      }
      // Only configure ACR registry if not using official image
      registries: useOfficialImage ? [] : [
        {
          server: containerRegistryLoginServer
          identity: managedIdentity.id
        }
      ]
      secrets: [
        {
          name: 'anthropic-api-key'
          value: !empty(anthropicApiKey) ? anthropicApiKey : 'not-set'
        }
        {
          name: 'openrouter-api-key'
          value: !empty(openRouterApiKey) ? openRouterApiKey : 'not-set'
        }
        {
          name: 'openai-api-key'
          value: !empty(openaiApiKey) ? openaiApiKey : 'not-set'
        }
        {
          name: 'telegram-bot-token'
          value: !empty(telegramBotToken) ? telegramBotToken : 'not-set'
        }
        {
          name: 'discord-bot-token'
          value: !empty(discordBotToken) ? discordBotToken : 'not-set'
        }
        {
          name: 'gateway-token'
          value: !empty(clawdbotGatewayToken) ? clawdbotGatewayToken : 'not-set'
        }
        {
          name: 'storage-connection-string'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=core.windows.net'
        }
        {
          name: 'database-connection-string'
          value: !empty(databaseConnectionString) ? databaseConnectionString : 'not-set'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'clawdbot'
          // Use official GHCR image or custom ACR image
          image: useOfficialImage ? 'ghcr.io/clawdbot/clawdbot:${imageTag}' : '${containerRegistryLoginServer}/clawdbot:${imageTag}'
          resources: {
            cpu: json(containerCpu)
            memory: containerMemory
          }
          env: [
            {
              name: 'ANTHROPIC_API_KEY'
              secretRef: 'anthropic-api-key'
            }
            {
              name: 'OPENROUTER_API_KEY'
              secretRef: 'openrouter-api-key'
            }
            {
              name: 'OPENAI_API_KEY'
              secretRef: 'openai-api-key'
            }
            {
              name: 'TELEGRAM_BOT_TOKEN'
              secretRef: 'telegram-bot-token'
            }
            {
              name: 'TELEGRAM_ALLOWED_USER_ID'
              value: telegramAllowedUserId
            }
            {
              name: 'DISCORD_BOT_TOKEN'
              secretRef: 'discord-bot-token'
            }
            {
              name: 'DISCORD_ALLOWED_USERS'
              value: discordAllowedUsers
            }
            {
              name: 'CLAWDBOT_GATEWAY_TOKEN'
              secretRef: 'gateway-token'
            }
            {
              name: 'CLAWDBOT_PERSONA_NAME'
              value: clawdbotPersonaName
            }
            {
              name: 'CLAWDBOT_MODEL'
              value: clawdbotModel
            }
            {
              name: 'GATEWAY_PORT'
              value: '18789'
            }
            {
              name: 'GATEWAY_BIND'
              value: '0.0.0.0'
            }
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'DATABASE_ENABLED'
              value: databaseEnabled
            }
            {
              name: 'DATABASE_CONNECTION_STRING'
              secretRef: 'database-connection-string'
            }
            {
              name: 'DATABASE_NAMES'
              value: databaseNames
            }
            {
              name: 'OPENROUTER_MODEL'
              value: openRouterModel
            }
            {
              name: 'API_PORT'
              value: '18789'
            }
          ]
          volumeMounts: [
            {
              volumeName: 'clawdbot-data'
              mountPath: '/root/.clawdbot'
            }
            {
              volumeName: 'clawd-workspace'
              mountPath: '/root/clawd'
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 18789
              }
              initialDelaySeconds: 30
              periodSeconds: 30
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/health'
                port: 18789
              }
              initialDelaySeconds: 10
              periodSeconds: 10
              failureThreshold: 3
            }
          ]
        }
      ]
      volumes: [
        {
          name: 'clawdbot-data'
          storageType: 'EmptyDir'
        }
        {
          name: 'clawd-workspace'
          storageType: 'EmptyDir'
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
      }
    }
  }
  dependsOn: [
    acrPullRoleAssignment
    storageRoleAssignment
  ]
}

output id string = containerApp.id
output name string = containerApp.name
output fqdn string = containerApp.properties.configuration.ingress.fqdn
output identityPrincipalId string = managedIdentity.properties.principalId
