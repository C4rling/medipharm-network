import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api.js';
import './SchedulePages.css';

const norm = (v) => (v ?? '').trim().toLowerCase();

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

export default function BookAppointmentPage() {
  const [slots, setSlots] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [specialty, setSpecialty] = useState('');
  const [clinicId, setClinicId] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState('');
  const [confirming, setConfirming] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setSlots(await api('/schedule/open'));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    api('/schedule/open')
      .then(setSlots)
      .catch((e) => setError(e.message))
      .finally(() => setLoaded(true));
  }, []);

  const clinics = useMemo(() => {
    const byId = new Map();
    for (const s of slots) byId.set(s.clinicId, s.clinic);
    return [...byId.entries()].map(([id, name]) => ({ id, name }));
  }, [slots]);

  // Specialties are compared ignoring capitals and spaces, so "Cardiology" and
  // "cardiology " count as one. Only specialties that have open times are listed.
  const specialties = useMemo(() => {
    const byKey = new Map();
    for (const s of slots) {
      const key = norm(s.specialty);
      if (key && !byKey.has(key)) byKey.set(key, s.specialty.trim());
    }
    return [...byKey.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [slots]);

  // The doctor list narrows to the chosen specialty.
  const doctors = useMemo(() => {
    const byId = new Map();
    for (const s of slots) {
      if (specialty && norm(s.specialty) !== specialty) continue;
      byId.set(s.doctorId, s.doctorName);
    }
    return [...byId.entries()].map(([id, name]) => ({ id, name }));
  }, [slots, specialty]);

  const shown = slots.filter(
    (s) =>
      (!specialty || norm(s.specialty) === specialty) &&
      (!clinicId || String(s.clinicId) === clinicId) &&
      (!doctorId || String(s.doctorId) === doctorId) &&
      (!date || s.date === date),
  );

  const hasFilters = Boolean(specialty || clinicId || doctorId || date);

  function changeSpecialty(value) {
    setSpecialty(value);
    // Drop a chosen doctor who is not in the new specialty.
    if (doctorId && value) {
      const doc = slots.find((s) => String(s.doctorId) === doctorId);
      if (doc && norm(doc.specialty) !== value) setDoctorId('');
    }
  }

  function clearFilters() {
    setSpecialty('');
    setClinicId('');
    setDoctorId('');
    setDate('');
  }

  async function book() {
    setError('');
    setBusy(true);
    try {
      await api(`/schedule/${confirming.id}/book`, { method: 'POST', body: JSON.stringify({}) });
      setNotice(
        `Booked: ${confirming.doctorName} on ${fmtDate(confirming.date)} at ${fmt12(confirming.start)}, ${confirming.clinic}.`,
      );
      setConfirming(null);
    } catch (err) {
      setError(err.message);
      setConfirming(null);
    } finally {
      setBusy(false);
      await load();
    }
  }

  return (
    <>
      <h1>Book an appointment</h1>
      <p className="page-sub">
        Narrow the list by specialty, doctor, clinic or date, then pick an available time. Times that are taken are not shown.
      </p>

      {notice && (
        <div
          role="status"
          className="panel"
          style={{ padding: '0.75rem 1rem', marginBottom: '1rem', borderColor: 'var(--mp-teal)' }}
        >
          {notice} <Link to="/my-care">See it in My care</Link>
        </div>
      )}
      {error && <div role="alert" className="alert">{error}</div>}

      <div className="toolbar sched-filters">
        <label>
          Specialty
          <select value={specialty} onChange={(e) => changeSpecialty(e.target.value)}>
            <option value="">All specialties</option>
            {specialties.map((sp) => (
              <option key={sp.key} value={sp.key}>{sp.label}</option>
            ))}
          </select>
        </label>
        <label>
          Doctor
          <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
            <option value="">All doctors</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
        <label>
          Clinic
          <select value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
            <option value="">All clinics</option>
            {clinics.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        {hasFilters && (
          <button className="btn" type="button" onClick={clearFilters} style={{ alignSelf: 'flex-end' }}>
            Clear filters
          </button>
        )}
      </div>

      {confirming && (
        <div className="panel sched-confirm" role="dialog" aria-label="Confirm booking">
          <p>
            Book <strong>{confirming.doctorName}</strong>
            {confirming.specialty ? ` (${confirming.specialty})` : ''} on{' '}
            <strong>{fmtDate(confirming.date)}</strong>, {fmt12(confirming.start)} to {fmt12(confirming.end)},
            at {confirming.clinic}?
          </p>
          <div className="sched-actions">
            <button className="btn sched-submit" onClick={book} disabled={busy}>
              {busy ? 'Booking…' : 'Confirm booking'}
            </button>
            <button className="btn" onClick={() => setConfirming(null)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="panel">
        <table className="ledger">
          <thead>
            <tr>
              <th>Date</th>
              <th>Time</th>
              <th>Doctor</th>
              <th>Clinic</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.id}>
                <td>{fmtDate(s.date)}</td>
                <td>{fmt12(s.start)} to {fmt12(s.end)}</td>
                <td>
                  {s.doctorName}
                  {s.specialty ? <span className="muted">, {s.specialty}</span> : null}
                </td>
                <td>{s.clinic}</td>
                <td>
                  <button
                    className="btn"
                    onClick={() => {
                      setError('');
                      setNotice('');
                      setConfirming(s);
                    }}
                  >
                    Book
                  </button>
                </td>
              </tr>
            ))}
            {loaded && shown.length === 0 && !error && (
              <tr>
                <td colSpan="5" className="muted">
                  {slots.length === 0
                    ? 'No times are available right now. Please check again later.'
                    : 'No times match those filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
