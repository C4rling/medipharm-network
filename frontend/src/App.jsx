import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { api, getToken, clearToken } from './api.js';
import LandingPage from './LandingPage.jsx';
import LoginPage from './LoginPage.jsx';
import SignupPage from './SignupPage.jsx';
import Layout from './Layout.jsx';
import StockPage from './StockPage.jsx';
import MedicinesPage from './MedicinesPage.jsx';
import PrescriptionsPage from './PrescriptionsPage.jsx';
import PatientsPage from './PatientsPage.jsx';
import MyCarePage from './MyCarePage.jsx';
import './AppPolish.css';

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

  if (!user) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage onLogin={setUser} />} />
          <Route path="/signup" element={<SignupPage onLogin={setUser} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    );
  }

  if (user.role === 'patient') {
    return (
      <BrowserRouter>
        <Routes>
          <Route element={<Layout user={user} onLogout={logout} />}>
            <Route path="my-care" element={<MyCarePage />} />
            <Route path="*" element={<Navigate to="/my-care" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout user={user} onLogout={logout} />}>
          <Route index element={<Navigate to="/stock" replace />} />
          <Route path="stock" element={<StockPage role={user.role} />} />
          <Route path="prescriptions" element={<PrescriptionsPage role={user.role} />} />
          <Route path="medicines" element={<MedicinesPage />} />
          <Route path="patients" element={<PatientsPage role={user.role} />} />
          <Route path="*" element={<p>This page does not exist.</p>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}