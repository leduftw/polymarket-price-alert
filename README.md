# Polymarket Price Alert System

A full-stack web application that allows users to create and manage price alerts for Polymarket prediction markets.
Free alternative to expensive Polymarket alert services. Built in 2 days with Azure (<$1/month) vs $9.99/month subscriptions on PolyAlertHub.
Get notified via Telegram when market prices reach your specified thresholds.

## 🎯 Purpose

This application helps traders and analysts monitor Polymarket prediction markets by:
- Setting custom price alerts for specific market outcomes
- Receiving Telegram notifications when price thresholds are met
- Tracking alert history and market performance
- Providing an intuitive web interface for alert management

## 🏗️ Architecture

The project consists of two main components:

### Frontend (React)
- **Technology**: React 19.2 with modern hooks
- **Features**: Market search, alert creation form, active alerts dashboard
- **Communication**: REST API calls to backend

### Backend (Azure Functions)
- **Technology**: Node.js 22 serverless functions hosted on Azure (v4 programming model)
- **Database**: Azure Cosmos DB (serverless) for alert storage
- **External APIs**: Polymarket Gamma API for market data
- **Notifications**: Telegram Bot API for alert delivery
- **Scheduling**: Azure Functions timer triggers for polling alerts

## ✨ Current Functionalities

### Market Management
- **Market Search**: Search and browse active Polymarket prediction markets
- **Market Details**: View market outcomes with current prices
- **Market Cache**: Automatic caching and refresh of market data every 5 minutes

### Alert System
- **Create Alerts**: Set price alerts for specific market outcomes
- **Alert Types**: Support for "above" and "below" threshold alerts
- **Validation**: Client and server-side validation to prevent invalid alerts
- **Duplicate Prevention**: Automatic detection and prevention of duplicate alerts

### Data Persistence
- **Active Alerts**: Store and manage currently active price alerts
- **Completed Alerts**: Archive triggered alerts with completion details

### Notification System
- **Telegram Integration**: Send instant notifications via Telegram bot
- **Alert Polling**: Automated background checking of alert conditions (every 30 seconds)
- **Price Monitoring**: Continuous monitoring of market prices via timer-triggered functions

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/markets` | GET | Fetch active markets (with optional `?q=` search query) |
| `/markets/{id}` | GET | Get detailed market information with outcomes and prices |
| `/active-alerts` | GET | Retrieve all active alerts |
| `/active-alerts` | POST | Create a new price alert |
| `/completed-alerts` | GET | Get history of triggered alerts |

### Background Services
- **pollActiveAlerts**: Timer-triggered function that checks alert conditions every 30 seconds
- **Market Cache Refresh**: Automatic updates of market data from Polymarket Gamma API every 5 minutes
- **Alert Processing**: Moves triggered alerts from active to completed status

## 🚀 Getting Started

### Prerequisites
- Node.js (v22 or higher)
- Azure Functions Core Tools
- [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite) (`npm install -g azurite`) — required locally for timer-triggered functions
- Azure Cosmos DB account (or the [Cosmos DB Emulator](https://learn.microsoft.com/azure/cosmos-db/local-emulator) for fully offline development)
- Telegram Bot Token (for notifications)

### Step 1 — Configure environment variables

Example config files are provided in the repo — copy them and fill in your values:

```bash
cp backend/local.settings.example.json backend/local.settings.json
cp frontend/.env.example frontend/.env
```

Edit `backend/local.settings.json` and fill in `COSMOS_ENDPOINT`, `COSMOS_KEY`,
`TELEGRAM_BOT_TOKEN`, and `TELEGRAM_CHAT_ID`. The frontend `.env` works
out of the box (points to `http://localhost:7071/api`).

For details on each variable and how to obtain the values, see the
[Deployment Guide](docs/deployment-guide.md#local-development).

### Step 2 — Start Azurite

In a terminal, start the Azure Storage emulator (needed for timer triggers):

```bash
azurite --silent --location %TEMP%\azurite
```

Leave this running and open a new terminal for the next step.

### Step 3 — Start the backend

```bash
cd backend
npm install
func start
```

> **"Port 7071 is unavailable"?** A previous `func start` is still running.
> Kill it first: `taskkill /F /IM func.exe` (Windows) or `pkill -f func` (macOS/Linux),
> then run `func start` again.

Wait until you see `Worker process started and initialized` and the function
URLs listed before continuing.

### Step 4 — Start the frontend

In a third terminal:

```bash
cd frontend
npm install
npm start
```

> **"Something is already running on port 3000"?** Find and kill only that
> process: `netstat -ano | findstr :3000` to get the PID, then `taskkill /F /PID <pid>`
> (Windows) or `lsof -ti:3000 | xargs kill` (macOS/Linux). Then run `npm start` again.

Open `http://localhost:3000` — you should see markets loaded and be able to
create alerts.

### Stopping the local environment

Press `Ctrl+C` in each of the three terminals (Azurite, backend, frontend).

## 🔧 Technical Stack

**Frontend:**
- React 19.2
- Modern CSS with inline styles

**Backend:**
- Azure Functions v4 programming model (Node.js 22)
- Azure Cosmos DB (serverless)
- node-fetch for HTTP requests

**External Services:**
- Polymarket Gamma API
- Telegram Bot API

**Infrastructure:**
- Azure Bicep templates (`infra/main.bicep`) for repeatable provisioning
- GitHub Actions for Azure Static Web Apps deployment (frontend)
- GitHub Actions for Azure Functions deployment (backend)

## 🏗️ Infrastructure Setup

Azure resources are defined as Infrastructure-as-Code using [Bicep](https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/overview) templates in the `infra/` directory.

### Quick deploy

```powershell
az login --use-device-code
.\infra\deploy.ps1 -TelegramBotToken "<your-token>" -TelegramChatId "<your-chat-id>"
```

This creates: Cosmos DB (serverless, northeurope), Function App (consumption), Static Web App (free), Storage Account, Application Insights, and Log Analytics — all in westeurope (except Cosmos DB).

After deployment, configure the three required GitHub secrets and push to `main` to deploy your code.

> 📖 **For the full end-to-end setup guide** (secrets, CI/CD, troubleshooting), see **[docs/deployment-guide.md](docs/deployment-guide.md)**.

## 📝 License

This project is licensed under the terms specified in the LICENSE file.

## 🤝 Contributing

This is a personal project for monitoring Polymarket price alerts. Feel free to fork and adapt for your own use cases.
