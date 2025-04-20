// server.js

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cron = require("node-cron");
const fetch = require("node-fetch"); // v2.x
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const GAMMA_API = "https://gamma-api.polymarket.com";
const PAGE_SIZE = 500;
const MAX_PAGES = 10;

// — Load persisted alerts from alerts.json —
const alertsFile = path.join(__dirname, "alerts.json");
let persistedAlerts = [];
try {
  const raw = fs.readFileSync(alertsFile, "utf-8");
  persistedAlerts = JSON.parse(raw);
} catch (_) {
  persistedAlerts = [];
}

// — In‑memory alerts for live notifications (socketId + triggered) —
let alertsInMemory = [];

// — In‑memory cache of active market summaries —
let cachedMarkets = [];

/**
 * Fetch one page of active markets
 */
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

/**
 * Refresh the market cache (up to PAGE_SIZE*MAX_PAGES items)
 */
async function updateCache() {
  try {
    let all = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const offset = page * PAGE_SIZE;
      const batch = await fetchMarketsPage(PAGE_SIZE, offset);
      if (!batch.length) break;
      all.push(...batch);
      if (batch.length < PAGE_SIZE) break;
    }
    cachedMarkets = all.map((m) => ({
      id: m.id,
      question: m.question,
    }));
    if (updateMarketCount === 0) {
      console.log(`Loaded ${cachedMarkets.length} active markets`);
    } else {
      console.log(`Cached ${cachedMarkets.length} active markets`);
    }
    updateMarketCount++;
  } catch (err) {
    console.error("Failed to refresh market cache:", err.message);
  }
}

// initial load + every 1 minute
let updateMarketCount = 0;
console.log(`Loading all active markets (max ${PAGE_SIZE * MAX_PAGES})...`);
(async () => {
  await updateCache();
})();
cron.schedule("* * * * *", updateCache);

/**
 * GET /api/markets
 * Returns up to 20 active market summaries [{ id, question }],
 * optionally filtered by ?q=
 */
app.get("/api/markets", (req, res) => {
  const { q } = req.query;
  let list = cachedMarkets;
  if (q) {
    const term = q.toLowerCase();
    list = list.filter((m) => m.question.toLowerCase().includes(term));
  }
  res.json(list.slice(0, 20));
});

/**
 * GET /api/markets/:id
 * Returns full details (outcomes & prices) for one market
 */
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

/**
 * GET /api/alerts
 * Returns the list of persisted alerts
 */
app.get("/api/alerts", (req, res) => {
  res.json(persistedAlerts);
});

/**
 * Helper: fetch latest price for a single outcome
 */
async function fetchPrice(marketId, outcomeIndex) {
  const resp = await fetch(`${GAMMA_API}/markets/${marketId}`);
  if (!resp.ok) {
    throw new Error(`Gamma /markets/${marketId} → ${resp.status}`);
  }
  const m = await resp.json();
  let prices = m.outcomePrices;
  if (typeof prices === "string") prices = JSON.parse(prices);
  return parseFloat(prices[outcomeIndex]);
}

/**
 * Socket.io: register alerts and assign socketId to persisted ones
 */
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // Re-bind persisted alerts to this socket for notifications
  alertsInMemory = persistedAlerts.map((a) => ({
    ...a,
    socketId: socket.id,
    triggered: false,
  }));

  socket.on(
    "createAlert",
    ({ marketId, outcomeIndex, threshold, direction }) => {
      // Duplicate check
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

      // Persist new alert
      const id = Date.now().toString();
      const newAlert = { id, marketId, outcomeIndex, threshold, direction };
      persistedAlerts.push(newAlert);
      fs.writeFileSync(alertsFile, JSON.stringify(persistedAlerts, null, 2));

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

/**
 * Cron: every minute, check non-triggered in-memory alerts
 */
cron.schedule('*/10 * * * * *', async () => {
  for (const alert of alertsInMemory.filter((a) => !a.triggered)) {
    try {
      const price = await fetchPrice(alert.marketId, alert.outcomeIndex);
      const hit =
        alert.direction === "below"
          ? price < alert.threshold
          : price > alert.threshold;
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

server.listen(3001, () =>
  console.log("🚀 Server listening on http://localhost:3001")
);
