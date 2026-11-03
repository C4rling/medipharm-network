import { NavLink, Outlet } from 'react-router-dom';

const roleLabel = { admin: 'Administrator', staff: 'Staff', patient: 'Patient' };

export default function Layout({ user, onLogout }) {
  const isPatient = user.role === 'patient';
  const isAdmin = user.role === 'admin';
  const isDoctor = user.position === 'doctor';
  const isPharmacist = user.position === 'pharmacist';
  const label = isDoctor
    ? 'Doctor'
    : isPharmacist ? 'Pharmacist' : (roleLabel[user.role] ?? user.role);

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
              <NavLink to="/prescriptions">Prescriptions</NavLink>
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
