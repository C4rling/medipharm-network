import { useEffect, useState } from 'react';
import { api } from './api.js';
import './AccountsPage.css';

const TYPE = {
  doctor: 'Doctor',
  pharmacist: 'Pharmacist',
  patient: 'Patient',
  admin: 'Administrator',
};

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

const fullName = (p) => `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || '(no name)';

export default function AccountsPage() {
  const [data, setData] = useState({ accounts: [], people: [], clinics: [], branches: [] });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const [creating, setCreating] = useState(null);
  const [cEmail, setCEmail] = useState('');
  const [cPassword, setCPassword] = useState('');

  const [managing, setManaging] = useState(null);
  const [mEmail, setMEmail] = useState('');
  const [mPassword, setMPassword] = useState('');
  const [mType, setMType] = useState('patient');
  const [mSpecialty, setMSpecialty] = useState('');
  const [mLicense, setMLicense] = useState('');
  const [mClinicId, setMClinicId] = useState('');
  const [mBranchId, setMBranchId] = useState('');

  async function load() {
    try {
      setData(await api('/accounts'));
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    api('/accounts')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  function startCreate(person) {
    setError('');
    setNotice('');
    setManaging(null);
    setCreating(person);
    setCEmail('');
    setCPassword(generatePassword());
  }

  function startManage(account) {
    setError('');
    setNotice('');
    setCreating(null);
    setManaging(account);
    setMEmail(account.email);
    setMPassword('');
    setMType(['patient', 'doctor', 'pharmacist'].includes(account.personType) ? account.personType : 'patient');
    setMSpecialty('');
    setMLicense('');
    setMClinicId('');
    setMBranchId('');
  }

  async function submitCreate(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/accounts', {
        method: 'POST',
        body: JSON.stringify({ profileId: creating.id, email: cEmail, password: cPassword }),
      });
      setNotice(
        `Login created for ${fullName(creating)}. Give them the email and the temporary password: ${cPassword}`,
      );
      setCreating(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function patchAccount(changes, message) {
    setError('');
    setBusy(true);
    try {
      await api(`/accounts/${managing.userId}`, {
        method: 'PATCH',
        body: JSON.stringify(changes),
      });
      setNotice(message);
      setManaging(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function saveManage(e) {
    e.preventDefault();
    const changes = {};
    if (mEmail.trim() !== managing.email) changes.email = mEmail.trim();
    if (mPassword) changes.password = mPassword;
    if (Object.keys(changes).length === 0) {
      setError('Nothing to change. Edit the email or enter a new password.');
      return;
    }
    patchAccount(changes, `Saved changes for ${fullName(managing)}.`);
  }

  async function changeType() {
    setError('');
    if (mType === 'doctor') {
      if (mSpecialty.trim().length < 2) return setError('Enter the doctor’s specialty.');
      if (mLicense.trim().length < 3) return setError('Enter the license number.');
      if (!mClinicId) return setError('Choose the clinic this doctor works at.');
    }
    if (mType === 'pharmacist') {
      if (mLicense.trim().length < 3) return setError('Enter the license number.');
      if (!mBranchId) return setError('Choose the branch this pharmacist works at.');
    }

    setBusy(true);
    try {
      await api(`/accounts/${managing.userId}/type`, {
        method: 'PUT',
        body: JSON.stringify({
          type: mType,
          specialty: mSpecialty,
          licenseNumber: mLicense,
          clinicId: mClinicId ? Number(mClinicId) : undefined,
          branchId: mBranchId ? Number(mBranchId) : undefined,
        }),
      });
      setNotice(
        `${fullName(managing)} is now a ${TYPE[mType].toLowerCase()}. They must sign out and sign in again to see the change.`,
      );
      setManaging(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const currentType = managing?.personType;

  return (
    <>
      <h1>Accounts</h1>
      <p className="page-sub">
        Every doctor, pharmacist and patient has their own login. New accounts start as patients.
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

      {creating && (
        <form className="panel acct-form" onSubmit={submitCreate} noValidate>
          <h2>Create a login for {fullName(creating)} ({TYPE[creating.kind]})</h2>
          <div className="acct-form__grid">
            <div className="acct-form__field">
              <label htmlFor="c-email">Email</label>
              <input
                id="c-email"
                type="email"
                value={cEmail}
                onChange={(e) => setCEmail(e.target.value)}
                autoComplete="off"
                required
                autoFocus
              />
            </div>
            <div className="acct-form__field">
              <label htmlFor="c-password">Temporary password</label>
              <div className="acct-form__row">
                <input
                  id="c-password"
                  type="text"
                  value={cPassword}
                  onChange={(e) => setCPassword(e.target.value)}
                  autoComplete="off"
                  required
                />
                <button type="button" className="btn" onClick={() => setCPassword(generatePassword())}>
                  Generate
                </button>
              </div>
              <p className="acct-form__hint">At least 8 characters. Tell the person to keep it private.</p>
            </div>
          </div>
          <div className="acct-form__actions">
            <button className="btn acct-form__submit" type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create login'}
            </button>
            <button className="btn" type="button" onClick={() => setCreating(null)} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {managing && (
        <form className="panel acct-form" onSubmit={saveManage} noValidate>
          <h2>Manage {fullName(managing)} ({TYPE[currentType] ?? managing.role})</h2>
          <div className="acct-form__grid">
            <div className="acct-form__field">
              <label htmlFor="m-email">Email</label>
              <input
                id="m-email"
                type="email"
                value={mEmail}
                onChange={(e) => setMEmail(e.target.value)}
                autoComplete="off"
                required
              />
            </div>
            <div className="acct-form__field">
              <label htmlFor="m-password">New password</label>
              <div className="acct-form__row">
                <input
                  id="m-password"
                  type="text"
                  value={mPassword}
                  onChange={(e) => setMPassword(e.target.value)}
                  autoComplete="off"
                  placeholder="Leave empty to keep the current one"
                />
                <button type="button" className="btn" onClick={() => setMPassword(generatePassword())}>
                  Generate
                </button>
              </div>
            </div>
          </div>
          <div className="acct-form__actions">
            <button className="btn acct-form__submit" type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
            <button
              className="btn"
              type="button"
              disabled={busy}
              onClick={() =>
                patchAccount(
                  { active: !managing.active },
                  `${fullName(managing)}’s account is now ${managing.active ? 'switched off' : 'active'}.`,
                )
              }
            >
              {managing.active ? 'Switch account off' : 'Switch account on'}
            </button>
            <button className="btn" type="button" onClick={() => setManaging(null)} disabled={busy}>
              Cancel
            </button>
          </div>

          <fieldset className="acct-type">
            <legend>Account type</legend>
            {currentType === 'admin' ? (
              <p className="acct-form__hint">Administrator accounts cannot be changed here.</p>
            ) : (
              <>
                <p className="acct-form__hint">
                  Everyone starts as a patient. Make this person a doctor or pharmacist here. They keep
                  any patient history. They must sign out and sign in again to see the change.
                </p>
                <div className="acct-form__grid">
                  <div className="acct-form__field">
                    <label htmlFor="m-type">Type</label>
                    <select id="m-type" value={mType} onChange={(e) => setMType(e.target.value)}>
                      <option value="patient">Patient</option>
                      <option value="doctor">Doctor</option>
                      <option value="pharmacist">Pharmacist</option>
                    </select>
                  </div>

                  {mType === 'doctor' && mType !== currentType && (
                    <>
                      <div className="acct-form__field">
                        <label htmlFor="m-specialty">Specialty</label>
                        <input
                          id="m-specialty"
                          type="text"
                          maxLength={100}
                          value={mSpecialty}
                          onChange={(e) => setMSpecialty(e.target.value)}
                        />
                      </div>
                      <div className="acct-form__field">
                        <label htmlFor="m-license-d">License number</label>
                        <input
                          id="m-license-d"
                          type="text"
                          maxLength={50}
                          value={mLicense}
                          onChange={(e) => setMLicense(e.target.value)}
                        />
                      </div>
                      <div className="acct-form__field">
                        <label htmlFor="m-clinic">Works at clinic</label>
                        <select id="m-clinic" value={mClinicId} onChange={(e) => setMClinicId(e.target.value)}>
                          <option value="">Choose a clinic</option>
                          {data.clinics.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}

                  {mType === 'pharmacist' && mType !== currentType && (
                    <>
                      <div className="acct-form__field">
                        <label htmlFor="m-license-p">License number</label>
                        <input
                          id="m-license-p"
                          type="text"
                          maxLength={50}
                          value={mLicense}
                          onChange={(e) => setMLicense(e.target.value)}
                        />
                      </div>
                      <div className="acct-form__field">
                        <label htmlFor="m-branch">Works at branch</label>
                        <select id="m-branch" value={mBranchId} onChange={(e) => setMBranchId(e.target.value)}>
                          <option value="">Choose a branch</option>
                          {data.branches.map((b) => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                </div>
                <div className="acct-form__actions">
                  <button
                    type="button"
                    className="btn acct-form__submit"
                    onClick={changeType}
                    disabled={busy || mType === currentType}
                  >
                    {busy ? 'Changing…' : 'Change account type'}
                  </button>
                </div>
              </>
            )}
          </fieldset>
        </form>
      )}

      <h2>People without a login</h2>
      <div className="panel">
        <table className="ledger">
          <thead>
            <tr>
              <th>Type</th>
              <th>Name</th>
              <th className="num">ID</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.people.map((p) => (
              <tr key={`${p.kind}-${p.id}`}>
                <td>{TYPE[p.kind]}</td>
                <td>{fullName(p)}</td>
                <td className="num">{p.id}</td>
                <td>
                  <button className="btn" onClick={() => startCreate(p)}>Create login</button>
                </td>
              </tr>
            ))}
            {data.people.length === 0 && !error && (
              <tr><td colSpan="4" className="muted">Everyone has a login.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2>All accounts</h2>
      <div className="panel">
        <table className="ledger">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Email</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.accounts.map((a) => (
              <tr key={a.userId}>
                <td>{fullName(a)}</td>
                <td>{TYPE[a.personType] ?? a.role}</td>
                <td>{a.email}</td>
                <td>
                  <span className={`state ${a.active ? 'state-ok' : 'state-out'}`}>
                    {a.active ? 'active' : 'switched off'}
                  </span>
                </td>
                <td>
                  <button className="btn" onClick={() => startManage(a)}>Manage</button>
                </td>
              </tr>
            ))}
            {data.accounts.length === 0 && !error && (
              <tr><td colSpan="5" className="muted">No accounts found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
