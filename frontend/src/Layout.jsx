import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from './api.js';
import './PharmacyAlerts.css';

const roleLabel = { admin: 'Administrator', staff: 'Staff', patient: 'Patient' };

export default function Layout({ user, onLogout }) {
  const isPatient = user.role === 'patient';
  const isAdmin = user.role === 'admin';
  const isDoctor = user.position === 'doctor';
  const isPharmacist = user.position === 'pharmacist';
  const label = isDoctor
    ? 'Doctor'
    : isPharmacist ? 'Pharmacist' : (roleLabel[user.role] ?? user.role);

  // The pharmacist's alert: how many prescriptions at their branch still need dispensing.
  const [waiting, setWaiting] = useState(0);
  const { pathname } = useLocation();
  useEffect(() => {
    if (!isPharmacist) return undefined;
    let cancelled = false;
    const refresh = () =>
      api('/prescriptions/waiting')
        .then((r) => {
          if (!cancelled) setWaiting(r.count);
        })
        .catch(() => {});
    refresh();
    const timer = setInterval(refresh, 30000);
    window.addEventListener('rx-changed', refresh);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('rx-changed', refresh);
    };
  }, [isPharmacist, pathname]);

  return (
    <div className="shell">
      <aside className="rail">
        <div className="wordmark">
          MediPharm
          <small>Network</small>
        </div>
        <nav className="nav" aria-label="Main">
          {isPatient ? (
            <>
              <NavLink to="/my-care">My care</NavLink>
              <NavLink to="/book">Book appointment</NavLink>
            </>
          ) : (
            <>
              {isDoctor && <NavLink to="/my-patients">My patients</NavLink>}
              {isDoctor && <NavLink to="/schedule">My schedule</NavLink>}
              {!isDoctor && <NavLink to="/stock">Stock</NavLink>}
              {!isDoctor && <NavLink to="/medicines">Medicines</NavLink>}
              <NavLink to="/prescriptions">
                Prescriptions
                {isPharmacist && waiting > 0 && (
                  <span className="nav-badge">
                    {waiting}
                    <span className="sr-only"> waiting to be dispensed</span>
                  </span>
                )}
              </NavLink>
              {!isPharmacist && !isDoctor && <NavLink to="/patients">Patients</NavLink>}
              {isAdmin && <NavLink to="/accounts">Accounts</NavLink>}
            </>
          )}
        </nav>
        <div className="account">
          <span>{label}</span>
          <button className="btn" onClick={onLogout}>Log out</button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
