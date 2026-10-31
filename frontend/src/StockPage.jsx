import { useEffect, useState } from 'react';
import { api } from './api.js';

function stockState(s) {
  if (s.quantity === 0) return 'out';
  if (s.quantity <= s.reorderThreshold) return 'low';
  return 'ok';
}

const stateText = { out: 'Out of stock', low: 'Reorder soon', ok: 'In stock' };

// The meter is full when stock is at twice the reorder level or more.
function meterWidth(s) {
  if (s.reorderThreshold <= 0) return s.quantity > 0 ? 100 : 0;
  return Math.min(100, Math.round((s.quantity / (s.reorderThreshold * 2)) * 100));
}

export default function StockPage() {
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [stock, setStock] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/branches')
      .then((rows) => {
        setBranches(rows);
        if (rows.length) setBranchId(String(rows[0].branchId));
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!branchId) return;
    api(`/branches/${branchId}/stock`)
      .then((rows) => { setStock(rows); setError(''); })
      .catch((e) => { setStock([]); setError(e.message); });
  }, [branchId]);

  const flagged = stock.filter((s) => stockState(s) !== 'ok').length;
  let summary = '';
  if (stock.length > 0) {
    summary = flagged > 0
      ? `${flagged} of ${stock.length} medicines need attention.`
      : 'Every medicine is above its reorder level.';
  }

  return (
    <>
      <h1>Branch stock</h1>
      <p className="page-sub">{summary}</p>

      <div className="toolbar">
        <label className="field">
          Branch
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.map((b) => (
              <option key={b.branchId} value={b.branchId}>{b.name}</option>
            ))}
          </select>
        </label>
      </div>

      {error && <div role="alert" className="alert">{error}</div>}

      <div className="panel">
        <table className="ledger">
          <thead>
            <tr>
              <th>Medicine</th>
              <th>Unit</th>
              <th className="num">In stock</th>
              <th className="num">Reorder level</th>
              <th>Status</th>
              <th>Last updated</th>
            </tr>
          </thead>
          <tbody>
            {stock.map((s) => {
              const state = stockState(s);
              return (
                <tr key={s.medicineId} className={state === 'ok' ? '' : `is-${state}`}>
                  <td>{s.name}</td>
                  <td>{s.unit}</td>
                  <td className="num">
                    {s.quantity}
                    <span className="meter" aria-hidden="true">
                      <span style={{ width: `${meterWidth(s)}%` }} />
                    </span>
                  </td>
                  <td className="num">{s.reorderThreshold}</td>
                  <td><span className={`state state-${state}`}>{stateText[state]}</span></td>
                  <td className="muted">{new Date(s.updatedOn).toLocaleString()}</td>
                </tr>
              );
            })}
            {stock.length === 0 && !error && (
              <tr><td colSpan="6" className="muted">No stock recorded for this branch yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
