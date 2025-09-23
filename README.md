# Polymarket Price Alert System

A full-stack web application that allows users to create and manage price alerts for Polymarket prediction markets. Get notified via Telegram when market prices reach your specified thresholds.

## 💡 Why I Built This

While investigating and playing with Polymarket, I discovered that polyalerthub.com charges $9.99 for a Premium subscription just to have unlimited price alerts. I couldn't believe such a simple feature required a monthly subscription, so I decided to build my own price alert mechanism over the weekend using Azure infrastructure that costs less than $1 per month.

## 🎯 Purpose

This application helps traders and analysts monitor Polymarket prediction markets by:
- Setting custom price alerts for specific market outcomes
- Receiving real-time notifications when price thresholds are met
- Tracking alert history and market performance
- Providing an intuitive web interface for alert management

## 🏗️ Architecture

The project consists of two main components:

### Frontend (React)
- **Technology**: React 19.1.0 with modern hooks
- **Features**: Real-time market search, alert creation form, active alerts dashboard
- **Communication**: REST API calls to backend, Socket.io for real-time updates

### Backend (Azure Functions)
- **Technology**: Node.js serverless functions hosted on Azure
- **Database**: Azure Cosmos DB for alert storage
- **External APIs**: Polymarket Gamma API for market data
- **Notifications**: Telegram Bot API for alert delivery

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
- **Real-time Sync**: Automatic synchronization between frontend and backend

### Notification System
- **Telegram Integration**: Send instant notifications via Telegram bot
- **Alert Polling**: Automated background checking of alert conditions
- **Price Monitoring**: Continuous monitoring of market prices via scheduled functions

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/markets` | GET | Fetch active markets (with optional search query) |
| `/markets/{id}` | GET | Get detailed market information |
| `/active-alerts` | GET | Retrieve all active alerts |
| `/active-alerts` | POST | Create a new price alert |
| `/completed-alerts` | GET | Get history of triggered alerts |

### Background Services
- **pollActiveAlerts**: Scheduled function that checks alert conditions every few minutes
- **Market Cache Refresh**: Automatic updates of market data from Polymarket API
- **Alert Processing**: Moves triggered alerts from active to completed status

## 🚀 Getting Started

### Prerequisites
- Node.js (v14 or higher)
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
- `REACT_APP_API_BASE_URL`: Backend API base URL

## 📊 Key Features

- **Real-time Market Data**: Live integration with Polymarket's Gamma API
- **Intelligent Caching**: Efficient market data caching to reduce API calls
- **Robust Validation**: Comprehensive input validation and error handling
- **Scalable Architecture**: Serverless backend design for automatic scaling
- **User-friendly Interface**: Clean, responsive React frontend
- **Reliable Notifications**: Telegram integration for instant alert delivery
- **Data Persistence**: Secure storage of alerts and user preferences

## 🔧 Technical Stack

**Frontend:**
- React 19.1.0
- Socket.io Client
- Modern CSS with responsive design

**Backend:**
- Azure Functions (Node.js)
- Azure Cosmos DB
- Node-cron for scheduling
- Express.js for HTTP handling

**External Services:**
- Polymarket Gamma API
- Telegram Bot API

## 📝 License

This project is licensed under the terms specified in the LICENSE file.

## 🤝 Contributing

This is a personal project for monitoring Polymarket price alerts. Feel free to fork and adapt for your own use cases.
