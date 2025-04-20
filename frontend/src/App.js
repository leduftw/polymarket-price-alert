// src/App.js

import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import './App.css';

function App() {
  const [socket]     = useState(() => io('http://localhost:3001'));
  const [markets,    setMarkets]    = useState([]);
  const [query,      setQuery]      = useState('');
  const [detail,     setDetail]     = useState(null);
  const [alertsList, setAlertsList] = useState([]);
  const [form,       setForm]       = useState({
    marketId:     '',
    outcomeIndex: 0,
    threshold:    0.8,
    direction:    'below'
  });
  const [status,     setStatus]     = useState('');

  // 1) Load persisted alerts & enrich with question+label
  useEffect(() => {
    (async () => {
      try {
        const res      = await fetch('/api/alerts');
        const raw      = await res.json();
        const enriched = await Promise.all(
          raw.map(async a => {
            const resp   = await fetch(`/api/markets/${a.marketId}`);
            const det    = await resp.json();
            const question = det.question;
            const label    = det.outcomes[a.outcomeIndex]?.label || '';
            return { ...a, question, label, triggered: false };
          })
        );
        setAlertsList(enriched.filter(a => a));
      } catch (err) {
        console.error('Error loading alerts', err);
      }
    })();
  }, []);

  // 2) Fetch market summaries when `query` changes
  useEffect(() => {
    const url = '/api/markets' + (query ? `?q=${encodeURIComponent(query)}` : '');
    fetch(url)
      .then(r => r.json())
      .then(setMarkets)
      .catch(err => console.error('Fetch markets error', err));
  }, [query]);

  // 3) Fetch market details (outcomes + prices) when marketId changes
  useEffect(() => {
    if (!form.marketId) {
      setDetail(null);
      return;
    }
    fetch(`/api/markets/${form.marketId}`)
      .then(r => r.json())
      .then(data => {
        data.outcomes = data.outcomes.map(o => ({ ...o, price: parseFloat(o.price) }));
        setDetail(data);
        setForm(f => ({ ...f, outcomeIndex: 0 }));
      })
      .catch(err => console.error('Fetch detail error', err));
  }, [form.marketId]);

  // 4) Request notification permission on load
  useEffect(() => {
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // 5) Handle socket events
  useEffect(() => {
    socket.on('alertCreated', async () => {
      setStatus('Alert created! 🎉');
      // reload and enrich alerts
      try {
        const raw      = await (await fetch('/api/alerts')).json();
        const enriched = await Promise.all(
          raw.map(async a => {
            const det  = await (await fetch(`/api/markets/${a.marketId}`)).json();
            const q    = det.question;
            const lbl  = det.outcomes[a.outcomeIndex]?.label || '';
            return { ...a, question: q, label: lbl, triggered: false };
          })
        );
        setAlertsList(enriched.filter(a => a));
      } catch (err) {
        console.error('Error reloading alerts', err);
      }
      setTimeout(() => setStatus(''), 3000);
    });

    socket.on('alertError', ({ message }) => {
      setStatus(message);
      setTimeout(() => setStatus(''), 3000);
    });

    socket.on('alertTriggered', ({ marketId, outcomeIndex, price }) => {
      setAlertsList(prev =>
        prev.map(a =>
          a.marketId === marketId && a.outcomeIndex === outcomeIndex
            ? { ...a, triggered: true }
            : a
        )
      );
      const a = alertsList.find(
        x => x.marketId === marketId && x.outcomeIndex === outcomeIndex
      );
      if (a) {
        new Notification('Price Alert!', {
          body: `${a.question}\n"${a.label}" is now ${price.toFixed(2)}`
        });
      }
    });

    return () => {
      socket.off('alertCreated');
      socket.off('alertError');
      socket.off('alertTriggered');
    };
  }, [socket, alertsList]);

  // 6) Form submission: create alert
  const handleSubmit = e => {
    e.preventDefault();
    // client‑side duplicate check
    if (alertsList.some(a =>
      a.marketId     === form.marketId &&
      a.outcomeIndex === form.outcomeIndex &&
      a.threshold    === form.threshold &&
      a.direction    === form.direction
    )) {
      setStatus('You already have that alert.');
      setTimeout(() => setStatus(''), 3000);
      return;
    }
    socket.emit('createAlert', form);
  };

  return (
    <div className="App" style={{ maxWidth: 600, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Polymarket Price Alerts</h1>

      {/* Search box */}
      <input
        type="search"
        placeholder="Search markets…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        style={{ width: '100%', marginBottom: '1rem' }}
      />

      <form onSubmit={handleSubmit}>
        {/* Market selector */}
        <div style={{ marginBottom: '1rem' }}>
          <label>
            Market<br/>
            <select
              value={form.marketId}
              onChange={e => setForm(f => ({
                ...f,
                marketId:     e.target.value,
                outcomeIndex: 0
              }))}
              required
              style={{ width: '100%' }}
            >
              <option value="">— pick market —</option>
              {markets.map(m => (
                <option key={m.id} value={m.id}>
                  {m.question}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Outcome selector */}
        {detail && (
          <div style={{ marginBottom: '1rem' }}>
            <label>
              Outcome<br/>
              <select
                value={form.outcomeIndex}
                onChange={e => setForm(f => ({
                  ...f,
                  outcomeIndex: +e.target.value
                }))}
                style={{ width: '100%' }}
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
          <div style={{ marginBottom: '1rem' }}>
            <label>
              Condition<br/>
              <select
                value={form.direction}
                onChange={e => setForm(f => ({
                  ...f,
                  direction: e.target.value
                }))}
                style={{ width: '100%' }}
              >
                <option value="below">Below</option>
                <option value="above">Above</option>
              </select>
            </label>
          </div>
        )}

        {/* Threshold input */}
        <div style={{ marginBottom: '1rem' }}>
          <label>
            Threshold<br/>
            <input
              type="number"
              step="0.01"
              value={form.threshold}
              onChange={e => setForm(f => ({
                ...f,
                threshold: +e.target.value
              }))}
              required
              style={{ width: '100%' }}
            />
          </label>
        </div>

        <button type="submit">Set Browser Alert</button>
      </form>

      {status && <p style={{ marginTop: '1rem' }}>{status}</p>}

      {/* Current Alerts */}
      {alertsList.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h2>Your Alerts</h2>
          <ul>
            {alertsList.map((a, i) => (
              <li key={i}>
                <strong>{a.question}</strong> → “{a.label}” {a.direction} {a.threshold.toFixed(2)}
                {a.triggered && <span style={{ color: 'red' }}> (Triggered)</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default App;
