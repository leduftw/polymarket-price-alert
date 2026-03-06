// ---------------------------------------------------------------------------
// Polymarket Price Alert — Azure Infrastructure
// Usage:  az deployment group create -g pmalerts-rg -f main.bicep \
//           -p telegramBotToken=<tok> telegramChatId=<id>
// ---------------------------------------------------------------------------

@description('Azure region for all resources.')
param location string = 'eastus'

@description('Project name used as a prefix for resource names.')
param projectName string = 'pmalerts'

@secure()
@description('Telegram bot token for alert notifications.')
param telegramBotToken string

@secure()
@description('Telegram chat ID for alert notifications.')
param telegramChatId string

@description('Name of the Cosmos DB SQL database.')
param cosmosDbName string = 'AlertsDB'

// ---------------------------------------------------------------------------
// Derived names
// ---------------------------------------------------------------------------
var cosmosAccountName = '${projectName}-cdb'
var staticWebAppName = '${projectName}-ui'
var storageAccountName = '${projectName}funcsa'
var functionAppName = '${projectName}-func'
var appServicePlanName = '${projectName}-asp'
var appInsightsName = '${projectName}-ai'
var logAnalyticsName = '${projectName}-law'

// ---------------------------------------------------------------------------
// Cosmos DB
// ---------------------------------------------------------------------------
resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: cosmosAccountName
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    capabilities: [
      { name: 'EnableServerless' }
    ]
  }
}

resource cosmosDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmosAccount
  name: cosmosDbName
  properties: {
    resource: {
      id: cosmosDbName
    }
  }
}

resource activeAlertsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: cosmosDatabase
  name: 'ActiveAlerts'
  properties: {
    resource: {
      id: 'ActiveAlerts'
      partitionKey: {
        paths: ['/marketId']
        kind: 'Hash'
      }
    }
  }
}

resource completedAlertsContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: cosmosDatabase
  name: 'CompletedAlerts'
  properties: {
    resource: {
      id: 'CompletedAlerts'
      partitionKey: {
        paths: ['/marketId']
        kind: 'Hash'
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Storage Account (required by Azure Functions)
// ---------------------------------------------------------------------------
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
}

// ---------------------------------------------------------------------------
// Log Analytics Workspace (required by Application Insights)
// ---------------------------------------------------------------------------
resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// ---------------------------------------------------------------------------
// Application Insights
// ---------------------------------------------------------------------------
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalyticsWorkspace.id
  }
}

// ---------------------------------------------------------------------------
// App Service Plan (Consumption / Dynamic)
// ---------------------------------------------------------------------------
resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: appServicePlanName
  location: location
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  properties: {}
}

// ---------------------------------------------------------------------------
// Function App (Node.js 22, Windows, Consumption)
// ---------------------------------------------------------------------------
resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp'
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: {
      appSettings: [
        { name: 'AzureWebJobsStorage'; value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storageAccount.listKeys().keys[0].value}' }
        { name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING'; value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storageAccount.listKeys().keys[0].value}' }
        { name: 'WEBSITE_CONTENTSHARE'; value: toLower(functionAppName) }
        { name: 'FUNCTIONS_EXTENSION_VERSION'; value: '~4' }
        { name: 'FUNCTIONS_WORKER_RUNTIME'; value: 'node' }
        { name: 'WEBSITE_NODE_DEFAULT_VERSION'; value: '~22' }
        { name: 'APPINSIGHTS_INSTRUMENTATIONKEY'; value: appInsights.properties.InstrumentationKey }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'; value: appInsights.properties.ConnectionString }
        { name: 'COSMOS_ENDPOINT'; value: cosmosAccount.properties.documentEndpoint }
        { name: 'COSMOS_KEY'; value: cosmosAccount.listKeys().primaryMasterKey }
        { name: 'TELEGRAM_BOT_TOKEN'; value: telegramBotToken }
        { name: 'TELEGRAM_CHAT_ID'; value: telegramChatId }
      ]
      netFrameworkVersion: 'v6.0'
    }
    httpsOnly: true
  }
}

// ---------------------------------------------------------------------------
// Static Web App (Free tier)
// NOTE: The GitHub repository connection must be configured separately
//       via the Azure Portal or `az staticwebapp` CLI because Bicep
//       cannot create GitHub OAuth connections.
// ---------------------------------------------------------------------------
resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' = {
  name: staticWebAppName
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {}
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------
output cosmosDbEndpoint string = cosmosAccount.properties.documentEndpoint
output functionAppHostname string = functionApp.properties.defaultHostName
output staticWebAppHostname string = staticWebApp.properties.defaultHostname
output staticWebAppName string = staticWebApp.name
