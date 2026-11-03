import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api.js';
import './DoctorPatients.css';

function fmt12(t) {
  const [h, m] = t.split(':').map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function fmtDate(d) {
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function DoctorPatientsPage() {
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      setRows(await api('/doctor/patients'));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    api('/doctor/patients')
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoaded(true));
  }, []);

  const pending = rows.filter((r) => r.status === 'scheduled');
  const done = rows.filter((r) => r.status === 'completed');

  return (
    <>
      <h1>My patients</h1>
      <p className="page-sub">
        {pending.length === 0
          ? 'No patients are waiting for you.'
          : `${pending.length} patient${pending.length === 1 ? ' is' : 's are'} pending.`}
      </p>

      <div className="toolbar">
        <button className="btn" onClick={load}>Refresh</button>
      </div>

      {error && <div role="alert" className="alert">{error}</div>}

      <h2>Pending</h2>
      <div className="panel">
        <table className="ledger">
          <thead>
            <tr>
              <th>Date</th>
              <th>Time</th>
              <th>Patient</th>
              <th>Clinic</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pending.map((r) => (
              <tr key={r.id}>
                <td>{fmtDate(r.date)}</td>
                <td>{fmt12(r.time)}</td>
                <td>{r.patientName}</td>
                <td>{r.clinic}</td>
                <td><span className="state state-low">pending</span></td>
                <td>
                  <Link className="btn dp-link" to={`/my-patients/${r.id}`}>Diagnose</Link>
                </td>
              </tr>
            ))}
            {loaded && pending.length === 0 && !error && (
              <tr><td colSpan="6" className="muted">Nothing pending. Booked patients appear here.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2>Completed</h2>
      <div className="panel">
        <table className="ledger">
          <thead>
            <tr>
              <th>Date</th>
              <th>Time</th>
              <th>Patient</th>
              <th>Clinic</th>
              <th>Prescription</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {done.map((r) => (
              <tr key={r.id}>
                <td>{fmtDate(r.date)}</td>
                <td>{fmt12(r.time)}</td>
                <td>{r.patientName}</td>
                <td>{r.clinic}</td>
                <td>{r.prescriptionId ? `#${r.prescriptionId}` : 'None'}</td>
                <td>
                  <Link className="btn dp-link" to={`/my-patients/${r.id}`}>View</Link>
                </td>
              </tr>
            ))}
            {loaded && done.length === 0 && !error && (
              <tr><td colSpan="6" className="muted">No completed visits yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
