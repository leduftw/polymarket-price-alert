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
let container;
(async () => {
  const { database } = await cosmos.databases.createIfNotExists({
    id: "AlertsDB",
  });
  const { container: cont } = await database.containers.createIfNotExists({
    id: "Alerts",
    partitionKey: { kind: "Hash", paths: ["/marketId"] },
  });
  container = cont;
  console.log("Cosmos DB database and container are ready");
})();

// ── Market cache ───────────────────────────────────────────────────────────────
let marketCache = [];

/** Fetch one page of active markets */
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

/** Fetch & populate the in‑memory marketCache */
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
// initial load + every 1 minute
refreshMarketCache();
setInterval(refreshMarketCache, 5 * 60 * 1000);

/** Return the cached list (for your HTTP getMarkets) */
function getCachedMarkets() {
  return marketCache;
}

/** Cheap exists check against the cache */
function marketExists(id) {
  return marketCache.some((m) => m.id === id);
}

// ── Cosmos helpers ────────────────────────────────────────────────────────────
async function listAlerts() {
  const { resources } = await container.items
    .query("SELECT * FROM c")
    .fetchAll();
  return resources;
}
async function upsertAlert(a) {
  await container.items.upsert(a);
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

/**
 * Validate the shape of an alert object.
 */
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

/**
 * Check that a given marketId is in the current active markets.
 */
async function marketExists(marketId) {
  return marketCache.some((m) => m.id === marketId);
}

// ── Exports ───────────────────────────────────────────────────────────────────
module.exports = {
  // market cache
  getCachedMarkets,

  // alerts store
  listAlerts,
  upsertAlert,

  // validation
  isValidAlert,
  marketExists,

  // price check
  fetchPrice,
};
