import { useEffect, useState } from 'react';
import { api, getToken, clearToken } from './api.js';
import LoginPage from './LoginPage.jsx';
import StockPage from './StockPage.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(Boolean(getToken()));

  // On page load, check a saved token with the server.
  useEffect(() => {
    if (!getToken()) return;
    api('/auth/me')
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setChecking(false));
  }, []);

  // api.js fires this when the server rejects the token.
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener('auth-expired', onExpired);
    return () => window.removeEventListener('auth-expired', onExpired);
  }, []);

  function logout() {
    clearToken();
    setUser(null);
  }

  if (checking) return <p style={{ padding: '2rem' }}>Loading…</p>;
  if (!user) return <LoginPage onLogin={setUser} />;

  return (
    <>
      <header style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 1.5rem', borderBottom: '1px solid #ccc' }}>
        <span>Signed in as <strong>{user.role}</strong></span>
        <button onClick={logout}>Log out</button>
      </header>
      <StockPage />
    </>
  );
}