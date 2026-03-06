<#
.SYNOPSIS
    Deploys the Polymarket Price Alert infrastructure to Azure using Bicep.

.DESCRIPTION
    Creates the resource group (if it doesn't exist) and deploys infra/main.bicep.

.PARAMETER TelegramBotToken
    Telegram bot token used for alert notifications.

.PARAMETER TelegramChatId
    Telegram chat ID where alerts are sent.

.PARAMETER Location
    Azure region. Defaults to 'westeurope'.

.PARAMETER ProjectName
    Project prefix for resource names. Defaults to 'pmalerts'.

.PARAMETER CosmosDbLocation
    Azure region for the Cosmos DB account. Defaults to 'northeurope'
    to avoid capacity constraints in the main region.

.PARAMETER Clean
    Delete the resource group before deploying, useful when a previous
    deployment left resources in a failed provisioning state.

.EXAMPLE
    .\infra\deploy.ps1 -TelegramBotToken "<token>" -TelegramChatId "<chat-id>"

.EXAMPLE
    .\infra\deploy.ps1 -TelegramBotToken "<token>" -TelegramChatId "<chat-id>" -Clean
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$TelegramBotToken,

    [Parameter(Mandatory = $true)]
    [string]$TelegramChatId,

    [string]$Location = "westeurope",

    [string]$ProjectName = "pmalerts",

    [string]$CosmosDbLocation = "northeurope",

    [switch]$Clean
)

$ErrorActionPreference = "Stop"
$ResourceGroup = "$ProjectName-rg"
$TemplateFile = Join-Path $PSScriptRoot "main.bicep"

Write-Host "=== Polymarket Price Alert — Azure Deployment ===" -ForegroundColor Cyan

# --- Ensure the user is logged in to Azure ---
$account = az account show --output json 2>$null | ConvertFrom-Json
if (-not $account) {
    Write-Error "Not logged in to Azure. Run 'az login --use-device-code' first, then re-run this script."
    exit 1
}
Write-Host "Logged in as '$($account.user.name)' (subscription: $($account.name))" -ForegroundColor Green

# --- Clean previous deployment if requested ---
if ($Clean) {
    $rgExists = az group exists --name $ResourceGroup 2>$null
    if ($rgExists -eq "true") {
        Write-Host "`nDeleting resource group '$ResourceGroup' (this may take a few minutes)..." -ForegroundColor Yellow
        az group delete --name $ResourceGroup --yes --output none
        Write-Host "Resource group deleted." -ForegroundColor Green
    }
}

# --- Ensure resource group exists ---
Write-Host "`nChecking resource group '$ResourceGroup'..."
$rgJson = az group show --name $ResourceGroup --output json 2>$null
if ($rgJson) {
    $rg = $rgJson | ConvertFrom-Json
    $rgLocation = $rg.location
    Write-Host "Resource group already exists in '$rgLocation'." -ForegroundColor Yellow
    if ($rgLocation -ne $Location) {
        Write-Host "WARNING: Requested location is '$Location' but resource group is in '$rgLocation'. Resources will be deployed to '$rgLocation'." -ForegroundColor Red
        $Location = $rgLocation
    }
} else {
    Write-Host "Creating resource group '$ResourceGroup' in '$Location'..."
    az group create --name $ResourceGroup --location $Location --output none
    Write-Host "Resource group created." -ForegroundColor Green
}

# --- Deploy Bicep template ---
Write-Host "`nDeploying Bicep template..."
$deployment = az deployment group create `
    --resource-group $ResourceGroup `
    --template-file $TemplateFile `
    --parameters `
        location=$Location `
        cosmosDbLocation=$CosmosDbLocation `
        projectName=$ProjectName `
        telegramBotToken=$TelegramBotToken `
        telegramChatId=$TelegramChatId `
    --output json | ConvertFrom-Json

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "TIP: If a resource is stuck in a failed provisioning state, re-run with -Clean to delete the resource group and start fresh:" -ForegroundColor Yellow
    Write-Host "  .\infra\deploy.ps1 -TelegramBotToken <tok> -TelegramChatId <id> -Clean" -ForegroundColor Yellow
    Write-Error "Deployment failed."
    exit 1
}

# --- Show outputs ---
Write-Host "`n=== Deployment Outputs ===" -ForegroundColor Cyan
$outputs = $deployment.properties.outputs
Write-Host "Cosmos DB Endpoint   : $($outputs.cosmosDbEndpoint.value)"
Write-Host "Function App Hostname: $($outputs.functionAppHostname.value)"
Write-Host "Static Web App Host  : $($outputs.staticWebAppHostname.value)"
Write-Host "Static Web App Name  : $($outputs.staticWebAppName.value)"

Write-Host "`nNOTE: Connect the Static Web App to GitHub via the Azure Portal" -ForegroundColor Yellow
Write-Host "      or run: az staticwebapp update ..." -ForegroundColor Yellow
Write-Host "`nDeployment complete!" -ForegroundColor Green
