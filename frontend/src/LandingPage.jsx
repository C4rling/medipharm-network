import { Link } from 'react-router-dom';
import './theme.css';
import './LandingPage.css';

const WHO = [
  ['Pharmacist', 'Dispense medicine against prescriptions and keep stock counts. Low and out-of-stock items stand out.'],
  ['Doctor', 'See your patients and write prescriptions in the same record the pharmacy works from.'],
  ['Admin', 'Create staff accounts, set what each role can open and check reports.'],
  ['Patient', 'See your doctor, your medication and your appointments, and nothing that belongs to anyone else.'],
];

const STEPS = [
  ['Get an account', 'Patients can create one here. Staff accounts are created by an admin.'],
  ['Sign in', 'Your role decides which pages you can open.'],
  ['Work from one record', 'Prescriptions, dispensing, stock and appointments live in one place.'],
];

export default function LandingPage() {
  return (
    <div className="landing">
      <a className="lp-skip" href="#lp-main">Skip to content</a>

      <header className="lp-hero">
        <div className="lp-wrap">
          <div className="lp-bar">
            <Link className="lp-mark" to="/">MediPharm</Link>
            <nav className="lp-nav" aria-label="Account">
              <Link className="lp-btn lp-btn--ghost" to="/login">Log in</Link>
              <Link className="lp-btn lp-btn--light" to="/signup">Sign up</Link>
            </nav>
          </div>

          <div className="lp-hero__grid">
            <div>
              <h1>Pharmacy, clinic and stock room in one record</h1>
              <p className="lp-lede">
                MediPharm keeps prescriptions, dispensing, stock counts and appointments in one
                place, so everyone sees what their role needs.
              </p>
              <div className="lp-actions">
                <Link className="lp-btn lp-btn--light" to="/signup">Create a patient account</Link>
                <Link className="lp-btn lp-btn--ghost" to="/login">Log in</Link>
              </div>
              <p className="lp-note">Staff: your admin creates your account. Log in to continue.</p>
            </div>

            <div className="lp-label" aria-hidden="true">
              <p className="lp-label__tag">Sample view</p>
              <dl>
                <div><dt>Patient</dt><dd>Sample Patient</dd></div>
                <div><dt>Medicine</dt><dd>Paracetamol 500 mg</dd></div>
                <div><dt>Prescribed</dt><dd>20 tablets</dd></div>
                <div><dt>Given</dt><dd>20 tablets</dd></div>
                <div><dt>Status</dt><dd><span className="lp-pill">Dispensed</span></dd></div>
              </dl>
            </div>
          </div>
        </div>
      </header>

      <main id="lp-main">
        <section className="lp-section" aria-labelledby="who-title">
          <div className="lp-wrap">
            <h2 id="who-title">One record, four ways to use it</h2>
            <p className="lp-intro">
              Everyone signs in to the same system. What you can open depends on your role.
            </p>
            <dl className="lp-who">
              {WHO.map(([role, text]) => (
                <div key={role}>
                  <dt>{role}</dt>
                  <dd>{text}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="lp-section lp-section--tint" aria-labelledby="how-title">
          <div className="lp-wrap">
            <h2 id="how-title">How it works</h2>
            <ol className="lp-steps">
              {STEPS.map(([title, text]) => (
                <li key={title}>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="lp-cta" aria-labelledby="cta-title">
          <div className="lp-wrap lp-cta__inner">
            <h2 id="cta-title">Ready to see your care in one place?</h2>
            <div className="lp-actions">
              <Link className="lp-btn lp-btn--light" to="/signup">Sign up</Link>
              <Link className="lp-btn lp-btn--ghost" to="/login">Log in</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer__inner">
          <span>MediPharm</span>
          <span className="lp-footer__links">
            <Link to="/login">Log in</Link>
            <Link to="/signup">Sign up</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
