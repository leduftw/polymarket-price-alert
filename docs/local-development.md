# Local Development

This guide covers running the full Polymarket Price Alert stack locally. The
frontend depends on the backend API, so follow the steps in order.

---

## Prerequisites

| Tool / Account | Purpose | Install |
|----------------|---------|---------|
| **Node.js 22+** | Local development of frontend & backend | [nodejs.org](https://nodejs.org/) |
| **Azure Functions Core Tools** | Run backend locally with `func start` | [Install guide](https://learn.microsoft.com/azure/azure-functions/functions-run-local) |
| **Azurite** | Local Azure Storage emulator (needed for timer triggers) | `npm install -g azurite` |
| **Azure Cosmos DB account** | Alert storage (or use the [Cosmos DB Emulator](https://learn.microsoft.com/azure/cosmos-db/local-emulator) for fully offline development) | [azure.microsoft.com](https://azure.microsoft.com/free/) |
| **Telegram Bot Token** | Delivers price-alert notifications | [BotFather](https://core.telegram.org/bots#botfather) — create a bot and note the **token** and your **chat ID** |

---

## Config files

The local config files are gitignored — use the `.example` templates to create
them.

| File | Purpose | Committed? |
|------|---------|------------|
| `backend/local.settings.json` | Backend config for `func start` | No (gitignored) |
| `backend/local.settings.example.json` | Template — copy and fill in | Yes |
| `frontend/.env` | Frontend dev settings (points API to `localhost`) | No (gitignored) |
| `frontend/.env.example` | Template — copy to `.env` and fill in | Yes |

---

## Step 1 — Configure environment variables

```bash
cp backend/local.settings.example.json backend/local.settings.json
cp frontend/.env.example frontend/.env
```

Edit `backend/local.settings.json` and fill in the real values for
`COSMOS_ENDPOINT`, `COSMOS_KEY`, `TELEGRAM_BOT_TOKEN`, and `TELEGRAM_CHAT_ID`.

**`AzureWebJobsStorage`** — The example file defaults to
`"UseDevelopmentStorage=true"`, which points to the local Azurite emulator. To
use a real Azure Storage account instead, replace it with the connection string:

```
az storage account show-connection-string --name <storage-account-name> --resource-group <resource-group> -o tsv
```

**`TELEGRAM_BOT_TOKEN`** — Create a bot via
[BotFather](https://t.me/BotFather): send `/newbot`, follow the prompts, and
copy the token it gives you (looks like `123456789:ABCdefGhIjKlMnOpQrStUvWxYz`).

**`TELEGRAM_CHAT_ID`** — Send any message to your bot, then fetch your chat ID:

```
curl https://api.telegram.org/bot<your-token>/getUpdates
```

Look for `"chat":{"id":...}` in the response. That number is your chat ID.

The frontend `.env` works out of the box — it sets `REACT_APP_API_BASE_URL` to
`http://localhost:7071/api` so the frontend talks to a locally running backend.
To point the frontend at the real Azure backend instead, set:

```
REACT_APP_API_BASE_URL=https://pmalerts-func.azurewebsites.net/api
```

For production builds (used by GitHub Actions), `REACT_APP_API_BASE_URL` is
injected from the GitHub secret at build time.

**Using the Cosmos DB emulator instead of a real Azure account:**

For fully local development without Azure, you can use the
[Azure Cosmos DB Emulator](https://learn.microsoft.com/azure/cosmos-db/local-emulator):

1. Start the Cosmos DB emulator
2. Use the emulator values in `local.settings.json` (see the example file)
3. Set `NODE_TLS_REJECT_UNAUTHORIZED=0` (the emulator uses a self-signed cert)

---

## Step 2 — Start Azurite

In a terminal, start the Azure Storage emulator (needed for timer triggers
like `pollActiveAlerts`):

```bash
# Terminal 1
azurite --silent --location "$env:TEMP/azurite"
```

Leave this running and open a new terminal for the next step.

---

## Step 3 — Start the backend

```bash
# Terminal 2
cd backend
npm install
func start
```

Wait until you see `Worker process started and initialized` and the function
URLs listed before continuing. The backend runs on `http://localhost:7071`.

---

## Step 4 — Start the frontend

```bash
# Terminal 3
cd frontend
npm install
npm start
```

Open `http://localhost:3000` — you should see markets loaded and be able to
create alerts.

---

## Stopping the local environment

Press `Ctrl+C` in each of the three terminals (Azurite, backend, frontend).

---

## Troubleshooting

### "Port 7071 is unavailable" error

A previous `func start` process is still running. Kill it and try again:

```bash
# Windows
taskkill /F /IM func.exe

# macOS / Linux
pkill -f func
```

### "Something is already running on port 3000" error

A previous React dev server is still running. Find the process on that port and
kill it (don't use `taskkill /F /IM node.exe` — that kills all Node processes
including the backend):

```bash
# Windows — find the PID, then kill it
netstat -ano | findstr :3000
taskkill /F /PID <pid>

# macOS / Linux
lsof -ti:3000 | xargs kill
```

### Cosmos DB 401 (unauthorized) error

Your Cosmos DB keys may have been rotated. Refresh them via the Azure CLI:

```bash
az cosmosdb keys list --name pmalerts-cdb --resource-group pmalerts-rg
az storage account keys list --account-name pmalertsfuncsa --resource-group pmalerts-rg
```

Copy the new key into `backend/local.settings.json`.

### Azurite artifacts

Azurite writes data files to the directory specified by `--location`. The
command above uses `$env:TEMP/azurite` so artifacts go to your system temp
directory and stay out of the repo. These files are also covered by
`.gitignore`.
