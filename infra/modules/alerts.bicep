@description('Name prefix for alert resources')
param namePrefix string

@description('Location for the resource')
param location string = resourceGroup().location

@description('Tags for the resource')
param tags object = {}

@description('Log Analytics Workspace ID for querying')
param logAnalyticsWorkspaceId string

@description('Container App name to monitor')
param containerAppName string

@description('Enable security and availability alerts')
param enableAlerts bool = true

@description('Email address for alert notifications (optional)')
param alertEmailAddress string = ''

// Action Group for notifications (only if email is provided)
resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = if (!empty(alertEmailAddress)) {
  name: '${namePrefix}-alerts-ag'
  location: 'global'
  tags: tags
  properties: {
    groupShortName: 'ClawdAlerts'
    enabled: true
    emailReceivers: [
      {
        name: 'AdminEmail'
        emailAddress: alertEmailAddress
        useCommonAlertSchema: true
      }
    ]
  }
}

// Alert: High error rate (potential auth failures or API issues)
resource errorRateAlert 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = if (enableAlerts) {
  name: '${namePrefix}-high-error-rate'
  location: location
  tags: tags
  properties: {
    displayName: 'ClawdBot - High Error Rate'
    description: 'Triggered when error rate exceeds threshold - may indicate auth failures, API key issues, or attacks'
    severity: 2
    enabled: true
    evaluationFrequency: 'PT5M'
    scopes: [
      logAnalyticsWorkspaceId
    ]
    windowSize: 'PT15M'
    criteria: {
      allOf: [
        {
          query: 'ContainerAppConsoleLogs_CL | where ContainerAppName_s == "${containerAppName}" | where Log_s contains "error" or Log_s contains "Error" or Log_s contains "ERROR" | where Log_s contains "401" or Log_s contains "403" or Log_s contains "authentication" or Log_s contains "unauthorized" | summarize ErrorCount = count() by bin(TimeGenerated, 5m) | where ErrorCount > 10'
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 0
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: {
      actionGroups: !empty(alertEmailAddress) ? [actionGroup.id] : []
    }
  }
}

// Alert: Container restart (potential crash or attack)
resource restartAlert 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = if (enableAlerts) {
  name: '${namePrefix}-container-restarts'
  location: location
  tags: tags
  properties: {
    displayName: 'ClawdBot - Container Restarts'
    description: 'Triggered when container restarts unexpectedly - may indicate crash, OOM, or attack'
    severity: 2
    enabled: true
    evaluationFrequency: 'PT5M'
    scopes: [
      logAnalyticsWorkspaceId
    ]
    windowSize: 'PT15M'
    criteria: {
      allOf: [
        {
          query: 'ContainerAppSystemLogs_CL | where ContainerAppName_s == "${containerAppName}" | where Reason_s == "ContainerStarted" or Reason_s == "Pulling" | summarize RestartCount = count() by bin(TimeGenerated, 15m) | where RestartCount > 3'
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 0
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: {
      actionGroups: !empty(alertEmailAddress) ? [actionGroup.id] : []
    }
  }
}

// Alert: Unusual request patterns (potential rate limit abuse)
resource unusualActivityAlert 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = if (enableAlerts) {
  name: '${namePrefix}-unusual-activity'
  location: location
  tags: tags
  properties: {
    displayName: 'ClawdBot - Unusual Request Volume'
    description: 'Triggered when request volume exceeds normal patterns - may indicate abuse or attack'
    severity: 3
    enabled: true
    evaluationFrequency: 'PT5M'
    scopes: [
      logAnalyticsWorkspaceId
    ]
    windowSize: 'PT1H'
    criteria: {
      allOf: [
        {
          query: 'ContainerAppConsoleLogs_CL | where ContainerAppName_s == "${containerAppName}" | where Log_s contains "received message" or Log_s contains "[discord]" or Log_s contains "[telegram]" | summarize MessageCount = count() by bin(TimeGenerated, 1h) | where MessageCount > 100'
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 0
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: {
      actionGroups: !empty(alertEmailAddress) ? [actionGroup.id] : []
    }
  }
}

// Alert: Discord channel disconnect (bot may be offline)
resource disconnectAlert 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = if (enableAlerts) {
  name: '${namePrefix}-channel-disconnect'
  location: location
  tags: tags
  properties: {
    displayName: 'ClawdBot - Channel Disconnected'
    description: 'Triggered when Discord or Telegram channel disconnects unexpectedly'
    severity: 2
    enabled: true
    evaluationFrequency: 'PT5M'
    scopes: [
      logAnalyticsWorkspaceId
    ]
    windowSize: 'PT15M'
    criteria: {
      allOf: [
        {
          query: 'ContainerAppConsoleLogs_CL | where ContainerAppName_s == "${containerAppName}" | where Log_s contains "channel exited" or Log_s contains "disconnected" or Log_s contains "connection closed" | summarize DisconnectCount = count() by bin(TimeGenerated, 15m) | where DisconnectCount > 0'
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 0
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: {
      actionGroups: !empty(alertEmailAddress) ? [actionGroup.id] : []
    }
  }
}

output actionGroupId string = !empty(alertEmailAddress) ? actionGroup.id : ''
