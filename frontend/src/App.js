// src/App.js

import React, { useState, useEffect } from "react";
import io from "socket.io-client";
import "./App.css";

function App() {
  const [socket] = useState(() => io("http://localhost:3001"));
  const [markets, setMarkets] = useState([]);
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState(null);
  const [alertsList, setAlertsList] = useState([]);
  const [form, setForm] = useState({
    marketId: "",
    outcomeIndex: 0,
    thresholdDigits: "80", // represents 0.80
    direction: "below",
  });
  const [status, setStatus] = useState("");

  // ─── helper: drop any alert missing its required fields ────────────────────
  const isValidAlert = (a) => {
    const ok =
      typeof a.id === "string" &&
      typeof a.marketId === "string" &&
      Number.isInteger(a.outcomeIndex) &&
      ["above", "below"].includes(a.direction) &&
      typeof a.threshold === "number" &&
      (a.threshold > 0 && a.threshold < 1);
    if (!ok)
      console.warn(`Skipping invalid alert due to bad schema (id: ${a.id})`);
    return ok;
  };
  // ───────────────────────────────────────────────────────────────────────────

  // 1) Load persisted alerts & enrich with question+label
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/alerts");
        const raw = await res.json();
        const enriched = await Promise.all(
          raw.map(async (a) => {
            const resp = await fetch(`/api/markets/${a.marketId}`);
            const det = await resp.json();
            return {
              ...a,
              question: det.question,
              label: det.outcomes[a.outcomeIndex]?.label || "",
              triggered: false,
            };
          })
        );
        setAlertsList(enriched.filter(isValidAlert));
      } catch (err) {
        console.error("Error loading alerts", err);
      }
    })();
  }, []);

  // 2) Fetch market summaries when `query` changes
  useEffect(() => {
    const url =
      "/api/markets" + (query ? `?q=${encodeURIComponent(query)}` : "");
    fetch(url)
      .then((r) => r.json())
      .then(setMarkets)
      .catch((err) => console.error("Fetch markets error", err));
  }, [query]);

  // 3) Fetch market details when marketId changes
  useEffect(() => {
    if (!form.marketId) {
      setDetail(null);
      return;
    }
    fetch(`/api/markets/${form.marketId}`)
      .then((r) => r.json())
      .then((data) => {
        data.outcomes = data.outcomes.map((o) => ({
          ...o,
          price: parseFloat(o.price),
        }));
        setDetail(data);
        setForm((f) => ({ ...f, outcomeIndex: 0 }));
      })
      .catch((err) => console.error("Fetch detail error", err));
  }, [form.marketId]);

  // 4) Request notification permission on load
  useEffect(() => {
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // 5) Handle socket events
  useEffect(() => {
    socket.on("alertCreated", async () => {
      setStatus("Alert created! 🎉");
      try {
        const raw = await (await fetch("/api/alerts")).json();
        const enriched = await Promise.all(
          raw.map(async (a) => {
            const det = await (
              await fetch(`/api/markets/${a.marketId}`)
            ).json();
            return {
              ...a,
              question: det.question,
              label: det.outcomes[a.outcomeIndex]?.label || "",
              triggered: false,
            };
          })
        );
        setAlertsList(enriched.filter(isValidAlert));
      } catch (err) {
        console.error("Error reloading alerts", err);
      }
      setTimeout(() => setStatus(""), 3000);
    });

    socket.on("alertError", ({ message }) => {
      setStatus(message);
      setTimeout(() => setStatus(""), 3000);
    });

    socket.on("alertTriggered", ({ marketId, outcomeIndex, price }) => {
      setAlertsList((prev) =>
        prev.map((a) =>
          a.marketId === marketId && a.outcomeIndex === outcomeIndex
            ? { ...a, triggered: true }
            : a
        )
      );
      const a = alertsList.find(
        (x) => x.marketId === marketId && x.outcomeIndex === outcomeIndex
      );
      if (a) {
        new Notification("Price Alert!", {
          body: `${a.question}\n"${a.label}" is now ${price.toFixed(2)}`,
        });
      }
    });

    return () => {
      socket.off("alertCreated");
      socket.off("alertError");
      socket.off("alertTriggered");
    };
  }, [socket, alertsList]);

  // ─── threshold: derive numeric value & validate ────────────────────────────
  const threshold = parseFloat(`0.${form.thresholdDigits}`);
  const currentPrice = detail?.outcomes[form.outcomeIndex]?.price ?? 0;
  // round to two decimals to match the UI
  const displayedPrice = parseFloat(currentPrice.toFixed(2));

  let thresholdError = "";
  if (detail) {
    if (form.direction === "above") {
      // strictly greater than the displayed price, and ≤ 0.99
      if (threshold <= displayedPrice || threshold > 0.99) {
        thresholdError = `For “Above”, must be > ${displayedPrice.toFixed(
          2
        )} and ≤ 0.99.`;
      }
    } else {
      // strictly less than the displayed price, and ≥ 0.01
      if (threshold < 0.01 || threshold >= displayedPrice) {
        thresholdError = `For “Below”, must be ≥ 0.01 and < ${displayedPrice.toFixed(
          2
        )}.`;
      }
    }
  }

  const isSubmitDisabled = Boolean(thresholdError);
  // ───────────────────────────────────────────────────────────────────────────

  // 6) Form submission: create alert
  const handleSubmit = (e) => {
    e.preventDefault();
    if (
      alertsList.some(
        (a) =>
          a.marketId === form.marketId &&
          a.outcomeIndex === form.outcomeIndex &&
          a.threshold === threshold &&
          a.direction === form.direction
      )
    ) {
      setStatus("You already have that alert.");
      setTimeout(() => setStatus(""), 3000);
      return;
    }
    socket.emit("createAlert", {
      marketId: form.marketId,
      outcomeIndex: form.outcomeIndex,
      threshold,
      direction: form.direction,
    });
  };

  return (
    <div
      className="App"
      style={{ maxWidth: 600, margin: "2rem auto", padding: "0 1rem" }}
    >
      <h1>Polymarket Price Alerts</h1>

      {/* Search box */}
      <input
        type="search"
        placeholder="Search markets…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: "100%", marginBottom: "1rem" }}
      />

      <form onSubmit={handleSubmit}>
        {/* Market selector */}
        <div style={{ marginBottom: "1rem" }}>
          <label>
            Market
            <br />
            <select
              value={form.marketId}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  marketId: e.target.value,
                  outcomeIndex: 0,
                }))
              }
              required
              style={{ width: "100%" }}
            >
              <option value="">— pick market —</option>
              {markets.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.question}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Outcome selector */}
        {detail && (
          <div style={{ marginBottom: "1rem" }}>
            <label>
              Outcome
              <br />
              <select
                value={form.outcomeIndex}
                onChange={(e) =>
                  setForm((f) => ({ ...f, outcomeIndex: +e.target.value }))
                }
                style={{ width: "100%" }}
              >
                {detail.outcomes.map((o, i) => (
                  <option key={i} value={i}>
                    {o.label} ({o.price.toFixed(2)})
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {/* Above/Below */}
        {detail && (
          <div style={{ marginBottom: "1rem" }}>
            <label>
              Condition
              <br />
              <select
                value={form.direction}
                onChange={(e) =>
                  setForm((f) => ({ ...f, direction: e.target.value }))
                }
                style={{ width: "100%" }}
              >
                <option value="below">Below</option>
                <option value="above">Above</option>
              </select>
            </label>
          </div>
        )}

        {/* Threshold input */}
        <div style={{ marginBottom: "1rem" }}>
          <label>
            Threshold
            <br />
            <div style={{ display: "flex", width: "100%" }}>
              <span
                style={{
                  padding: "0.5rem",
                  background: "#f0f0f0",
                  border: "1px solid #ccc",
                  borderRight: "none",
                  borderRadius: "4px 0 0 4px",
                }}
              >
                0.
              </span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={2}
                value={form.thresholdDigits}
                onChange={(e) => {
                  const digits = e.target.value
                    .replace(/[^0-9]/g, "")
                    .slice(0, 2);
                  setForm((f) => ({ ...f, thresholdDigits: digits }));
                }}
                required
                style={{
                  flex: "1",
                  border: "1px solid #ccc",
                  borderLeft: "none",
                  borderRadius: "0 4px 4px 0",
                  padding: "0.5rem",
                }}
              />
            </div>
            {thresholdError && (
              <p
                style={{
                  color: "red",
                  fontSize: "0.875rem",
                  margin: "0.25rem 0 0",
                }}
              >
                {thresholdError}
              </p>
            )}
          </label>
        </div>

        <button type="submit" disabled={isSubmitDisabled}>
          Set Browser Alert
        </button>
      </form>

      {status && <p style={{ marginTop: "1rem" }}>{status}</p>}

      {/* Current Alerts */}
      {alertsList.length > 0 && (
        <div style={{ marginTop: "2rem" }}>
          <h2>Your Alerts</h2>
          <ul>
            {alertsList.map((a, i) => (
              <li key={i}>
                <strong>{a.question}</strong> → “{a.label}” {a.direction}{" "}
                {a.threshold.toFixed(2)}
                {a.triggered && (
                  <span style={{ color: "red" }}> (Triggered)</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default App;
