import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { api, getToken, clearToken } from './api.js';
import LoginPage from './LoginPage.jsx';
import Layout from './Layout.jsx';
import StockPage from './StockPage.jsx';
import MedicinesPage from './MedicinesPage.jsx';

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

  if (checking) return <p className="content muted">Loading…</p>;
  if (!user) return <LoginPage onLogin={setUser} />;

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout user={user} onLogout={logout} />}>
          <Route index element={<Navigate to="/stock" replace />} />
          <Route path="stock" element={<StockPage />} />
          <Route path="medicines" element={<MedicinesPage />} />
          <Route path="*" element={<p>This page does not exist.</p>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
