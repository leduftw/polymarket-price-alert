// src/App.js

import React, { useState, useEffect } from "react";
import "./App.css";

function App() {
  const [markets, setMarkets] = useState([]);
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState(null);
  const [alertsList, setAlertsList] = useState([]);
  const [form, setForm] = useState({
    marketId: "",
    outcomeIndex: 0,
    thresholdDigits: "20", // represents 0.20
    direction: "below",
  });
  const [status, setStatus] = useState("");

  // ────────────────────────────────────────────────────────────────────────────
  // helper: drop any alert missing its required fields
  const isValidAlert = (a) => {
    const ok =
      typeof a.id === "string" &&
      typeof a.marketId === "string" &&
      Number.isInteger(a.outcomeIndex) &&
      ["above", "below"].includes(a.direction) &&
      typeof a.threshold === "number" &&
      a.threshold > 0 &&
      a.threshold < 1;
    if (!ok) console.warn(`Skipping invalid alert (id: ${a.id})`);
    return ok;
  };
  // ────────────────────────────────────────────────────────────────────────────

  // 1) load persisted alerts on mount
  useEffect(() => {
    (async () => {
      try {
        const raw = await fetch("/api/active-alerts").then((r) => r.json());
        const enriched = await Promise.all(
          raw.map(async (a) => {
            const det = await fetch(`/api/markets/${a.marketId}`).then((r) =>
              r.json()
            );
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

  // 2) fetch market summaries when `query` changes
  useEffect(() => {
    const url =
      "/api/markets" + (query ? `?q=${encodeURIComponent(query)}` : "");
    fetch(url)
      .then((r) => r.json())
      .then(setMarkets)
      .catch((err) => console.error("Fetch markets error", err));
  }, [query]);

  // 3) fetch details for selected market
  useEffect(() => {
    if (!form.marketId) return setDetail(null);
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

  // 4) notify permission
  useEffect(() => {
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // compute numeric threshold & validation
  const threshold = parseFloat(`0.${form.thresholdDigits}`);
  const currentPrice = detail?.outcomes[form.outcomeIndex]?.price ?? 0;
  const displayedPrice = parseFloat(currentPrice.toFixed(2));
  let thresholdError = "";
  if (detail) {
    if (form.direction === "above") {
      if (threshold <= displayedPrice || threshold > 0.99) {
        thresholdError = `For “Above”, must be > ${displayedPrice.toFixed(
          2
        )} and ≤ 0.99.`;
      }
    } else {
      if (threshold < 0.01 || threshold >= displayedPrice) {
        thresholdError = `For “Below”, must be ≥ 0.01 and < ${displayedPrice.toFixed(
          2
        )}.`;
      }
    }
  }
  const isSubmitDisabled = Boolean(thresholdError);

  // 5) form submit: call POST /api/active-alerts
  const handleSubmit = async (e) => {
    e.preventDefault();
    // client‑side duplicate check
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

    try {
      const payload = {
        marketId: form.marketId,
        outcomeIndex: form.outcomeIndex,
        threshold: threshold,
        direction: form.direction,
      };
      const res = await fetch("/api/active-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || res.status);
      }

      const newAlert = await res.json();
      // fetch question+label for display
      const det = await fetch(`/api/markets/${newAlert.marketId}`).then((r) =>
        r.json()
      );
      const enriched = {
        ...newAlert,
        question: det.question,
        label: det.outcomes[newAlert.outcomeIndex]?.label || "",
        triggered: false,
      };
      setAlertsList((list) => [...list, enriched]);
      setStatus("Alert created! 🎉");
      setTimeout(() => setStatus(""), 3000);
    } catch (err) {
      console.error("Error creating alert", err);
      setStatus("Failed to create alert.");
      setTimeout(() => setStatus(""), 3000);
    }
  };

  return (
    <div
      className="App"
      style={{ maxWidth: 600, margin: "2rem auto", padding: "0 1rem" }}
    >
      <h1>Polymarket Price Alerts</h1>

      {/* Search */}
      <input
        type="search"
        placeholder="Search markets…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: "100%", marginBottom: "1rem" }}
      />

      <form onSubmit={handleSubmit}>
        {/* Market */}
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

        {/* Outcome */}
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

        {/* Condition */}
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

        {/* Threshold */}
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
                  flex: 1,
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

      {/* Your Alerts */}
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
