import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from './api.js';
import './DoctorPatients.css';

let nextKey = 1;
const newItem = () => ({ key: nextKey++, medicineId: '', quantity: '1' });

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

function fmt12(t) {
  const [h, m] = t.split(':').map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function fmtDate(d) {
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function ageFrom(dob) {
  const b = new Date(`${dob}T00:00:00`);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) {
    age -= 1;
  }
  return age;
}

export default function ConsultationPage() {
  const { appointmentId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([]);

  async function load() {
    try {
      setData(await api(`/doctor/appointments/${appointmentId}`));
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    api(`/doctor/appointments/${appointmentId}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [appointmentId]);

  function updateItem(key, changes) {
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...changes } : it)));
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    if (diagnosis.trim().length < 3) return setError('Enter the diagnosis.');
    for (const it of items) {
      if (!it.medicineId) return setError('Choose a medicine for every row, or remove the empty row.');
      const q = Number(it.quantity);
      if (!Number.isInteger(q) || q < 1) return setError('Each quantity must be a whole number of at least 1.');
    }

    setBusy(true);
    try {
      const res = await api(`/doctor/appointments/${appointmentId}/consult`, {
        method: 'POST',
        body: JSON.stringify({
          diagnosis,
          notes,
          items: items.map((it) => ({
            medicineId: Number(it.medicineId),
            quantity: Number(it.quantity),
          })),
        }),
      });
      setNotice(
        res.prescriptionId
          ? `Saved. Prescription #${res.prescriptionId} was sent to the pharmacy.`
          : 'Saved. The visit is completed.',
      );
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <>
        <p><Link to="/my-patients">Back to my patients</Link></p>
        {error ? <div role="alert" className="alert">{error}</div> : <p className="muted">Loading…</p>}
      </>
    );
  }

  const { appointment: a, medicines, consultation, prescription } = data;
  const isPending = a.status === 'scheduled';
  const chosen = new Set(items.map((it) => it.medicineId).filter(Boolean));
  const stockOf = (medicineId) => medicines.find((m) => String(m.id) === String(medicineId))?.stock ?? 0;

  return (
    <>
      <p><Link to="/my-patients">Back to my patients</Link></p>
      <h1>{a.patientName}</h1>
      <p className="page-sub">
        {fmtDate(a.date)}, {fmt12(a.time)} · {a.clinic}
        {a.dateOfBirth ? ` · ${ageFrom(a.dateOfBirth)} years old` : ''}
        {a.gender ? ` · ${a.gender}` : ''}
      </p>

      {notice && (
        <div
          role="status"
          className="panel"
          style={{ padding: '0.75rem 1rem', marginBottom: '1rem', borderColor: 'var(--mp-teal)' }}
        >
          {notice}
        </div>
      )}
      {error && <div role="alert" className="alert">{error}</div>}

      {isPending ? (
        <form className="panel dp-form" onSubmit={save} noValidate>
          <h2>Diagnosis and prescription</h2>

          <div className="dp-field">
            <label htmlFor="dx">Diagnosis *</label>
            <textarea
              id="dx"
              rows={3}
              maxLength={2000}
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              autoFocus
            />
          </div>

          <div className="dp-field">
            <label htmlFor="notes">Notes</label>
            <textarea
              id="notes"
              rows={2}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <fieldset className="dp-items">
            <legend>Medicines to prescribe</legend>
            <p className="dp-hint">
              {a.branchName
                ? `The prescription goes to the pharmacist at ${a.branchName}. Stock shown is that branch’s.`
                : 'This clinic is not linked to a pharmacy branch yet, so medicines cannot be sent.'}{' '}
              Leave empty if no medicine is needed.
            </p>

            {items.map((it, index) => {
              const stock = stockOf(it.medicineId);
              const over = it.medicineId && Number(it.quantity) > stock;
              return (
                <div className="dp-row" key={it.key}>
                  <div className="dp-field dp-field--grow">
                    <label htmlFor={`med-${it.key}`}>Medicine {index + 1}</label>
                    <select
                      id={`med-${it.key}`}
                      value={it.medicineId}
                      onChange={(e) => updateItem(it.key, { medicineId: e.target.value })}
                    >
                      <option value="">Choose a medicine</option>
                      {medicines.map((m) => (
                        <option
                          key={m.id}
                          value={m.id}
                          disabled={chosen.has(String(m.id)) && String(m.id) !== it.medicineId}
                        >
                          {m.name}{m.unit ? ` (${m.unit})` : ''}, stock {m.stock}
                        </option>
                      ))}
                    </select>
                    {over && (
                      <p className="dp-warn">
                        This is more than the branch has in stock. The pharmacist will see it flagged out of stock.
                      </p>
                    )}
                  </div>
                  <div className="dp-field dp-field--qty">
                    <label htmlFor={`qty-${it.key}`}>Quantity</label>
                    <input
                      id={`qty-${it.key}`}
                      type="number"
                      min="1"
                      step="1"
                      value={it.quantity}
                      onChange={(e) => updateItem(it.key, { quantity: e.target.value })}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setItems((list) => list.filter((x) => x.key !== it.key))}
                    aria-label={`Remove medicine ${index + 1}`}
                  >
                    Remove
                  </button>
                </div>
              );
            })}

            <button
              type="button"
              className="btn"
              disabled={items.length >= 20 || !a.branchName}
              onClick={() => setItems((list) => [...list, newItem()])}
            >
              Add a medicine
            </button>
          </fieldset>

          <div className="dp-actions">
            <button className="btn dp-submit" type="submit" disabled={busy}>
              {busy
                ? 'Saving…'
                : items.length > 0 ? 'Save and send to pharmacy' : 'Save diagnosis'}
            </button>
          </div>
        </form>
      ) : (
        <div className="panel dp-summary">
          <h2>Visit summary <span className="state state-ok">{a.status}</span></h2>
          <p><strong>Diagnosis:</strong> {consultation?.diagnosis ?? 'Not recorded'}</p>
          {consultation?.notes && <p><strong>Notes:</strong> {consultation.notes}</p>}

          <h3>Prescription</h3>
          {prescription ? (
            <>
              <p>
                #{prescription.id} at {prescription.branchName} <Status value={prescription.status} />
              </p>
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
                  {prescription.items.map((i) => (
                    <tr key={i.name}>
                      <td>{i.name}{i.unit ? ` (${i.unit})` : ''}</td>
                      <td className="num">{i.quantityRequested}</td>
                      <td className="num">{i.quantityDispensed}</td>
                      <td><Status value={i.itemStatus} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="muted">No medicine was prescribed.</p>
          )}
        </div>
      )}
    </>
  );
}
