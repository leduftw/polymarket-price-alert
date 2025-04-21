// shared.js

const fetch = require("node-fetch");
const { CosmosClient } = require("@azure/cosmos");

// ── Polymarket API config ─────────────────────────────────────────────────────
const GAMMA = {
  API: "https://gamma-api.polymarket.com",
  PAGE: 500,
  MAXPG: 10,
};

// ── Cosmos DB client setup ─────────────────────────────────────────────────────
const cosmos = new CosmosClient({
  endpoint: process.env.COSMOS_ENDPOINT,
  key: process.env.COSMOS_KEY,
});
let activeContainer, completedContainer;
(async () => {
  const { database } = await cosmos.databases.createIfNotExists({
    id: "AlertsDB",
  });

  // Active alerts container
  const { container: aCont } = await database.containers.createIfNotExists({
    id: "ActiveAlerts",
    partitionKey: { kind: "Hash", paths: ["/marketId"] },
  });

  // Completed alerts container
  const { container: cCont } = await database.containers.createIfNotExists({
    id: "CompletedAlerts",
    partitionKey: { kind: "Hash", paths: ["/marketId"] },
  });

  activeContainer = aCont;
  completedContainer = cCont;
  console.log("Cosmos DB containers are ready: ActiveAlerts, CompletedAlerts");
})();

// ── Market cache ───────────────────────────────────────────────────────────────
let marketCache = [];

async function fetchMarketsPage(limit = GAMMA.PAGE, offset = 0) {
  const url = new URL(`${GAMMA.API}/markets`);
  url.searchParams.set("active", "true");
  url.searchParams.set("closed", "false");
  url.searchParams.set("archived", "false");
  url.searchParams.set("limit", limit);
  url.searchParams.set("offset", offset);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gamma → ${res.status}`);
  return res.json();
}

async function refreshMarketCache() {
  try {
    let all = [],
      batch;
    for (let i = 0; i < GAMMA.MAXPG; i++) {
      batch = await fetchMarketsPage(GAMMA.PAGE, i * GAMMA.PAGE);
      if (!batch.length) break;
      all.push(...batch);
      if (batch.length < GAMMA.PAGE) break;
    }
    marketCache = all.map((m) => ({ id: m.id, question: m.question }));
    console.log(`Refreshed market cache (${marketCache.length} items)`);
  } catch (err) {
    console.error("Failed to refresh market cache:", err.message);
  }
}
refreshMarketCache();
setInterval(refreshMarketCache, 5 * 60 * 1000);

function getCachedMarkets() {
  return marketCache;
}

function marketExists(id) {
  return marketCache.some((m) => m.id === id);
}

// ── Cosmos helpers ────────────────────────────────────────────────────────────
async function listActiveAlerts() {
  const { resources } = await activeContainer.items
    .query("SELECT * FROM c")
    .fetchAll();
  return resources;
}

async function listCompletedAlerts() {
  const { resources } = await completedContainer.items
    .query("SELECT * FROM c")
    .fetchAll();
  return resources;
}

async function upsertActiveAlert(alert) {
  await activeContainer.items.upsert(alert);
}

async function deleteActiveAlert(id, marketId) {
  await activeContainer.item(id, marketId).delete();
}

async function upsertCompletedAlert(completed) {
  await completedContainer.items.upsert(completed);
}

// ── Price helper ──────────────────────────────────────────────────────────────
async function fetchPrice(marketId, outcomeIndex) {
  const res = await fetch(`${GAMMA.API}/markets/${marketId}`);
  if (!res.ok) throw new Error(`Gamma /markets/${marketId} → ${resp.status}`);
  const m = await res.json();
  let prices = m.outcomePrices;
  if (typeof prices === "string") prices = JSON.parse(prices);
  return parseFloat(prices[outcomeIndex]);
}

// ── Validation ────────────────────────────────────────────────────────────────
function isValidAlert(a) {
  const ok =
    typeof a.id === "string" &&
    typeof a.marketId === "string" &&
    Number.isInteger(a.outcomeIndex) &&
    ["above", "below"].includes(a.direction) &&
    typeof a.threshold === "number" &&
    a.threshold > 0 &&
    a.threshold < 1;
  return ok;
}

async function marketExists(marketId) {
  return marketCache.some((m) => m.id === marketId);
}

// ── Exports ───────────────────────────────────────────────────────────────────
module.exports = {
  // market cache
  getCachedMarkets,

  // alerts
  listActiveAlerts,
  listCompletedAlerts,
  upsertActiveAlert,
  deleteActiveAlert,
  upsertCompletedAlert,

  // helper
  fetchPrice,
  isValidAlert,
  marketExists,
};
