import { useEffect, useState } from 'react';
import { api } from './api.js';
import NewPrescriptionForm from './NewPrescriptionForm.jsx';

// Reuse the existing state colours: ok = green, low = amber, out = red.
const STATE = {
  pending: 'low',
  partially_dispensed: 'low',
  dispensed: 'ok',
  cancelled: 'out',
  out_of_stock: 'out',
};

function Status({ value }) {
  return (
    <span className={`state state-${STATE[value] ?? 'low'}`}>
      {String(value).replaceAll('_', ' ')}
    </span>
  );
}

export default function PrescriptionsPage({ role }) {
  const [list, setList] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [createdMsg, setCreatedMsg] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function loadList() {
    try {
      setList(await api('/prescriptions'));
    } catch (e) {
      setError(e.message);
    }
  }

  async function loadDetail(id) {
    try {
      setDetail(await api(`/prescriptions/${id}`));
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    api('/prescriptions')
      .then(setList)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    api(`/prescriptions/${selectedId}`)
      .then(setDetail)
      .catch((e) => setError(e.message));
  }, [selectedId]);

  async function handleCreated(id) {
    setShowForm(false);
    setError('');
    setNotice('');
    setCreatedMsg(`Prescription #${id} created. It stays pending until a pharmacist dispenses it.`);
    await loadList();
    setSelectedId(id);
  }

  async function dispense() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await api(`/prescriptions/${selectedId}/dispense`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setNotice(res?.message ?? res?.result ?? 'Dispense completed.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      await loadList();
      await loadDetail(selectedId);
    }
  }

  const closed = detail && ['dispensed', 'cancelled'].includes(detail.status);
  const canDispense = role === 'staff' && detail && !closed;
  const open = list.filter((p) => p.status !== 'dispensed' && p.status !== 'cancelled').length;

  return (
    <>
      <h1>Prescriptions</h1>
      <p className="page-sub">
        {list.length > 0 ? `${open} of ${list.length} prescriptions still need dispensing.` : ''}
      </p>

      <div className="toolbar">
        <button className="btn" onClick={loadList}>Refresh</button>{' '}
        {!showForm && (
          <button
            className="btn"
            onClick={() => {
              setCreatedMsg('');
              setError('');
              setShowForm(true);
            }}
          >
            New prescription
          </button>
        )}
      </div>

      {createdMsg && (
        <div
          role="status"
          className="panel"
          style={{ padding: '0.75rem 1rem', marginBottom: '1rem', borderColor: 'var(--mp-teal)' }}
        >
          {createdMsg}
        </div>
      )}

      {showForm && (
        <NewPrescriptionForm onCreated={handleCreated} onCancel={() => setShowForm(false)} />
      )}

      {error && <div role="alert" className="alert">{error}</div>}

      <div className="panel">
        <table className="ledger">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Patient</th>
              <th>Doctor</th>
              <th>Branch</th>
              <th className="num">Items</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <td className="num">{p.id}</td>
                <td>{p.patient_name}</td>
                <td>{p.doctor_name}</td>
                <td>{p.branch_name}</td>
                <td className="num">{p.item_count}</td>
                <td><Status value={p.status} /></td>
                <td>
                  <button
                    className="btn"
                    onClick={() => {
                      setNotice('');
                      setError('');
                      setCreatedMsg('');
                      setSelectedId(p.id);
                    }}
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
            {list.length === 0 && !error && (
              <tr><td colSpan="7" className="muted">No prescriptions found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {detail && (
        <>
          <h2>Prescription #{detail.id} <Status value={detail.status} /></h2>
          <p className="page-sub">
            {detail.patient_name} · prescribed by {detail.doctor_name} · {detail.branch_name}
          </p>

          {notice && (
            <div
              role="status"
              className="panel"
              style={{ padding: '0.75rem 1rem', borderColor: 'var(--mp-teal)' }}
            >
              {notice}
            </div>
          )}

          <div className="panel">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th className="num">Requested</th>
                  <th className="num">Dispensed</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {detail.items.map((i) => (
                  <tr key={i.id}>
                    <td>{i.medicine}</td>
                    <td className="num">{i.quantity_requested}</td>
                    <td className="num">{i.quantity_dispensed}</td>
                    <td><Status value={i.item_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="toolbar">
            <button className="btn" onClick={dispense} disabled={!canDispense || busy}>
              {busy ? 'Dispensing…' : 'Dispense'}
            </button>
            {role !== 'staff' && <span className="muted">Only pharmacy staff can dispense.</span>}
            {closed && <span className="muted">This prescription is closed.</span>}
          </div>
        </>
      )}
    </>
  );
}
