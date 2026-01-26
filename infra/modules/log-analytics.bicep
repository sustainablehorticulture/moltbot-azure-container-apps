@description('Name of the Log Analytics workspace')
param name string

@description('Location for the resource')
param location string = resourceGroup().location

@description('Tags for the resource')
param tags object = {}

@description('Retention period in days')
param retentionInDays int = 30

@description('SKU for the workspace')
param sku string = 'PerGB2018'

resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    retentionInDays: retentionInDays
    sku: {
      name: sku
    }
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
    workspaceCapping: {
      dailyQuotaGb: 1
    }
  }
}

output id string = logAnalyticsWorkspace.id
output name string = logAnalyticsWorkspace.name
output customerId string = logAnalyticsWorkspace.properties.customerId

#disable-next-line outputs-should-not-contain-secrets
output primarySharedKey string = logAnalyticsWorkspace.listKeys().primarySharedKey
