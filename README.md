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
- Azure Cosmos DB account
- Telegram Bot Token (for notifications)

### Frontend Setup
```bash
cd frontend
npm install
npm start
```

### Backend Setup
```bash
cd backend
npm install
func start
```

### Environment Variables
Create appropriate environment files with:
- `COSMOS_ENDPOINT`: Azure Cosmos DB endpoint
- `COSMOS_KEY`: Azure Cosmos DB access key
- `TELEGRAM_BOT_TOKEN`: Telegram bot token for notifications
- `TELEGRAM_CHAT_ID`: Target chat ID for alert messages
- `REACT_APP_API_BASE_URL`: Backend API base URL (used by frontend at build time)

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
