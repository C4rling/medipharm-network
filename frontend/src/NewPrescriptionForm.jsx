import { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import './NewPrescriptionForm.css';

let nextKey = 1;
const newItem = () => ({ key: nextKey++, medicineId: '', quantity: '1' });

export default function NewPrescriptionForm({ onCreated, onCancel }) {
  const [options, setOptions] = useState(null);
  const [patientId, setPatientId] = useState('');
  const [appointmentId, setAppointmentId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([newItem()]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/prescriptions/options')
      .then(setOptions)
      .catch((e) => setError(e.message));
  }, []);

  // Only patients who have an appointment can be prescribed for.
  const patients = useMemo(() => {
    if (!options) return [];
    const byId = new Map();
    for (const a of options.appointments) byId.set(a.patient_id, a.patient_name);
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((x, y) => x.name.localeCompare(y.name));
  }, [options]);

  const appointments = useMemo(
    () => (options ? options.appointments.filter((a) => String(a.patient_id) === patientId) : []),
    [options, patientId],
  );

  function updateItem(key, changes) {
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...changes } : it)));
  }

  function removeItem(key) {
    setItems((list) => (list.length > 1 ? list.filter((it) => it.key !== key) : list));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!patientId) return setError('Choose a patient.');
    if (!appointmentId) return setError('Choose the appointment this prescription comes from.');
    if (!branchId) return setError('Choose a branch.');
    for (const it of items) {
      if (!it.medicineId) return setError('Choose a medicine for every row, or remove the empty row.');
      const q = Number(it.quantity);
      if (!Number.isInteger(q) || q < 1) return setError('Each quantity must be a whole number of at least 1.');
    }

    setBusy(true);
    try {
      const res = await api('/prescriptions', {
        method: 'POST',
        body: JSON.stringify({
          appointmentId: Number(appointmentId),
          branchId: Number(branchId),
          diagnosis,
          notes,
          items: items.map((it) => ({
            medicineId: Number(it.medicineId),
            quantity: Number(it.quantity),
          })),
        }),
      });
      onCreated(res.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const chosen = new Set(items.map((it) => it.medicineId).filter(Boolean));

  return (
    <form className="panel rx-form" onSubmit={handleSubmit} noValidate>
      <h2>New prescription</h2>

      {!options && !error && <p className="muted">Loading choices…</p>}

      {options && options.appointments.length === 0 && (
        <p className="muted">
          No appointments exist yet. A prescription comes from a patient’s appointment, so
          add an appointment first.
        </p>
      )}

      {options && options.appointments.length > 0 && (
        <>
          <div className="rx-form__top">
            <div className="rx-form__field">
              <label htmlFor="rx-patient">Patient *</label>
              <select
                id="rx-patient"
                value={patientId}
                onChange={(e) => {
                  setPatientId(e.target.value);
                  setAppointmentId('');
                }}
              >
                <option value="">Choose a patient</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} (#{p.id})</option>
                ))}
              </select>
            </div>

            <div className="rx-form__field">
              <label htmlFor="rx-appointment">Appointment *</label>
              <select
                id="rx-appointment"
                value={appointmentId}
                onChange={(e) => setAppointmentId(e.target.value)}
                disabled={!patientId}
              >
                <option value="">{patientId ? 'Choose an appointment' : 'Choose a patient first'}</option>
                {appointments.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.date} {a.time}, {a.doctor_name}, {a.clinic} ({a.status})
                  </option>
                ))}
              </select>
              <p className="rx-form__hint">The prescribing doctor is the one on this appointment.</p>
            </div>

            <div className="rx-form__field">
              <label htmlFor="rx-branch">Pharmacy branch *</label>
              <select id="rx-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">Choose a branch</option>
                {options.branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="rx-form__top">
            <div className="rx-form__field">
              <label htmlFor="rx-diagnosis">Diagnosis</label>
              <input
                id="rx-diagnosis"
                type="text"
                maxLength={2000}
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
              />
            </div>
            <div className="rx-form__field">
              <label htmlFor="rx-notes">Notes</label>
              <textarea
                id="rx-notes"
                rows={2}
                maxLength={2000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <p className="rx-form__hint rx-form__wide">
              Diagnosis and notes are optional. They are saved only if this appointment has no
              consultation yet.
            </p>
          </div>

          <fieldset className="rx-form__items">
            <legend>Medicines</legend>
            {items.map((it, index) => (
              <div className="rx-form__row" key={it.key}>
                <div className="rx-form__field rx-form__field--grow">
                  <label htmlFor={`rx-med-${it.key}`}>Medicine {index + 1}</label>
                  <select
                    id={`rx-med-${it.key}`}
                    value={it.medicineId}
                    onChange={(e) => updateItem(it.key, { medicineId: e.target.value })}
                  >
                    <option value="">Choose a medicine</option>
                    {options.medicines.map((m) => (
                      <option
                        key={m.id}
                        value={m.id}
                        disabled={chosen.has(String(m.id)) && String(m.id) !== it.medicineId}
                      >
                        {m.name}{m.unit ? ` (${m.unit})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="rx-form__field rx-form__field--qty">
                  <label htmlFor={`rx-qty-${it.key}`}>Quantity</label>
                  <input
                    id={`rx-qty-${it.key}`}
                    type="number"
                    min="1"
                    step="1"
                    value={it.quantity}
                    onChange={(e) => updateItem(it.key, { quantity: e.target.value })}
                  />
                </div>

                <button
                  type="button"
                  className="btn rx-form__remove"
                  onClick={() => removeItem(it.key)}
                  disabled={items.length === 1}
                  aria-label={`Remove medicine ${index + 1}`}
                >
                  Remove
                </button>
              </div>
            ))}

            <button
              type="button"
              className="btn"
              onClick={() => setItems((list) => [...list, newItem()])}
              disabled={items.length >= 20}
            >
              Add another medicine
            </button>
          </fieldset>
        </>
      )}

      {error && <div role="alert" className="alert">{error}</div>}

      <div className="rx-form__actions">
        <button
          className="btn rx-form__submit"
          type="submit"
          disabled={busy || !options || options.appointments.length === 0}
        >
          {busy ? 'Creating…' : 'Create prescription'}
        </button>
        <button className="btn" type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
