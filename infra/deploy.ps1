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
    Azure region. Defaults to 'eastus'.

.PARAMETER ProjectName
    Project prefix for resource names. Defaults to 'pmalerts'.

.EXAMPLE
    .\infra\deploy.ps1 -TelegramBotToken "<token>" -TelegramChatId "<chat-id>"
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$TelegramBotToken,

    [Parameter(Mandatory = $true)]
    [string]$TelegramChatId,

    [string]$Location = "eastus",

    [string]$ProjectName = "pmalerts"
)

$ErrorActionPreference = "Stop"
$ResourceGroup = "$ProjectName-rg"
$TemplateFile = Join-Path $PSScriptRoot "main.bicep"

Write-Host "=== Polymarket Price Alert — Azure Deployment ===" -ForegroundColor Cyan

# --- Ensure resource group exists ---
Write-Host "`nChecking resource group '$ResourceGroup' in '$Location'..."
$rgExists = az group exists --name $ResourceGroup 2>$null
if ($rgExists -ne "true") {
    Write-Host "Creating resource group '$ResourceGroup'..."
    az group create --name $ResourceGroup --location $Location --output none
    Write-Host "Resource group created." -ForegroundColor Green
} else {
    Write-Host "Resource group already exists." -ForegroundColor Yellow
}

# --- Deploy Bicep template ---
Write-Host "`nDeploying Bicep template..."
$deployment = az deployment group create `
    --resource-group $ResourceGroup `
    --template-file $TemplateFile `
    --parameters `
        location=$Location `
        projectName=$ProjectName `
        telegramBotToken=$TelegramBotToken `
        telegramChatId=$TelegramChatId `
    --output json | ConvertFrom-Json

if ($LASTEXITCODE -ne 0) {
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
