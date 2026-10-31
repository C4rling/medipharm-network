import { useEffect, useState } from 'react';
import { api } from './api.js';
import './PatientsPage.css';

const emptyForm = {
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  gender: '',
  phone: '',
  address: '',
  emergencyContact: '',
};

// ---- Checks that run in the browser before anything is sent ----------------
// The server repeats these checks, so keep the two in step.
const NAME_RE = /^\p{L}[\p{L}\p{M}\s'.-]*$/u;

function normalizePhone(raw) {
  let d = raw.replace(/[\s\-().]/g, '');
  if (d.startsWith('+63')) d = `0${d.slice(3)}`;
  else if (d.startsWith('63') && d.length === 12) d = `0${d.slice(2)}`;
  return d;
}

function isValidPhone(d) {
  if (/^(\d)\1+$/.test(d)) return false;
  return /^09\d{9}$/.test(d) || /^0[2-8]\d{8}$/.test(d);
}

function describeHistory(a) {
  const parts = [];
  if (a.prescriptions) parts.push(`${a.prescriptions} prescription${a.prescriptions === 1 ? '' : 's'}`);
  if (a.appointments) parts.push(`${a.appointments} appointment${a.appointments === 1 ? '' : 's'}`);
  return parts.join(', ');
}

function validate(f, today) {
  const e = {};
  const first = f.firstName.trim();
  const last = f.lastName.trim();
  const address = f.address.trim();
  const contact = f.emergencyContact.trim();

  if (first.length < 2 || !NAME_RE.test(first)) {
    e.firstName = 'Use letters only (at least 2). Spaces, hyphens and apostrophes are fine.';
  }
  if (last.length < 2 || !NAME_RE.test(last)) {
    e.lastName = 'Use letters only (at least 2). Spaces, hyphens and apostrophes are fine.';
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.dateOfBirth)) {
    e.dateOfBirth = 'Enter a complete date of birth.';
  } else if (f.dateOfBirth > today) {
    e.dateOfBirth = 'Date of birth cannot be in the future.';
  } else if (f.dateOfBirth < '1900-01-01') {
    e.dateOfBirth = 'Date of birth cannot be before 1900.';
  }

  if (f.phone.trim() && !isValidPhone(normalizePhone(f.phone.trim()))) {
    e.phone = 'Enter a valid Philippine number, for example 09171234567 or 02 8123 4567.';
  }

  if (contact) {
    if (/^[\d\s()+.-]+$/.test(contact)) {
      if (!isValidPhone(normalizePhone(contact))) {
        e.emergencyContact = 'That number is not valid. Example: 09171234567.';
      }
    } else if (contact.length < 3 || !/\p{L}/u.test(contact)) {
      e.emergencyContact = 'Enter a name or a valid number.';
    }
  }

  if (address && (address.length < 5 || !/\p{L}/u.test(address))) {
    e.address = 'Address looks too short or incomplete.';
  }

  return e;
}

export default function PatientsPage({ role }) {
  // Only admins may delete (the database enforces this too).
  const canDelete = role === 'admin';

  const [patients, setPatients] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [activity, setActivity] = useState(null); // { [patientId]: { appointments, prescriptions } }
  const [deletingId, setDeletingId] = useState(null);
  const [tableError, setTableError] = useState('');
  const [tableNote, setTableNote] = useState('');

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    api('/patients')
      .then((rows) => { setPatients(rows); setLoadError(''); })
      .catch((e) => setLoadError(e.message));
  }, [reloadKey]);

  useEffect(() => {
    api('/patients/activity')
      .then((rows) => setActivity(Object.fromEntries(rows.map((r) => [r.patientId, r]))))
      .catch(() => setActivity(null));
  }, [reloadKey]);

  function update(field) {
    return (e) => {
      const value = e.target.value;
      setForm((f) => ({ ...f, [field]: value }));
      setFieldErrors((errs) => ({ ...errs, [field]: undefined }));
    };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setDone('');

    const problems = validate(form, today);
    setFieldErrors(problems);
    if (Object.keys(problems).length > 0) {
      setError('Please fix the highlighted fields.');
      return;
    }

    setBusy(true);
    try {
      const out = await api('/patients', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setDone(`Added ${out.firstName} ${out.lastName} as patient #${out.patientId}.`);
      setForm(emptyForm);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(p) {
    const name = `${p.firstName} ${p.lastName}`;
    if (!window.confirm(`Delete ${name} (patient #${p.patientId})? This cannot be undone.`)) return;
    setTableError('');
    setTableNote('');
    setDeletingId(p.patientId);
    try {
      await api(`/patients/${p.patientId}`, { method: 'DELETE' });
      setTableNote(`Deleted ${name}.`);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setTableError(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  const term = search.trim().toLowerCase();
  const shown = patients.filter((p) =>
    `${p.firstName} ${p.lastName} ${p.phone ?? ''}`.toLowerCase().includes(term)
  );

  // Small helper so every field shows its error the same way.
  function fieldProps(name) {
    return { 'aria-invalid': fieldErrors[name] ? 'true' : undefined };
  }
  function errorFor(name) {
    return fieldErrors[name]
      ? <span className="patient-form__error" role="alert">{fieldErrors[name]}</span>
      : null;
  }

  return (
    <>
      <h1>Patients</h1>
      <p className="page-sub">Register a new patient, or look one up.</p>

      <form className="patient-form" onSubmit={handleSubmit} noValidate>
        <h2>Add a patient</h2>
        <div className="patient-form__grid">
          <label>
            First name *
            <input value={form.firstName} onChange={update('firstName')} maxLength={50} {...fieldProps('firstName')} />
            {errorFor('firstName')}
          </label>
          <label>
            Last name *
            <input value={form.lastName} onChange={update('lastName')} maxLength={50} {...fieldProps('lastName')} />
            {errorFor('lastName')}
          </label>
          <label>
            Date of birth *
            <input
              type="date"
              value={form.dateOfBirth}
              onChange={update('dateOfBirth')}
              min="1900-01-01"
              max={today}
              {...fieldProps('dateOfBirth')}
            />
            {errorFor('dateOfBirth')}
          </label>
          <label>
            Gender
            <select value={form.gender} onChange={update('gender')}>
              <option value="">Not stated</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Phone
            <input
              type="tel"
              value={form.phone}
              onChange={update('phone')}
              maxLength={20}
              placeholder="09171234567"
              {...fieldProps('phone')}
            />
            {errorFor('phone')}
          </label>
          <label>
            Emergency contact
            <input
              value={form.emergencyContact}
              onChange={update('emergencyContact')}
              maxLength={100}
              placeholder="Name, or a phone number"
              {...fieldProps('emergencyContact')}
            />
            {errorFor('emergencyContact')}
          </label>
          <label className="patient-form__wide">
            Address
            <input value={form.address} onChange={update('address')} maxLength={255} {...fieldProps('address')} />
            {errorFor('address')}
          </label>
        </div>

        <p className="patient-form__msg patient-form__msg--error" role="alert">{error}</p>
        <p className="patient-form__msg patient-form__msg--ok" role="status">{done}</p>

        <button className="patient-form__btn" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Add patient'}
        </button>
      </form>

      <div className="toolbar">
        <label className="field">
          Search patients
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or phone"
          />
        </label>
      </div>

      {loadError && <div role="alert" className="alert">{loadError}</div>}
      {tableError && <div role="alert" className="alert">{tableError}</div>}
      {tableNote && <p role="status" className="patient-form__msg patient-form__msg--ok">{tableNote}</p>}

      <div className="panel">
        <table className="ledger">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Date of birth</th>
              <th>Gender</th>
              <th>Phone</th>
              <th>Emergency contact</th>
              <th>Records</th>
              {canDelete && <th><span className="visually-hidden">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => {
              const a = activity ? activity[p.patientId] : null;
              const hasHistory = a ? a.appointments + a.prescriptions > 0 : null;
              return (
                <tr key={p.patientId}>
                  <td>{p.patientId}</td>
                  <td>{p.firstName} {p.lastName}</td>
                  <td>{String(p.dateOfBirth).slice(0, 10)}</td>
                  <td>{p.gender ? p.gender[0].toUpperCase() + p.gender.slice(1) : ''}</td>
                  <td>{p.phone ?? ''}</td>
                  <td>{p.emergencyContact ?? ''}</td>
                  <td>
                    {a == null && <span className="muted">Unknown</span>}
                    {a != null && hasHistory && <span className="state state-low">{describeHistory(a)}</span>}
                    {a != null && !hasHistory && <span className="state state-ok">Safe to delete</span>}
                  </td>
                  {canDelete && (
                  <td>
                    <button
                      type="button"
                      className="patient-delete"
                      onClick={() => handleDelete(p)}
                      disabled={hasHistory === true || deletingId === p.patientId}
                      title={hasHistory ? 'This patient has records and cannot be deleted' : 'Delete this patient'}
                    >
                      {deletingId === p.patientId ? 'Deleting…' : 'Delete'}
                    </button>
                  </td>
                  )}
                </tr>
              );
            })}
            {shown.length === 0 && !loadError && (
              <tr><td colSpan={canDelete ? 8 : 7} className="muted">No patients found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
