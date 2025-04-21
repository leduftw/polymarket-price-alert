// shared.js

const fetch = require("node-fetch");
const { CosmosClient } = require("@azure/cosmos");

// Polymarket API configuration
const GAMMA = {
  API: "https://gamma-api.polymarket.com",
  PAGE: 500,
  MAXPG: 10,
};

// Cosmos DB client setup
const cosmos = new CosmosClient({
  endpoint: process.env.COSMOS_ENDPOINT,
  key: process.env.COSMOS_KEY,
});
let container;

(async () => {
  // Ensure the database and container exist
  const { database } = await cosmos.databases.createIfNotExists({
    id: "AlertsDB",
  });
  const result = await database.containers.createIfNotExists({
    id: "Alerts",
    partitionKey: { kind: "Hash", paths: ["/marketId"] },
  });
  container = result.container;
  console.log("Cosmos DB database and container are ready");
})();

/**
 * Fetch a single page of active markets
 */
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

/**
 * Fetch all active markets (paginated) and return only id+question
 */
async function getAllActiveMarkets() {
  let all = [],
    batch;
  for (let i = 0; i < GAMMA.MAXPG; i++) {
    batch = await fetchMarketsPage(GAMMA.PAGE, i * GAMMA.PAGE);
    if (!batch.length) break;
    all.push(...batch);
    if (batch.length < GAMMA.PAGE) break;
  }
  return all.map((m) => ({ id: m.id, question: m.question }));
}

/**
 * List all persisted alerts from Cosmos DB
 */
async function listAlerts() {
  const { resources } = await container.items
    .query("SELECT * FROM c")
    .fetchAll();
  return resources;
}

/**
 * Upsert (insert or replace) an alert document in Cosmos DB
 */
async function upsertAlert(a) {
  await container.items.upsert(a);
}

/**
 * Fetch the current price for one market outcome
 */
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
    (a.threshold > 0 && a.threshold < 1);
  return ok;
}

/**
 * Check that a given marketId is in the current active markets.
 */
async function marketExists(marketId) {
  const markets = await getAllActiveMarkets();
  return markets.some((m) => m.id === marketId);
}

module.exports = {
  fetchMarketsPage,
  getAllActiveMarkets,
  listAlerts,
  upsertAlert,
  fetchPrice,
  isValidAlert,
  marketExists,
};
