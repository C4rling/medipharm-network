import { useEffect, useState } from 'react';
import { api } from './api.js';

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

  return (
    <main style={{ maxWidth: 800, margin: '2rem auto', padding: '0 1rem', textAlign: 'left' }}>
      <h1>Branch stock</h1>
      <label>
        Branch{' '}
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          {branches.map((b) => (
            <option key={b.branchId} value={b.branchId}>{b.name}</option>
          ))}
        </select>
      </label>

      {error && <p role="alert" style={{ color: '#d32f2f' }}>{error}</p>}

      <table cellPadding="8" style={{ width: '100%', marginTop: '1rem', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th align="left">Medicine</th>
            <th align="left">Unit</th>
            <th align="right">Quantity</th>
            <th align="right">Reorder at</th>
            <th align="left">Updated</th>
          </tr>
        </thead>
        <tbody>
          {stock.map((s) => {
            const low = s.quantity <= s.reorderThreshold;
            return (
              <tr key={s.medicineId} style={{ color: low ? '#d32f2f' : undefined, fontWeight: low ? 600 : 400 }}>
                <td>{s.name}</td>
                <td>{s.unit}</td>
                <td align="right">{s.quantity}</td>
                <td align="right">{s.reorderThreshold}</td>
                <td>{new Date(s.updatedOn).toLocaleString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}