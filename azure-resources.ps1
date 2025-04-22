az login --use-device-code

# 1) Create a resource group
az group create --name pmalerts-rg --location eastus

# 2) Cosmos DB (SQL API) — Serverless + Free Tier
az cosmosdb create --name pmalerts-cdb --resource-group pmalerts-rg --kind GlobalDocumentDB --capabilities EnableServerless --default-consistency-level Session --locations regionName=eastus isZoneRedundant=False

# Create database + container
az cosmosdb sql database create --account-name pmalerts-cdb --name AlertsDB --resource-group pmalerts-rg
az cosmosdb sql container create --account-name pmalerts-cdb --database-name AlertsDB --name Alerts --partition-key-path "/marketId" --resource-group pmalerts-rg

# Grab the connection info (endpoint & key used in Function App settings below)
az cosmosdb keys list --type keys --name pmalerts-cdb --resource-group pmalerts-rg --query "{endpoint:primaryMastersMasterKeyList[0].value, key:primaryMasterKey}" --output yaml

# 3) Deploy the frontend with Static Web Apps (Free)
az provider show --namespace Microsoft.Web --query "registrationState"

az provider show --namespace Microsoft.DomainRegistration --query "registrationState"

# If not "Registered", run this:
az provider register --namespace Microsoft.Web
az provider register --namespace Microsoft.DomainRegistration

# Once it's "Registered" you can create web app
az staticwebapp create --name pmalerts-ui --resource-group pmalerts-rg --source https://github.com/leduftw/polymarket-price-alert --branch main --app-location "frontend" --output-location "frontend/build" --login-with-github

# 4) Deploy the backend as Azure Functions (Consumption plan)

# 4.1) Create a storage account (required by Functions)
az storage account create --name pmalertsfuncsa --resource-group pmalerts-rg --sku Standard_LRS --location eastus

az provider show --namespace Microsoft.OperationalInsights --query "registrationState"

# If not "Registered", run this:
az provider register --namespace Microsoft.OperationalInsights

# 4.2) Once "Registered", create the Function App (automatically creates plan and function insights)
az functionapp create --name pmalerts-func --resource-group pmalerts-rg --storage-account pmalertsfuncsa --consumption-plan-location eastus --runtime node --runtime-version 22 --os-type Windows --functions-version 4

# 4.3) Configure environment variables
az functionapp config appsettings set --name pmalerts-func --resource-group pmalerts-rg --settings COSMOS_ENDPOINT="https://pmalerts-cdb.documents.azure.com:443/" COSMOS_KEY="<primary-key>"
