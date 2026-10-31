import { NavLink, Outlet } from 'react-router';

const roleLabel = { admin: 'Administrator', staff: 'Staff', patient: 'Patient' };

export default function Layout({ user, onLogout }) {
  return (
    <div className="shell">
      <aside className="rail">
        <div className="wordmark">
          MediPharm
          <small>Network</small>
        </div>
        <nav className="nav" aria-label="Main">
          <NavLink to="/stock">Stock</NavLink>
          <NavLink to="/medicines">Medicines</NavLink>
        </nav>
        <div className="account">
          <span>{roleLabel[user.role] ?? user.role}</span>
          <button className="btn" onClick={onLogout}>Log out</button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
