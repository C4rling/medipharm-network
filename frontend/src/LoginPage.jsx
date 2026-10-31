import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setToken } from './api.js';
import './theme.css';
import './LoginPage.css';

export default function LoginPage({ onLogin }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { token, user } = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
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
          <p className="label__sub">Pharmacy, clinic and stock room in one record</p>
          <dl className="label__roles">
            <div>
              <dt>Pharmacist</dt>
              <dd>Dispense medicine and keep stock counts</dd>
            </div>
            <div>
              <dt>Doctor</dt>
              <dd>See patients and write prescriptions</dd>
            </div>
            <div>
              <dt>Admin</dt>
              <dd>Manage staff accounts and reports</dd>
            </div>
            <div>
              <dt>Patient</dt>
              <dd>See your doctor, medication and appointments</dd>
            </div>
          </dl>
          <p className="label__note">Your role is set when your account is created and decides what you can open.</p>
        </div>
      </aside>

      <section className="login__panel">
        <form className="form" onSubmit={handleSubmit}>
          <Link className="login__home" to="/">Back to home</Link>
          <h1>Sign in to MediPharm</h1>
          <p className="form__hint">Use your MediPharm account.</p>

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              autoFocus
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
                autoComplete="current-password"
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
          </div>

          <p className="form__error" role="alert">{error}</p>

          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="form__switch">
            New patient? <Link to="/signup">Create an account</Link>
          </p>
          <p className="form__help">Forgot your password? Ask your admin to reset it.</p>
        </form>
      </section>
    </main>
  );
}