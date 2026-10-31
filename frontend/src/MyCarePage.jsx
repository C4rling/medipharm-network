import { useEffect, useState } from 'react';
import { api } from './api.js';
import './MyCarePage.css';

// Maps any status text to the badge colours already used on the Stock page.
function badgeClass(status) {
  const s = String(status ?? '').toLowerCase();
  if (s === 'dispensed' || s === 'completed' || s === 'fulfilled') return 'state state-ok';
  if (s.includes('out') || s.includes('cancel')) return 'state state-out';
  return 'state state-low';
}

function label(status) {
  return String(status ?? '').replace(/_/g, ' ');
}

export default function MyCarePage() {
  const [care, setCare] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/my/care')
      .then(setCare)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div role="alert" className="alert">{error}</div>;
  if (!care) return <p className="muted">Loading your care details…</p>;

  const pending = care.prescriptions.filter((p) => String(p.status).toLowerCase() === 'pending').length;
  let summary = 'You have no prescriptions on record yet.';
  if (care.prescriptions.length > 0) {
    summary = pending > 0
      ? `${pending} of your ${care.prescriptions.length} prescription${care.prescriptions.length === 1 ? ' is' : 's are'} still pending.`
      : 'All of your prescriptions have been processed.';
  }

  return (
    <>
      <h1>Hello, {care.patient.firstName}</h1>
      <p className="page-sub">{summary}</p>

      <section className="care-section" aria-labelledby="doctor-h">
        <h2 id="doctor-h">Your doctor</h2>
        {care.doctors.length === 0 && <p className="muted">No doctor has been assigned to you yet.</p>}
        <ul className="care-doctors">
          {care.doctors.map((d) => (
            <li key={d.doctorId}>
              <strong>Dr. {d.name}</strong>
              <span className="muted">{d.specialty}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="care-section" aria-labelledby="med-h">
        <h2 id="med-h">Your medication</h2>
        {care.prescriptions.length === 0 && <p className="muted">No prescriptions yet.</p>}
        {care.prescriptions.map((rx) => (
          <div className="panel care-rx" key={rx.prescriptionId}>
            <div className="care-rx__head">
              <div>
                <strong>Prescription #{rx.prescriptionId}</strong>
                <span className="muted"> · Dr. {rx.doctorName} · {rx.branch} · {rx.dateCreated}</span>
              </div>
              <span className={badgeClass(rx.status)}>{label(rx.status)}</span>
            </div>
            <table className="ledger">
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th className="num">Prescribed</th>
                  <th className="num">Given</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rx.items.map((i) => (
                  <tr key={`${rx.prescriptionId}-${i.name}`}>
                    <td>{i.name}</td>
                    <td className="num">{i.quantityRequested}{i.unit ? ` ${i.unit}` : ''}</td>
                    <td className="num">{i.quantityDispensed}</td>
                    <td><span className={badgeClass(i.itemStatus)}>{label(i.itemStatus)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>

      <section className="care-section" aria-labelledby="appt-h">
        <h2 id="appt-h">Your appointments</h2>
        {care.appointments.length === 0 && <p className="muted">No appointments on record.</p>}
        {care.appointments.length > 0 && (
          <div className="panel">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Clinic</th>
                  <th>Doctor</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {care.appointments.map((a) => (
                  <tr key={a.appointmentId}>
                    <td>{a.date}</td>
                    <td>{a.time}</td>
                    <td>{a.clinic}</td>
                    <td>Dr. {a.doctorName}</td>
                    <td><span className={badgeClass(a.status)}>{label(a.status)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
