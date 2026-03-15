# Deployment Guide

This guide walks you through provisioning the Azure infrastructure, configuring
CI/CD via GitHub Actions, and getting the Polymarket Price Alert system running
end-to-end.

---

## Prerequisites

| Tool / Account | Purpose | Install |
|----------------|---------|---------|
| **Azure subscription** | Hosts all cloud resources | [azure.microsoft.com](https://azure.microsoft.com/free/) |
| **Azure CLI** | Provisions infrastructure from the terminal | [Install guide](https://learn.microsoft.com/cli/azure/install-azure-cli) |
| **Node.js 22+** | Local development of frontend & backend | [nodejs.org](https://nodejs.org/) |
| **Azure Functions Core Tools** | Run backend locally with `func start` | [Install guide](https://learn.microsoft.com/azure/azure-functions/functions-run-local) |
| **Azurite** | Local Azure Storage emulator (needed for timer triggers) | `npm install -g azurite` |
| **Telegram Bot** | Delivers price-alert notifications | [BotFather](https://core.telegram.org/bots#botfather) — create a bot and note the **token** and your **chat ID** |
| **GitHub account** | Hosts source code and runs CI/CD workflows | [github.com](https://github.com/) |

---

## Step 1 — Provision Azure Infrastructure

All Azure resources are defined as Infrastructure-as-Code using
[Bicep](https://learn.microsoft.com/azure/azure-resource-manager/bicep/overview)
in the `infra/` directory.

### 1.1 Log in to Azure

```powershell
az login --use-device-code
```

> **Why `--use-device-code`?** Standard `az login` may fail if your account has
> MFA enabled. The device-code flow works reliably in all cases.

### 1.2 Run the deployment script

```powershell
.\infra\deploy.ps1 -TelegramBotToken "<your-bot-token>" -TelegramChatId "<your-chat-id>"
```

The script will:
1. Check that you're logged in to Azure
2. Create the resource group `pmalerts-rg` (if it doesn't exist)
3. Deploy `infra/main.bicep`, which provisions all resources
4. Print the deployment outputs (endpoints and hostnames)

### 1.3 Script parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `TelegramBotToken` | Yes | — | Telegram bot token for alert notifications |
| `TelegramChatId` | Yes | — | Telegram chat ID where alerts are sent |
| `Location` | No | `westeurope` | Azure region for most resources. Must be a region that supports Static Web Apps (`westus2`, `centralus`, `eastus2`, `westeurope`, `eastasia`) |
| `CosmosDbLocation` | No | `northeurope` | Azure region for Cosmos DB. Separated from the main location to work around regional capacity constraints |
| `ProjectName` | No | `pmalerts` | Prefix for all resource names |
| `Clean` | No | — | Switch. Deletes the resource group before deploying — useful when a previous deployment left resources in a failed state |

### 1.4 Cleaning up a failed deployment

If a deployment fails and leaves resources in a broken provisioning state (e.g.
Cosmos DB stuck in `Failed`), re-run with `-Clean`:

```powershell
.\infra\deploy.ps1 -TelegramBotToken "<token>" -TelegramChatId "<id>" -Clean
```

This deletes the entire resource group and starts fresh.

---

## Step 2 — Configure GitHub Secrets

After the infrastructure is provisioned, you need to set three GitHub repository
secrets so the CI/CD workflows can deploy your code.

Go to your repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.

### 2.1 `AZURE_STATIC_WEB_APPS_API_TOKEN`

**What it is:** Deployment token for the Static Web App.

**How to get it:**

```powershell
az staticwebapp secrets list --name pmalerts-ui --resource-group pmalerts-rg --query "properties.apiKey" -o tsv
```

Copy the output and save it as the secret value.

### 2.2 `AZURE_PUBLISH_PROFILE`

**What it is:** Publish profile XML for the Azure Function App. Used by the
backend deployment workflow.

**How to get it:**

```powershell
az functionapp deployment list-publishing-profiles --name pmalerts-func --resource-group pmalerts-rg --xml
```

Copy the **entire XML output** and save it as the secret value.

### 2.3 `REACT_APP_API_BASE_URL`

**What it is:** The base URL of the backend API, injected into the React
frontend at build time.

**Value:** `https://pmalerts-func.azurewebsites.net/api`

> **Why `/api`?** Azure Functions uses a default route prefix of `api`. Your
> function routes (e.g. `markets`, `active-alerts`) are served under `/api/`,
> so the full URL becomes `https://pmalerts-func.azurewebsites.net/api/markets`.

---

## Step 3 — Trigger Deployments

Once secrets are configured, push to `main` to trigger both workflows:

- **`.github/workflows/azure-static-web-apps.yml`** — builds the React frontend
  and deploys it to the Static Web App
- **`.github/workflows/deploy-azure-function.yml`** — installs backend
  dependencies and deploys them to the Azure Function App

You can monitor the runs in your repo's **Actions** tab.

After the workflows complete:
- **Frontend** is live at `https://ashy-sand-0268de503.6.azurestaticapps.net`
- **Backend API** is live at `https://pmalerts-func.azurewebsites.net/api`

---

## Azure Resources Reference

All resources are created by `infra/main.bicep` via the `deploy.ps1` script.

| Resource | Azure Type | Name | Region | Purpose | Cost |
|----------|-----------|------|--------|---------|------|
| **Cosmos DB Account** | `Microsoft.DocumentDB/databaseAccounts` | `pmalerts-cdb` | `northeurope` | NoSQL database (serverless) for alert storage | ~$0 at low usage (pay-per-request) |
| **Cosmos DB Database** | SQL Database | `AlertsDB` | — | Contains the two alert containers | Included above |
| **ActiveAlerts Container** | Cosmos DB Container | `ActiveAlerts` | — | Stores currently active price alerts (partitioned by `/marketId`) | Included above |
| **CompletedAlerts Container** | Cosmos DB Container | `CompletedAlerts` | — | Archives triggered alerts (partitioned by `/marketId`) | Included above |
| **Storage Account** | `Microsoft.Storage/storageAccounts` | `pmalertsfuncsa` | `westeurope` | Blob/queue storage required by Azure Functions | Pennies/month |
| **Log Analytics Workspace** | `Microsoft.OperationalInsights/workspaces` | `pmalerts-law` | `westeurope` | Central log store (30-day retention), feeds Application Insights | Free up to 5 GB/month |
| **Application Insights** | `Microsoft.Insights/components` | `pmalerts-ai` | `westeurope` | Monitoring and telemetry for the Function App (backed by Log Analytics) | Free up to 5 GB/month |
| **App Service Plan** | `Microsoft.Web/serverfarms` | `pmalerts-asp` | `westeurope` | Consumption (Dynamic) hosting plan for the Function App | Free tier (1M executions/month) |
| **Function App** | `Microsoft.Web/sites` | `pmalerts-func` | `westeurope` | Node.js 22 backend — API endpoints + timer triggers (runs on the App Service Plan, uses Storage, Cosmos DB, and Application Insights) | Free tier |
| **Static Web App** | `Microsoft.Web/staticSites` | `pmalerts-ui` | `westeurope` | Hosts the React frontend (Free tier) | $0 |

**Estimated monthly cost:** Under **$1/month** for personal use. All tiers are
free or pay-per-use with generous free allowances.

---

## GitHub Secrets Reference

| Secret | Used By | Description |
|--------|---------|-------------|
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | `azure-static-web-apps.yml` | Deployment token for the Static Web App |
| `AZURE_PUBLISH_PROFILE` | `deploy-azure-function.yml` | Publish profile XML for the Function App |
| `REACT_APP_API_BASE_URL` | `azure-static-web-apps.yml` | Backend API URL injected into React at build time (must include `/api` suffix) |

---

## Local Development

You can run the full stack locally for development and testing. The frontend
depends on the backend API, so follow the steps in order.

### Config files

The local config files are gitignored — use the `.example` templates to create
them.

| File | Purpose | Committed? |
|------|---------|------------|
| `backend/local.settings.json` | Backend config for `func start` | No (gitignored) |
| `backend/local.settings.example.json` | Template — copy and fill in | Yes |
| `frontend/.env` | Frontend dev settings (points API to `localhost`) | No (gitignored) |
| `frontend/.env.production` | Production build settings (points API to Azure) | No (gitignored) |
| `frontend/.env.example` | Template — copy to `.env` and fill in | Yes |

### Step 1 — Configure environment variables

```bash
cp backend/local.settings.example.json backend/local.settings.json
cp frontend/.env.example frontend/.env
```

Edit `backend/local.settings.json` and fill in the real values for
`COSMOS_ENDPOINT`, `COSMOS_KEY`, `TELEGRAM_BOT_TOKEN`, and `TELEGRAM_CHAT_ID`.

The frontend `.env` works out of the box — it sets `REACT_APP_API_BASE_URL` to
`http://localhost:7071/api` so the frontend talks to a locally running backend.

For production builds (used by GitHub Actions), the `REACT_APP_API_BASE_URL`
value is injected from the GitHub secret, not from `.env.production`. You only
need `.env.production` if you run `npm run build` locally and want it to point
at your Azure backend.

**Using the Cosmos DB emulator instead of a real Azure account:**

For fully local development without Azure, you can use the
[Azure Cosmos DB Emulator](https://learn.microsoft.com/azure/cosmos-db/local-emulator):

1. Start the Cosmos DB emulator
2. Use the emulator values in `local.settings.json` (see the example file)
3. Set `NODE_TLS_REJECT_UNAUTHORIZED=0` (the emulator uses a self-signed cert)

### Step 2 — Start the backend

The frontend depends on the backend API, so start this first.

```bash
# Terminal 1 — Start Azurite (needed for timer triggers like pollActiveAlerts)
azurite --silent

# Terminal 2 — Install dependencies and start the backend
cd backend
npm install
func start
```

Wait until you see `Worker process started and initialized` and the function
URLs listed before continuing. The backend runs on `http://localhost:7071`.

### Step 3 — Start the frontend

```bash
# Terminal 3 — Install dependencies and start the frontend
cd frontend
npm install
npm start
```

Open `http://localhost:3000` — you should see markets loaded and be able to
create alerts.

---

## End-to-End Checklist

Use this checklist to verify everything is working after a fresh setup:

- [ ] `az login --use-device-code` — logged in to Azure
- [ ] `.\infra\deploy.ps1 ...` — infrastructure deployed successfully
- [ ] GitHub secret `AZURE_STATIC_WEB_APPS_API_TOKEN` — set from `az staticwebapp secrets list`
- [ ] GitHub secret `AZURE_PUBLISH_PROFILE` — set from `az functionapp deployment list-publishing-profiles`
- [ ] GitHub secret `REACT_APP_API_BASE_URL` — set to `https://pmalerts-func.azurewebsites.net/api`
- [ ] Push to `main` — both GitHub Actions workflows pass
- [ ] Frontend loads at `https://ashy-sand-0268de503.6.azurestaticapps.net`
- [ ] Markets search works (frontend can call the backend API)
- [ ] Create a test alert and verify Telegram notification arrives

---

## Troubleshooting

### "Failed provisioning state" error

A previous failed deployment can leave resources (typically Cosmos DB) in a
broken state. Re-run with `-Clean` to delete and recreate the resource group:

```powershell
.\infra\deploy.ps1 -TelegramBotToken "<token>" -TelegramChatId "<id>" -Clean
```

### Region capacity errors

Azure may report `ServiceUnavailable` for Cosmos DB in certain regions during
high-demand periods. The template defaults Cosmos DB to `northeurope` separately
from other resources. You can override it:

```powershell
.\infra\deploy.ps1 ... -CosmosDbLocation "eastus2"
```

### Static Web Apps region restrictions

Static Web Apps only supports these regions: `westus2`, `centralus`, `eastus2`,
`westeurope`, `eastasia`. If you change the `-Location` parameter, make sure it
is one of these.

### "Not logged in to Azure" error

Run `az login --use-device-code` before executing the deploy script. Standard
`az login` may fail with MFA-enabled accounts.

### Workflows not triggering

Ensure the three GitHub secrets are set correctly (see Step 2). Workflow runs
appear in the repo's **Actions** tab.
