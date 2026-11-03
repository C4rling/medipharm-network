// backend/routes/accounts.js
//
// Admin only. One login per person:
//   GET   /accounts       every login with the person it belongs to, plus the
//                         doctors, pharmacists and patients who have no login yet
//   POST  /accounts       give a person (by profile id) their own login
//   PATCH /accounts/:id   change the email, reset the password, switch on or off
//   PUT   /accounts/:id/type   make the person a patient, doctor or pharmacist
//
// The role is never taken from the request. It comes from who the person is:
// doctors and pharmacists get 'staff' (the token then tells them apart by
// position), patients get 'patient'. Passwords are stored as bcrypt hashes and
// are never sent back.

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { withRole } from '../db/withRole.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { sendDbError } from '../lib/errors.js';

const router = Router();
const adminOnly = [authenticate, requireRole('admin')];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const toId = (v) => {
  const n = typeof v === 'number' || typeof v === 'string' ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
};
const emailProblem = (email) =>
  !email || email.length > 100 || !EMAIL_RE.test(email) ? 'Enter a valid email address' : null;
const passwordProblem = (pw) => {
  if (pw.length < 8) return 'Password must be at least 8 characters';
  if (Buffer.byteLength(pw) > 72) return 'Password can be at most 72 bytes';
  return null;
};
const isDuplicate = (e) => /duplicate key|23505/.test(String(e?.message));

// ---------------------------------------------------------------------
// Every login, and the people who still need one
// ---------------------------------------------------------------------
router.get('/accounts', ...adminOnly, async (req, res) => {
  try {
    const data = await withRole(prisma, req.user.role, async (tx) => {
      const accounts = await tx.$queryRaw`
        SELECT u.user_id AS "userId",
               u.user_email AS email,
               u.role,
               u.active_status AS active,
               u.profile_id AS "profileId",
               CASE WHEN d.doctor_id IS NOT NULL THEN 'doctor'
                    WHEN ph.pharmacist_id IS NOT NULL THEN 'pharmacist'
                    WHEN pt.patient_id IS NOT NULL THEN 'patient'
                    WHEN u.role = 'admin' THEN 'admin'
               END AS "personType",
               p.first_name AS "firstName",
               p.last_name AS "lastName"
          FROM user_account u
          LEFT JOIN profile p ON p.profile_id = u.profile_id
          LEFT JOIN doctor d ON d.doctor_id = u.profile_id
          LEFT JOIN pharmacist ph ON ph.pharmacist_id = u.profile_id
          LEFT JOIN patient pt ON pt.patient_id = u.profile_id
         ORDER BY u.user_id`;

      const people = await tx.$queryRaw`
        SELECT kind, id, "firstName", "lastName" FROM (
          SELECT 'doctor' AS kind, d.doctor_id AS id,
                 p.first_name AS "firstName", p.last_name AS "lastName"
            FROM doctor d JOIN profile p ON p.profile_id = d.doctor_id
          UNION ALL
          SELECT 'pharmacist', ph.pharmacist_id, p.first_name, p.last_name
            FROM pharmacist ph JOIN profile p ON p.profile_id = ph.pharmacist_id
          UNION ALL
          SELECT 'patient', pt.patient_id, p.first_name, p.last_name
            FROM patient pt JOIN profile p ON p.profile_id = pt.patient_id
        ) everyone
        WHERE NOT EXISTS (SELECT 1 FROM user_account u WHERE u.profile_id = everyone.id)
        ORDER BY kind, "lastName", "firstName"`;

      const clinics = await tx.$queryRaw`SELECT clinic_id AS id, name FROM clinic ORDER BY name`;
      const branches = await tx.$queryRaw`SELECT branch_id AS id, name FROM pharmacy_branches ORDER BY name`;

      return { accounts, people, clinics, branches };
    });
    res.json(data);
  } catch (e) {
    sendDbError(res, e);
  }
});

// ---------------------------------------------------------------------
// Give a person their own login
// ---------------------------------------------------------------------
router.post('/accounts', ...adminOnly, async (req, res) => {
  const body = req.body ?? {};
  const bad = (message) => res.status(400).json({ error: message });

  const profileId = toId(body.profileId);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!profileId) return bad('Choose a person');
  const eProblem = emailProblem(email);
  if (eProblem) return bad(eProblem);
  const pProblem = passwordProblem(password);
  if (pProblem) return bad(pProblem);

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await withRole(prisma, req.user.role, async (tx) => {
      const who = await tx.$queryRaw`
        SELECT CASE
                 WHEN EXISTS (SELECT 1 FROM doctor WHERE doctor_id = ${profileId}::int) THEN 'doctor'
                 WHEN EXISTS (SELECT 1 FROM pharmacist WHERE pharmacist_id = ${profileId}::int) THEN 'pharmacist'
                 WHEN EXISTS (SELECT 1 FROM patient WHERE patient_id = ${profileId}::int) THEN 'patient'
               END AS kind`;
      const kind = who[0]?.kind;
      if (!kind) return { problem: 'That person is not a doctor, pharmacist or patient' };

      const existing = await tx.$queryRaw`
        SELECT 1 FROM user_account WHERE profile_id = ${profileId}::int`;
      if (existing.length > 0) return { problem: 'That person already has a login' };

      const role = kind === 'patient' ? 'patient' : 'staff';
      const created = await tx.$queryRaw`
        INSERT INTO user_account (profile_id, user_email, password_hash, role)
        VALUES (${profileId}::int, ${email}, ${passwordHash}, ${role})
        RETURNING user_id AS "userId"`;
      return { userId: created[0].userId, role, kind };
    });

    if (result.problem) return bad(result.problem);
    res.status(201).json({ ok: true, ...result, email });
  } catch (e) {
    if (isDuplicate(e)) {
      return res.status(409).json({ error: 'That email is already used by another account' });
    }
    sendDbError(res, e);
  }
});

// ---------------------------------------------------------------------
// Change an email, reset a password, switch an account off or on
// ---------------------------------------------------------------------
router.patch('/accounts/:id', ...adminOnly, async (req, res) => {
  const bad = (message) => res.status(400).json({ error: message });
  const id = toId(req.params.id);
  if (!id) return bad('Invalid account id');

  const body = req.body ?? {};
  const email = body.email === undefined ? undefined : String(body.email).trim().toLowerCase();
  const password = body.password === undefined || body.password === '' ? undefined : String(body.password);
  const active = typeof body.active === 'boolean' ? body.active : undefined;

  if (email === undefined && password === undefined && active === undefined) {
    return bad('Nothing to change');
  }
  if (email !== undefined) {
    const problem = emailProblem(email);
    if (problem) return bad(problem);
  }
  if (password !== undefined) {
    const problem = passwordProblem(password);
    if (problem) return bad(problem);
  }
  if (active === false && id === req.user.userId) {
    return bad('You cannot switch off your own account');
  }

  try {
    const passwordHash = password === undefined ? undefined : await bcrypt.hash(password, 10);
    const found = await withRole(prisma, req.user.role, async (tx) => {
      const rows = await tx.$queryRaw`SELECT 1 FROM user_account WHERE user_id = ${id}::int`;
      if (rows.length === 0) return false;
      if (email !== undefined) {
        await tx.$executeRaw`UPDATE user_account SET user_email = ${email} WHERE user_id = ${id}::int`;
      }
      if (passwordHash !== undefined) {
        await tx.$executeRaw`UPDATE user_account SET password_hash = ${passwordHash} WHERE user_id = ${id}::int`;
      }
      if (active !== undefined) {
        await tx.$executeRaw`UPDATE user_account SET active_status = ${active}::boolean WHERE user_id = ${id}::int`;
      }
      return true;
    });
    if (!found) return res.status(404).json({ error: 'Account not found' });
    res.json({ ok: true });
  } catch (e) {
    if (isDuplicate(e)) {
      return res.status(409).json({ error: 'That email is already used by another account' });
    }
    sendDbError(res, e);
  }
});

// ---------------------------------------------------------------------
// Change what kind of person an account belongs to.
// New accounts start as patients; an admin makes someone a doctor or pharmacist.
//   body: { type: 'patient' | 'doctor' | 'pharmacist',
//           specialty, licenseNumber, clinicId   (doctor)
//           licenseNumber, branchId              (pharmacist) }
// The login's role follows the type: doctors and pharmacists are 'staff'.
// A person keeps their patient record when they become a doctor or pharmacist.
// Leaving a type is refused while that type has records (appointments,
// prescriptions, published times), so history is never orphaned.
// ---------------------------------------------------------------------
router.put('/accounts/:id/type', ...adminOnly, async (req, res) => {
  const bad = (message) => res.status(400).json({ error: message });
  const id = toId(req.params.id);
  if (!id) return bad('Invalid account id');
  if (id === req.user.userId) return bad('You cannot change your own account type');

  const body = req.body ?? {};
  const type = body.type;
  if (!['patient', 'doctor', 'pharmacist'].includes(type)) {
    return bad('Choose patient, doctor or pharmacist');
  }
  const specialty = typeof body.specialty === 'string' ? body.specialty.trim() : '';
  const licenseNumber = typeof body.licenseNumber === 'string' ? body.licenseNumber.trim() : '';
  const clinicId = toId(body.clinicId);
  const branchId = toId(body.branchId);

  if (type === 'doctor') {
    if (specialty.length < 2 || specialty.length > 100) return bad('Enter the doctor’s specialty');
    if (licenseNumber.length < 3 || licenseNumber.length > 50) return bad('Enter the license number');
    if (!clinicId) return bad('Choose the clinic this doctor works at');
  }
  if (type === 'pharmacist') {
    if (licenseNumber.length < 3 || licenseNumber.length > 50) return bad('Enter the license number');
    if (!branchId) return bad('Choose the branch this pharmacist works at');
  }

  try {
    const result = await withRole(prisma, req.user.role, async (tx) => {
      const rows = await tx.$queryRaw`
        SELECT u.role,
               u.profile_id AS "profileId",
               EXISTS (SELECT 1 FROM doctor d WHERE d.doctor_id = u.profile_id) AS "isDoctor",
               EXISTS (SELECT 1 FROM pharmacist ph WHERE ph.pharmacist_id = u.profile_id) AS "isPharmacist",
               EXISTS (SELECT 1 FROM patient pt WHERE pt.patient_id = u.profile_id) AS "isPatient"
          FROM user_account u
         WHERE u.user_id = ${id}::int`;
      if (rows.length === 0) return { notFound: true };

      const cur = rows[0];
      if (cur.role === 'admin') return { problem: 'Administrator accounts cannot be changed here' };
      const pid = cur.profileId;
      const current = cur.isDoctor ? 'doctor' : cur.isPharmacist ? 'pharmacist' : 'patient';

      if (current === type) return { problem: `This account is already a ${type}` };
      if (type === 'patient' && !cur.isPatient) {
        return {
          problem: 'This person has no patient record, so they cannot be switched to a patient. Switch the account off instead.',
        };
      }

      if (type === 'doctor') {
        const clinic = await tx.$queryRaw`SELECT 1 FROM clinic WHERE clinic_id = ${clinicId}::int`;
        if (clinic.length === 0) return { problem: 'That clinic does not exist' };
      }
      if (type === 'pharmacist') {
        const branch = await tx.$queryRaw`SELECT 1 FROM pharmacy_branches WHERE branch_id = ${branchId}::int`;
        if (branch.length === 0) return { problem: 'That branch does not exist' };
      }

      // Leave the current staff type first.
      if (current === 'doctor') {
        const history = await tx.$queryRaw`
          SELECT (SELECT COUNT(*) FROM appointments WHERE doctor_id = ${pid}::int)::int AS appointments,
                 (SELECT COUNT(*) FROM prescriptions WHERE prescribing_doctor_id = ${pid}::int)::int AS prescriptions,
                 (SELECT COUNT(*) FROM doctor_availability
                   WHERE doctor_id = ${pid}::int AND status <> 'cancelled')::int AS slots`;
        const h = history[0];
        if (h.appointments + h.prescriptions + h.slots > 0) {
          return {
            problem: 'This doctor has appointments, prescriptions or published times on record, so their type cannot be changed. Switch the account off instead.',
          };
        }
        await tx.$executeRaw`DELETE FROM doctor_availability WHERE doctor_id = ${pid}::int`;
        await tx.$executeRaw`DELETE FROM doctor WHERE doctor_id = ${pid}::int`;
      } else if (current === 'pharmacist') {
        await tx.$executeRaw`DELETE FROM pharmacist WHERE pharmacist_id = ${pid}::int`;
      }

      // Become the new type.
      if (type === 'patient') {
        await tx.$executeRaw`DELETE FROM staff WHERE staff_id = ${pid}::int`;
      } else {
        await tx.$executeRaw`
          INSERT INTO staff (staff_id, hire_date) VALUES (${pid}::int, CURRENT_DATE)
          ON CONFLICT (staff_id) DO NOTHING`;
        if (type === 'doctor') {
          await tx.$executeRaw`
            INSERT INTO doctor (doctor_id, specialty, license_number)
            VALUES (${pid}::int, ${specialty}, ${licenseNumber})`;
          await tx.$executeRaw`
            INSERT INTO doctor_clinic_assignments (doctor_id, clinic_id)
            VALUES (${pid}::int, ${clinicId}::int)`;
        } else {
          await tx.$executeRaw`
            INSERT INTO pharmacist (pharmacist_id, branch_id, license_number)
            VALUES (${pid}::int, ${branchId}::int, ${licenseNumber})`;
        }
      }

      const role = type === 'patient' ? 'patient' : 'staff';
      await tx.$executeRaw`UPDATE user_account SET role = ${role} WHERE user_id = ${id}::int`;
      return { ok: true, type, role };
    });

    if (result.notFound) return res.status(404).json({ error: 'Account not found' });
    if (result.problem) return bad(result.problem);
    res.json(result);
  } catch (e) {
    if (isDuplicate(e)) {
      return res.status(409).json({ error: 'That license number is already used by someone else' });
    }
    if (/23503|foreign key/i.test(String(e?.message))) {
      return res.status(409).json({
        error: 'This person has records tied to their current type, so it cannot be changed. Switch the account off instead.',
      });
    }
    sendDbError(res, e);
  }
});

export default router;