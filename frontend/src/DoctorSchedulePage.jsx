import { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import './SchedulePages.css';

const LENGTHS = [15, 20, 30, 45, 60, 90, 120];

const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toHHMM = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

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

function todayLocal() {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// Whole appointments only. Time left at the end of a window that is shorter
// than one appointment is reported, and is not offered to patients.
function buildPreview(windows, minutes) {
  const slots = [];
  const leftovers = [];
  for (const w of windows) {
    if (!w.from || !w.to) continue;
    const a = toMin(w.from);
    const b = toMin(w.to);
    if (b <= a) continue;
    let t = a;
    for (; t + minutes <= b; t += minutes) {
      slots.push({ start: toHHMM(t), end: toHHMM(t + minutes) });
    }
    if (t < b) leftovers.push({ from: toHHMM(t), to: toHHMM(b) });
  }
  return { slots, leftovers };
}

let nextKey = 1;
const newWindow = (from, to) => ({ key: nextKey++, from, to });

export default function DoctorSchedulePage() {
  const [clinics, setClinics] = useState([]);
  const [mine, setMine] = useState([]);
  const [clinicId, setClinicId] = useState('');
  const [date, setDate] = useState('');
  const [windows, setWindows] = useState(() => [
    newWindow('09:00', '11:30'),
    newWindow('13:30', '17:30'),
  ]);
  const [minutes, setMinutes] = useState(60);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadMine() {
    try {
      setMine(await api('/schedule/mine'));
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    api('/schedule/clinics')
      .then((rows) => {
        setClinics(rows);
        if (rows.length === 1) setClinicId(String(rows[0].id));
      })
      .catch((e) => setError(e.message));
    api('/schedule/mine')
      .then(setMine)
      .catch((e) => setError(e.message));
  }, []);

  const preview = useMemo(() => buildPreview(windows, minutes), [windows, minutes]);

  function updateWindow(key, changes) {
    setWindows((list) => list.map((w) => (w.key === key ? { ...w, ...changes } : w)));
  }

  async function publish(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!clinicId) return setError('Choose a clinic.');
    if (!date) return setError('Choose a date.');
    if (windows.some((w) => !w.from || !w.to)) return setError('Fill in every start and end time.');
    if (windows.some((w) => toMin(w.to) <= toMin(w.from))) {
      return setError('Each time window must end after it starts.');
    }
    if (preview.slots.length === 0) {
      return setError('No full appointment fits in those windows. Use a shorter appointment length.');
    }

    setBusy(true);
    try {
      const res = await api('/schedule', {
        method: 'POST',
        body: JSON.stringify({
          clinicId: Number(clinicId),
          date,
          slotMinutes: Number(minutes),
          windows: windows.map((w) => ({ from: w.from, to: w.to })),
        }),
      });
      setNotice(`Published ${res.created} appointment times for ${fmtDate(date)}.`);
      await loadMine();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeSlot(slot) {
    if (!window.confirm(`Remove ${fmt12(slot.start)} on ${fmtDate(slot.date)}?`)) return;
    setError('');
    setNotice('');
    try {
      await api(`/schedule/${slot.id}`, { method: 'DELETE' });
      setNotice('That time was removed.');
      await loadMine();
    } catch (err) {
      setError(err.message);
    }
  }

  const openCount = mine.filter((s) => s.status === 'open').length;
  const takenCount = mine.filter((s) => s.status === 'taken').length;

  return (
    <>
      <h1>My schedule</h1>
      <p className="page-sub">
        Publish the times you are available. Patients pick from these, and a booked time turns taken.
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

      <form className="panel sched-form" onSubmit={publish} noValidate>
        <h2>Publish available times</h2>

        <div className="sched-grid">
          <div className="sched-field">
            <label htmlFor="s-clinic">Clinic *</label>
            <select id="s-clinic" value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
              <option value="">Choose a clinic</option>
              {clinics.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="sched-field">
            <label htmlFor="s-date">Date *</label>
            <input
              id="s-date"
              type="date"
              value={date}
              min={todayLocal()}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="sched-field">
            <label htmlFor="s-length">Length of each appointment</label>
            <select id="s-length" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              {LENGTHS.map((m) => (
                <option key={m} value={m}>
                  {m >= 60 && m % 60 === 0 ? `${m / 60} hour${m === 60 ? '' : 's'}` : `${m} minutes`}
                </option>
              ))}
            </select>
          </div>
        </div>

        <fieldset className="sched-windows">
          <legend>Time windows</legend>
          {windows.map((w, index) => (
            <div className="sched-window" key={w.key}>
              <div className="sched-field">
                <label htmlFor={`w-from-${w.key}`}>From</label>
                <input
                  id={`w-from-${w.key}`}
                  type="time"
                  value={w.from}
                  onChange={(e) => updateWindow(w.key, { from: e.target.value })}
                />
              </div>
              <div className="sched-field">
                <label htmlFor={`w-to-${w.key}`}>To</label>
                <input
                  id={`w-to-${w.key}`}
                  type="time"
                  value={w.to}
                  onChange={(e) => updateWindow(w.key, { to: e.target.value })}
                />
              </div>
              <button
                type="button"
                className="btn"
                disabled={windows.length === 1}
                onClick={() => setWindows((list) => list.filter((x) => x.key !== w.key))}
                aria-label={`Remove time window ${index + 1}`}
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn"
            disabled={windows.length >= 6}
            onClick={() => setWindows((list) => [...list, newWindow('', '')])}
          >
            Add another time window
          </button>
        </fieldset>

        <div className="sched-preview" aria-live="polite">
          <strong>
            {preview.slots.length === 0
              ? 'No appointments yet'
              : `${preview.slots.length} appointment${preview.slots.length === 1 ? '' : 's'} will be created`}
          </strong>
          {preview.slots.length > 0 && (
            <ul className="sched-chips">
              {preview.slots.map((s) => (
                <li key={s.start}>{fmt12(s.start)} to {fmt12(s.end)}</li>
              ))}
            </ul>
          )}
          {preview.leftovers.length > 0 && (
            <p className="sched-note">
              Left over, too short for a full appointment, so not offered:{' '}
              {preview.leftovers.map((l) => `${fmt12(l.from)} to ${fmt12(l.to)}`).join(', ')}.
              Choose a shorter appointment length to use that time.
            </p>
          )}
        </div>

        <div className="sched-actions">
          <button className="btn sched-submit" type="submit" disabled={busy}>
            {busy ? 'Publishing…' : 'Publish times'}
          </button>
        </div>
      </form>

      <h2>My published times</h2>
      <p className="page-sub">
        {mine.length > 0
          ? `${openCount} open and ${takenCount} taken, from today onward.`
          : 'Nothing published yet.'}
      </p>
      <div className="panel">
        <table className="ledger">
          <thead>
            <tr>
              <th>Date</th>
              <th>Time</th>
              <th>Clinic</th>
              <th>Status</th>
              <th>Patient</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {mine.map((s) => (
              <tr key={s.id}>
                <td>{fmtDate(s.date)}</td>
                <td>{fmt12(s.start)} to {fmt12(s.end)}</td>
                <td>{s.clinic}</td>
                <td>
                  <span className={`state ${s.status === 'open' ? 'state-ok' : 'state-low'}`}>
                    {s.status}
                  </span>
                </td>
                <td>{s.patientName ?? ''}</td>
                <td>
                  {s.status === 'open' && (
                    <button className="btn" onClick={() => removeSlot(s)}>Remove</button>
                  )}
                </td>
              </tr>
            ))}
            {mine.length === 0 && !error && (
              <tr><td colSpan="6" className="muted">No times published yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
