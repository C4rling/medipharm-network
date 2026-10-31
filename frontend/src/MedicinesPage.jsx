import { useEffect, useState } from 'react';
import { api } from './api.js';

export default function MedicinesPage() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/medicines')
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <h1>Medicines</h1>
      <p className="page-sub">{rows.length > 0 ? `${rows.length} medicines in the catalogue.` : ''}</p>

      {error && <div role="alert" className="alert">{error}</div>}

      <div className="panel">
        <table className="ledger">
          <thead>
            <tr>
              <th>Name</th>
              <th>Generic name</th>
              <th>Form</th>
              <th>Strength</th>
              <th className="num">Reorder level</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan="5" className="muted">Loading medicines…</td></tr>
            )}
            {rows.map((m) => (
              <tr key={m.medicineId}>
                <td>{m.name}</td>
                <td>{m.genericName}</td>
                <td>{m.form}</td>
                <td>{m.unit}</td>
                <td className="num">{m.reorderThreshold}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && !error && (
              <tr><td colSpan="5" className="muted">No medicines have been added yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
