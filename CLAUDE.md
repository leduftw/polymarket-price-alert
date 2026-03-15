# CLAUDE.md

## Project Overview
Polymarket Price Alert — full-stack app that monitors Polymarket prediction markets and sends Telegram alerts when prices cross user-defined thresholds. Cheap alternative to PolyAlertHub, runs on Azure for <$1/month.

## Architecture

### Frontend (`frontend/`)
- React 19.2, Create React App, single-component app (`src/App.js`)
- API base URL configured via `REACT_APP_API_BASE_URL` env var
- Deployed to Azure Static Web Apps (free tier)
- `npm start` → http://localhost:3000

### Backend (`backend/`)
- Azure Functions v4 programming model, Node.js 22, CommonJS
- 6 functions in `src/functions/`, shared logic in `src/shared.js`

| Function | Trigger | Route | Purpose |
|----------|---------|-------|---------|
| getMarkets | HTTP GET | /api/markets | Cached markets list (optional `?q=` search), max 20 |
| getMarketById | HTTP GET | /api/markets/{id} | Single market from Gamma API with outcomes/prices |
| getActiveAlerts | HTTP GET | /api/active-alerts | Active alerts from Cosmos DB |
| createActiveAlert | HTTP POST | /api/active-alerts | Create alert with validation + duplicate detection |
| getCompletedAlerts | HTTP GET | /api/completed-alerts | Triggered alert history |
| pollActiveAlerts | Timer (every 30s) | N/A | Check prices, trigger alerts, send Telegram, move to completed |

### shared.js — core module
- **Market cache**: Fetches active markets from Polymarket Gamma API on startup, refreshes every 5 min. Up to 5000 markets. Stores `{id, question}` only.
- **Cosmos DB**: Lazy init via `ensureContainers()`. Database: `AlertsDB`, containers: `ActiveAlerts` and `CompletedAlerts`, partitioned by `/marketId`.
- **Validation**: threshold must be between 0 and 1 exclusive, direction is "above" or "below".

### Infrastructure (`infra/`)
- `main.bicep` — all Azure resources (Cosmos DB serverless, Function App consumption, Static Web App free, Storage, App Insights, Log Analytics)
- `deploy.ps1` — PowerShell wrapper: creates resource group + deploys Bicep
- Resource group: `pmalerts-rg`, most resources in westeurope, Cosmos DB in northeurope

### External APIs
- Polymarket Gamma API: `https://gamma-api.polymarket.com`
- Telegram Bot API: `https://api.telegram.org/bot{token}/sendMessage`

### CI/CD (`.github/workflows/`)
- `azure-static-web-apps.yml` — deploys frontend on push to main
- `deploy-azure-function.yml` — deploys backend on push to main
- Required GitHub secrets: `AZURE_STATIC_WEB_APPS_API_TOKEN`, `REACT_APP_API_BASE_URL`, `AZURE_PUBLISH_PROFILE`

## Local Development

Frontend depends on backend, so start in this order (each in a separate terminal):

```bash
# 1. Config (first time only)
cp backend/local.settings.example.json backend/local.settings.json  # fill in values
cp frontend/.env.example frontend/.env  # works out of the box

# 2. Terminal 1 — Azurite (needed for timer triggers)
azurite --silent --location "$env:TEMP/azurite"

# 3. Terminal 2 — Backend
cd backend && npm install && func start
# Wait for "Worker process started and initialized" before starting frontend

# 4. Terminal 3 — Frontend
cd frontend && npm install && npm start
```

Stop: Ctrl+C in each terminal.

If Cosmos DB keys return 401, refresh via:
```bash
az cosmosdb keys list --name pmalerts-cdb --resource-group pmalerts-rg
az storage account keys list --account-name pmalertsfuncsa --resource-group pmalerts-rg
```

## Key Things to Know
- `local.settings.json` and `local.settings.prod.json` are gitignored — they contain real credentials
- Cosmos DB init is lazy (not eager) — the worker starts even if DB is temporarily unavailable, so market endpoints always work
- `getActiveAlerts` filters alerts by both `isValidAlert()` AND `marketExists()` — alerts for closed/archived markets silently disappear from the list
- The market cache takes a few seconds to populate on startup — markets endpoints return `[]` until then
- Frontend `.env.production` points to `https://pmalerts-func.azurewebsites.net/api`
