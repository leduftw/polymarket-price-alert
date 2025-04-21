// server.js

require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cron = require("node-cron");
const fetch = require("node-fetch"); // v2.x
const { CosmosClient } = require("@azure/cosmos");

const app = express();
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// ── Polymarket API config ─────────────────────────────────────────────────────
const GAMMA_API = "https://gamma-api.polymarket.com";
const PAGE_SIZE = 500,
  MAX_PAGES = 10;

// ── Cosmos DB setup ──────────────────────────────────────────────────────────
const cosmosEndpoint = process.env.COSMOS_ENDPOINT;
const cosmosKey = process.env.COSMOS_KEY;
if (!cosmosEndpoint || !cosmosKey) {
  console.error("Missing COSMOS_ENDPOINT or COSMOS_KEY in env");
  process.exit(1);
}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

const cosmosClient = new CosmosClient({
  endpoint: cosmosEndpoint,
  key: cosmosKey,
});

// ensure AlertsDB database & Alerts container exist (with /marketId partition key)
let database, container;
(async () => {
  const { database: db } = await cosmosClient.databases.createIfNotExists({
    id: "AlertsDB",
  });
  database = db;
  const { container: cont } = await database.containers.createIfNotExists({
    id: "Alerts",
    partitionKey: { kind: "Hash", paths: ["/marketId"] },
  });
  container = cont;
  console.log("✅ Cosmos DB database and container are ready");
})();

// ── In‐memory state ───────────────────────────────────────────────────────────
let persistedAlerts = []; // durable alerts from Cosmos
let alertsInMemory = []; // runtime view with socketId+triggered
let cachedMarkets = []; // for /api/markets

// ── Alert validation helpers ────────────────────────────────────────────────
function isValidAlert(a) {
  const schemaOk =
    typeof a.id === "string" &&
    typeof a.marketId === "string" &&
    Number.isInteger(a.outcomeIndex) &&
    ["above", "below"].includes(a.direction) &&
    typeof a.threshold === "number";
  if (!schemaOk) {
    console.warn(`Skipping invalid alert (id: ${a.id}) due to bad schema`);
    return false;
  }
  return true;
}

function marketExists(id) {
  // since updateCache() has already filled cachedMarkets
  return cachedMarkets.some((m) => m.id === id);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function fetchMarketsPage(limit = PAGE_SIZE, offset = 0) {
  const url = new URL(`${GAMMA_API}/markets`);
  url.searchParams.set("active", "true");
  url.searchParams.set("closed", "false");
  url.searchParams.set("archived", "false");
  url.searchParams.set("limit", limit);
  url.searchParams.set("offset", offset);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gamma /markets → ${res.status}`);
  return res.json();
}

async function updateCache() {
  try {
    let all = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const batch = await fetchMarketsPage(PAGE_SIZE, page * PAGE_SIZE);
      if (!batch.length) break;
      all.push(...batch);
      if (batch.length < PAGE_SIZE) break;
    }
    cachedMarkets = all.map((m) => ({ id: m.id, question: m.question }));
    console.log(`Cached ${cachedMarkets.length} active markets`);
  } catch (err) {
    console.error("Failed to refresh market cache:", err.message);
  }
}

// Load persisted alerts from Cosmos on startup
async function loadPersistedAlerts() {
  try {
    const querySpec = { query: "SELECT * FROM c" };
    const { resources } = await container.items.query(querySpec).fetchAll();

    // filter out any alerts with missing fields or missing markets
    persistedAlerts = resources.filter((a) => {
      if (!isValidAlert(a)) return false;
      if (!marketExists(a.marketId)) {
        console.warn(`Skipping alert (id: ${a.id}) for missing market ${a.marketId}`);
        return false;
      }
      return true;
    });

    console.log(`Loaded ${persistedAlerts.length} persisted alerts`);
  } catch (err) {
    console.error("Error loading persisted alerts:", err.message);
  }
}

// Fetch the current price of one outcome
async function fetchPrice(marketId, outcomeIndex) {
  const resp = await fetch(`${GAMMA_API}/markets/${marketId}`);
  if (!resp.ok) throw new Error(`Gamma /markets/${marketId} → ${resp.status}`);
  const m = await resp.json();
  let prices = m.outcomePrices;
  if (typeof prices === "string") prices = JSON.parse(prices);
  return parseFloat(prices[outcomeIndex]);
}

// Upsert an alert into Cosmos
async function upsertAlertInCosmos(alert) {
  // ensure 'id' and 'marketId' are present for partitioning
  await container.items.upsert(alert);
}

// ── Startup: cache & load alerts ──────────────────────────────────────────────
(async () => {
  await updateCache();
  await loadPersistedAlerts();
})();
cron.schedule("* * * * *", updateCache);

// ── HTTP endpoints ───────────────────────────────────────────────────────────

// List active markets, optional search ?q=
app.get("/api/markets", (req, res) => {
  const { q } = req.query;
  let list = cachedMarkets;
  if (q) {
    const term = q.toLowerCase();
    list = list.filter((m) => m.question.toLowerCase().includes(term));
  }
  res.json(list.slice(0, 20));
});

// Market details (outcomes + prices)
app.get("/api/markets/:id", async (req, res) => {
  try {
    const resp = await fetch(`${GAMMA_API}/markets/${req.params.id}`);
    if (!resp.ok) {
      return res.status(502).json({
        error: `Gamma /markets/${req.params.id} → ${resp.status}`,
      });
    }
    const m = await resp.json();
    let { outcomes, outcomePrices } = m;
    if (typeof outcomes === "string") outcomes = JSON.parse(outcomes);
    if (typeof outcomePrices === "string")
      outcomePrices = JSON.parse(outcomePrices);

    const detail = {
      id: m.id,
      question: m.question,
      outcomes: outcomes.map((label, idx) => ({
        id: idx,
        label,
        price: outcomePrices[idx],
      })),
    };
    res.json(detail);
  } catch (err) {
    console.error("GET /api/markets/:id error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// Return the list of persisted alerts
app.get("/api/alerts", (_req, res) => {
  // in case anything slipped in at runtime, double‑filter
  const safeAlerts = persistedAlerts.filter(
    (a) => isValidAlert(a) && marketExists(a.marketId)
  );
  res.json(safeAlerts);
});

// ── Socket.io for live notifications ────────────────────────────────────────
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // rebind runtime alerts for this socket
  alertsInMemory = persistedAlerts.map((a) => ({
    ...a,
    socketId: socket.id,
    triggered: false,
  }));

  socket.on(
    "createAlert",
    async ({ marketId, outcomeIndex, threshold, direction }) => {
      // server‑side sanity check
      const probe = {
        id: "probe",
        marketId,
        outcomeIndex,
        threshold,
        direction,
      };
      if (!isValidAlert(probe) || !marketExists(marketId)) {
        return socket.emit("alertError", {
          message: !isValidAlert(probe)
            ? "Invalid alert payload."
            : `Market ${marketId} not found.`,
        });
      }

      // duplicate check
      const exists = persistedAlerts.some(
        (a) =>
          a.marketId === marketId &&
          a.outcomeIndex === outcomeIndex &&
          a.threshold === threshold &&
          a.direction === direction
      );
      if (exists) {
        return socket.emit("alertError", {
          message: "You already have that alert.",
        });
      }

      // create new alert
      const id = Date.now().toString();
      const newAlert = { id, marketId, outcomeIndex, threshold, direction };

      // persist in Cosmos
      try {
        await upsertAlertInCosmos(newAlert);
        persistedAlerts.push(newAlert);
      } catch (err) {
        console.error("Error persisting alert:", err.message);
        return socket.emit("alertError", { message: "Failed to save alert." });
      }

      // Register in memory
      alertsInMemory.push({
        ...newAlert,
        socketId: socket.id,
        triggered: false,
      });

      socket.emit("alertCreated", { id });
    }
  );

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// Poll every 10 seconds to fire alerts
cron.schedule("*/10 * * * * *", async () => {
  for (const alert of alertsInMemory.filter((a) => !a.triggered)) {
    try {
      const price = await fetchPrice(alert.marketId, alert.outcomeIndex);
      const hit =
        alert.direction === "below"
          ? price <= alert.threshold
          : price >= alert.threshold;
      if (hit) {
        alert.triggered = true;
        io.to(alert.socketId).emit("alertTriggered", {
          marketId: alert.marketId,
          outcomeIndex: alert.outcomeIndex,
          price,
        });
      }
    } catch (err) {
      console.error("Error checking alert", alert.id, err.message);
    }
  }
});

// ── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () =>
  console.log(`🚀 Server listening on http://localhost:${PORT}`)
);
