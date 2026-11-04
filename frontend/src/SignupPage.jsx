import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setToken } from './api.js';
import './theme.css';
import './LoginPage.css';

export default function SignupPage({ onLogin }) {
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (firstName.trim().length < 2 || lastName.trim().length < 2) {
      setError('Enter your first and last name.');
      return;
    }
    if (!dateOfBirth) {
      setError('Enter your date of birth.');
      return;
    }
    if (password.length < 8) {
      setError('Use a password with at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const { token, user } = await api('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          dateOfBirth,
          gender: gender || undefined,
          phone: phone.trim() || undefined,
          email: email.trim(),
          password,
        }),
      });
      setToken(token);
      navigate('/', { replace: true });
      onLogin(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <aside className="login__brand" aria-hidden="true">
        <div className="label">
          <p className="label__brand">MediPharm</p>
          <p className="label__sub">A patient account shows you:</p>
          <dl className="label__roles">
            <div>
              <dt>Your doctor</dt>
              <dd>Name and specialty, from your prescriptions and appointments</dd>
            </div>
            <div>
              <dt>Your medication</dt>
              <dd>Each prescription, what was prescribed and what was given</dd>
            </div>
            <div>
              <dt>Your appointments</dt>
              <dd>Upcoming and past visits</dd>
            </div>
          </dl>
          <p className="label__note">
            Doctors, pharmacists and admins don’t sign up here. Your admin creates those accounts.
          </p>
        </div>
      </aside>

      <section className="login__panel">
        <form className="form" onSubmit={handleSubmit}>
          <Link className="login__home" to="/">Back to home</Link>
          <h1>Create your patient account</h1>
          <p className="form__hint">It takes a minute. You’ll be signed in when it’s done.</p>

          <div className="field">
            <label htmlFor="firstName">First name</label>
            <input
              id="firstName"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              maxLength={50}
              autoComplete="given-name"
              autoFocus
            />
          </div>

          <div className="field">
            <label htmlFor="lastName">Last name</label>
            <input
              id="lastName"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              maxLength={50}
              autoComplete="family-name"
            />
          </div>

          <div className="field">
            <label htmlFor="dateOfBirth">Date of birth</label>
            <input
              id="dateOfBirth"
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              required
              min="1900-01-01"
              max={today}
              autoComplete="bday"
            />
          </div>

          <div className="field">
            <label htmlFor="gender">Gender (optional)</label>
            <select id="gender" value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">Prefer not to say</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="phone">Phone (optional)</label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={20}
              autoComplete="tel"
            />
          </div>

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={100}
              autoComplete="email"
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <div className="field__row">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                aria-describedby="password-hint"
              />
              <button
                type="button"
                className="field__toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="field__hint" id="password-hint">At least 8 characters.</p>
          </div>

          <div className="field">
            <label htmlFor="confirm">Confirm password</label>
            <input
              id="confirm"
              type={showPassword ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>

          <p className="form__error" role="alert">{error}</p>

          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Creating account…' : 'Create account'}
          </button>

          <p className="form__switch">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </form>
      </section>
    </main>
  );
}
