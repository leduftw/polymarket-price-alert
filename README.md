# polymarket-price-alert

Telegram notifications when a Polymarket prediction market crosses a price you
care about.

Pick a market, set a threshold, get a message when it's hit. A timer-triggered
Azure Function polls active alerts every 30 seconds and moves them to a
completed list once they fire.

## Scope

This is a personal tool, and it's worth being upfront about what that means
before you read further:

- **One recipient.** Every notification goes to the single `TELEGRAM_CHAT_ID`
  configured at deploy time. There are no per-user destinations.
- **No accounts, no auth.** Any visitor to a running instance can create and
  see alerts, and those alerts notify the deployer's chat.
- **The interface is functional, not designed.** A search box, a form, a list.

So it's built for one person to run for themselves. If you want it, deploy your
own instance from the Bicep templates below rather than using someone else's —
the multi-user version of this would need real accounts and per-user chat IDs,
and none of that is here.

It costs under $1/month on Azure, which was the point: the paid alert services
in this space charge monthly for what amounts to a polling loop and a bot token.

## Architecture

**Frontend** — React 19.2, deployed to Azure Static Web Apps. Market search,
alert creation, active-alert dashboard. Talks to the backend over REST.

**Backend** — Azure Functions v4 on Node.js 22, consumption plan:

| Function | Trigger | Role |
| --- | --- | --- |
| `getMarkets` | HTTP | Search/browse active markets |
| `getMarketById` | HTTP | Market detail with outcome prices |
| `createActiveAlert` | HTTP | Create an alert (validated, deduplicated) |
| `getActiveAlerts` | HTTP | List pending alerts |
| `getCompletedAlerts` | HTTP | List alerts that have fired |
| `pollActiveAlerts` | Timer, 30s | Check thresholds, notify, archive |

**Storage** — Azure Cosmos DB, serverless tier. Two collections: active and
completed alerts.

**Upstream** — Polymarket's Gamma API for market data, cached and refreshed
every 5 minutes so the poller isn't hammering it. Telegram Bot API for delivery.

### API

| Endpoint | Method | Description |
| --- | --- | --- |
| `/markets` | GET | Active markets, optional `?q=` search |
| `/markets/{id}` | GET | Market detail with outcomes and prices |
| `/active-alerts` | GET | All pending alerts |
| `/active-alerts` | POST | Create an alert |
| `/completed-alerts` | GET | History of triggered alerts |

Alerts support `above` and `below` thresholds, with validation on both client
and server and duplicate detection on create.

## Running it locally

Requires Node.js 22+, Azure Functions Core Tools, Azurite, a Cosmos DB account
and a Telegram bot token.

```bash
cp backend/local.settings.example.json backend/local.settings.json  # fill in values
cp frontend/.env.example frontend/.env
```

Then start Azurite, the backend and the frontend in three terminals. Full
step-by-step instructions, including how to get your Telegram chat ID, are in
[docs/local-development.md](docs/local-development.md).

## Deploying your own

Infrastructure is Bicep, in `infra/`:

```powershell
az login --use-device-code
.\infra\deploy.ps1 -TelegramBotToken "<your-token>" -TelegramChatId "<your-chat-id>"
```

That provisions Cosmos DB (serverless, northeurope), a Function App
(consumption), a Static Web App (free tier), a storage account, Application
Insights and Log Analytics — everything but Cosmos in westeurope.

Then set the three GitHub secrets and push to `main`; GitHub Actions deploys
frontend and backend. The end-to-end guide, including secrets and
troubleshooting, is in [docs/deployment-guide.md](docs/deployment-guide.md).

## License

MIT — see [LICENSE](LICENSE).
