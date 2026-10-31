import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { withRole } from '../db/withRole.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { sendDbError } from '../lib/errors.js';

const router = Router();

const MAX = {
  firstName: 50,
  lastName: 50,
  phone: 20,
  address: 255,
  gender: 10,
  emergencyContact: 100,
};
const GENDERS = ['male', 'female', 'other']; // the only values patient_gender_check accepts
const NAME_RE = /^\p{L}[\p{L}\p{M}\s'.-]*$/u; // letters, spaces, hyphens, apostrophes, periods

// ---- Phone rules (Philippine numbers) -------------------------------------
// Mobile:   09XXXXXXXXX  (also accepts +639XXXXXXXXX and 639XXXXXXXXX)
// Landline: area code + number, 10 digits starting 02 to 08 (for example 02 8123 4567)
// Change these three functions if you need to accept numbers from other countries.
function normalizePhone(raw) {
  let d = raw.replace(/[\s\-().]/g, '');
  if (d.startsWith('+63')) d = `0${d.slice(3)}`;
  else if (d.startsWith('63') && d.length === 12) d = `0${d.slice(2)}`;
  return d;
}
function isValidPhone(d) {
  if (/^(\d)\1+$/.test(d)) return false; // all the same digit, such as 00000000000
  return /^09\d{9}$/.test(d) || /^0[2-8]\d{8}$/.test(d);
}
function looksLikeNumber(v) {
  return /^[\d\s()+.-]+$/.test(v);
}

// List patients (staff and admin).
router.get('/patients', authenticate, requireRole('staff', 'admin'), async (req, res) => {
  try {
    const rows = await withRole(prisma, req.user.role, (tx) => tx.$queryRaw`
      select p.patient_id as "patientId",
             pr.first_name as "firstName",
             pr.last_name as "lastName",
             pr.phone,
             p.date_of_birth as "dateOfBirth",
             p.gender,
             p.emergency_contact as "emergencyContact"
      from patient p
      join profile pr on pr.profile_id = p.patient_id
      order by pr.last_name, pr.first_name
      limit 500`);
    res.json(rows);
  } catch (e) {
    sendDbError(res, e);
  }
});

// Register a new patient: one profile row plus one patient row, in one transaction.
router.post('/patients', authenticate, requireRole('staff', 'admin'), async (req, res) => {
  const body = req.body ?? {};
  const text = (key) => (typeof body[key] === 'string' ? body[key].trim() : '');
  const bad = (message) => res.status(400).json({ error: message });

  const firstName = text('firstName').replace(/\s+/g, ' ');
  const lastName = text('lastName').replace(/\s+/g, ' ');
  const dateOfBirth = text('dateOfBirth');
  const address = text('address');

  // Lengths
  for (const key of Object.keys(MAX)) {
    if (text(key).length > MAX[key]) {
      return bad(`${key} is too long (maximum ${MAX[key]} characters)`);
    }
  }

  // Names
  if (firstName.length < 2 || !NAME_RE.test(firstName)) {
    return bad('First name must be at least 2 letters (letters, spaces, hyphens and apostrophes only)');
  }
  if (lastName.length < 2 || !NAME_RE.test(lastName)) {
    return bad('Last name must be at least 2 letters (letters, spaces, hyphens and apostrophes only)');
  }

  // Date of birth: a real calendar date, from 1900 up to today
  const dob = new Date(`${dateOfBirth}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || Number.isNaN(dob.getTime())
      || dob.toISOString().slice(0, 10) !== dateOfBirth) {
    return bad('Date of birth must be a valid date (YYYY-MM-DD)');
  }
  if (dob > new Date()) return bad('Date of birth cannot be in the future');
  if (dateOfBirth < '1900-01-01') return bad('Date of birth cannot be before 1900');

  // Gender
  const gender = text('gender').toLowerCase() || null;
  if (gender && !GENDERS.includes(gender)) return bad('Gender must be male, female or other');

  // Phone
  let phone = null;
  if (text('phone')) {
    phone = normalizePhone(text('phone'));
    if (!isValidPhone(phone)) {
      return bad('Phone must be a valid Philippine number, for example 09171234567 or 02 8123 4567');
    }
  }

  // Emergency contact: a phone number, or a name (optionally with a number)
  let emergencyContact = text('emergencyContact') || null;
  if (emergencyContact) {
    if (looksLikeNumber(emergencyContact)) {
      emergencyContact = normalizePhone(emergencyContact);
      if (!isValidPhone(emergencyContact)) {
        return bad('Emergency contact number is not a valid Philippine number');
      }
    } else if (emergencyContact.length < 3 || !/\p{L}/u.test(emergencyContact)) {
      return bad('Emergency contact must be a name or a valid number');
    }
  }

    // Address: required. No way to confirm it exists, so check that it is sensible text
  if (!address) return bad('Address is required');
  if (address.length < 5 || !/\p{L}/u.test(address)) {
    return bad('Address looks too short or incomplete');
  }

  try {
    const result = await withRole(prisma, req.user.role, async (tx) => {
      // Duplicate check: same name (ignoring capitals) and same date of birth.
      const existing = await tx.$queryRaw`
        select p.patient_id as "patientId"
        from patient p
        join profile pr on pr.profile_id = p.patient_id
        where lower(pr.first_name) = lower(${firstName})
          and lower(pr.last_name) = lower(${lastName})
          and p.date_of_birth = ${dateOfBirth}::date
        limit 1`;
      if (existing.length > 0) return { duplicateOf: existing[0].patientId };

      const created = await tx.$queryRaw`
        insert into profile (first_name, last_name, phone, address)
                values (${firstName}, ${lastName}, ${phone}, ${address})
        returning profile_id as "profileId"`;
      const id = created[0].profileId;
      await tx.$executeRaw`
        insert into patient (patient_id, date_of_birth, gender, emergency_contact)
        values (${id}::int, ${dateOfBirth}::date, ${gender}, ${emergencyContact})`;
      return { patientId: id };
    });

    if (result.duplicateOf) {
      return res.status(409).json({
        error: `${firstName} ${lastName} (born ${dateOfBirth}) is already registered as patient #${result.duplicateOf}`,
      });
    }
    res.status(201).json({ ok: true, patientId: result.patientId, firstName, lastName });
  } catch (e) {
    sendDbError(res, e);
  }
});

// How much history each patient has. Used to tell whether a patient is safe to delete.
router.get('/patients/activity', authenticate, requireRole('staff', 'admin'), async (req, res) => {
  try {
    const rows = await withRole(prisma, req.user.role, (tx) => tx.$queryRaw`
      select p.patient_id as "patientId",
             (select count(*) from appointments a where a.patient_id = p.patient_id)::int as appointments,
             (select count(*) from prescriptions rx where rx.patient_id = p.patient_id)::int as prescriptions
      from patient p`);
    res.json(rows);
  } catch (e) {
    sendDbError(res, e);
  }
});

// Delete a patient, only when they have no appointments and no prescriptions.
// Admin only: the staff database role has no DELETE permission by design (002_create_roles.sql).
router.delete('/patients/:id', authenticate, requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'id must be a number' });
  }
  try {
    const result = await withRole(prisma, req.user.role, async (tx) => {
      const found = await tx.$queryRaw`
        select pr.first_name as "firstName", pr.last_name as "lastName"
        from patient p
        join profile pr on pr.profile_id = p.patient_id
        where p.patient_id = ${id}::int`;
      if (found.length === 0) return { notFound: true };

      const counts = await tx.$queryRaw`
        select (select count(*) from appointments where patient_id = ${id}::int)::int as appointments,
               (select count(*) from prescriptions where patient_id = ${id}::int)::int as prescriptions`;
      if (counts[0].appointments > 0 || counts[0].prescriptions > 0) {
        return { blocked: counts[0] };
      }

      // Removing the profile also removes the patient row (the database cascades it).
      await tx.$executeRaw`delete from profile where profile_id = ${id}::int`;
      return { deleted: found[0] };
    });

    if (result.notFound) return res.status(404).json({ error: 'Patient not found' });
    if (result.blocked) {
      return res.status(409).json({
        error: 'This patient has appointments or prescriptions on record, so they cannot be deleted',
      });
    }
    res.json({ ok: true, ...result.deleted });
  } catch (e) {
    // 23503 is the database saying other records still point at this patient.
    if (String(e?.message).includes('23503')) {
      return res.status(409).json({ error: 'This patient is linked to other records and cannot be deleted' });
    }
    sendDbError(res, e);
  }
});

// ---------------------------------------------------------------------------
// Patient self-service: a signed-in patient sees ONLY their own care.
// The patient database role can read every patient's rows, so the filter on
// the patient's own ID is applied in every query below. Do not remove it.
// ---------------------------------------------------------------------------
router.get('/my/care', authenticate, requireRole('patient'), async (req, res) => {
  try {
    // Find which patient this login belongs to. The token only holds userId and role,
    // and the patient database role cannot read user_account, so this uses the app connection.
    const link = await prisma.$queryRaw`
      select profile_id as "profileId" from user_account where user_id = ${req.user.userId}::int`;
    if (link.length === 0) return res.status(404).json({ error: 'No patient record for this account' });
    const pid = link[0].profileId;

    const data = await withRole(prisma, req.user.role, async (tx) => {
      const me = await tx.$queryRaw`
        select pr.first_name as "firstName", pr.last_name as "lastName"
        from patient p
        join profile pr on pr.profile_id = p.patient_id
        where p.patient_id = ${pid}::int`;
      if (me.length === 0) return null;

      const rx = await tx.$queryRaw`
        select rx.prescription_id as "prescriptionId", rx.status,
               to_char(rx.date_created, 'YYYY-MM-DD') as "dateCreated",
               b.name as branch,
               d.doctor_id as "doctorId", dp.first_name as "doctorFirstName",
               dp.last_name as "doctorLastName", d.specialty
        from prescriptions rx
        join pharmacy_branches b on b.branch_id = rx.branch_id
        join doctor d on d.doctor_id = rx.prescribing_doctor_id
        join profile dp on dp.profile_id = d.doctor_id
        where rx.patient_id = ${pid}::int
        order by rx.date_created desc, rx.prescription_id desc`;

      const items = await tx.$queryRaw`
        select pi.prescription_id as "prescriptionId", m.name, m.unit,
               pi.quantity_requested as "quantityRequested",
               pi.quantity_dispensed as "quantityDispensed",
               pi.item_status as "itemStatus"
        from prescription_items pi
        join medicines m on m.medicine_id = pi.medicine_id
        join prescriptions rx on rx.prescription_id = pi.prescription_id
        where rx.patient_id = ${pid}::int
        order by m.name`;

      const appts = await tx.$queryRaw`
        select a.appointment_id as "appointmentId",
               to_char(a.appointment_date, 'YYYY-MM-DD') as "date",
               to_char(a.time_slot, 'HH24:MI') as "time",
               a.status, c.name as clinic,
               d.doctor_id as "doctorId", dp.first_name as "doctorFirstName",
               dp.last_name as "doctorLastName", d.specialty
        from appointments a
        join clinic c on c.clinic_id = a.clinic_id
        join doctor d on d.doctor_id = a.doctor_id
        join profile dp on dp.profile_id = d.doctor_id
        where a.patient_id = ${pid}::int
        order by a.appointment_date desc, a.time_slot desc`;

      return { me: me[0], rx, items, appts };
    });

    if (!data) return res.status(404).json({ error: 'No patient record for this account' });

    // The assigned doctor(s): everyone who has treated or prescribed for this patient.
    const doctors = new Map();
    for (const row of [...data.appts, ...data.rx]) {
      if (!doctors.has(row.doctorId)) {
        doctors.set(row.doctorId, {
          doctorId: row.doctorId,
          name: `${row.doctorFirstName} ${row.doctorLastName}`,
          specialty: row.specialty,
        });
      }
    }

    const prescriptions = data.rx.map((r) => ({
      prescriptionId: r.prescriptionId,
      status: r.status,
      dateCreated: r.dateCreated,
      branch: r.branch,
      doctorName: `${r.doctorFirstName} ${r.doctorLastName}`,
      specialty: r.specialty,
      items: data.items.filter((i) => i.prescriptionId === r.prescriptionId),
    }));

    const appointments = data.appts.map((a) => ({
      appointmentId: a.appointmentId,
      date: a.date,
      time: a.time,
      status: a.status,
      clinic: a.clinic,
      doctorName: `${a.doctorFirstName} ${a.doctorLastName}`,
      specialty: a.specialty,
    }));

    res.json({
      patient: data.me,
      doctors: [...doctors.values()],
      prescriptions,
      appointments,
    });
  } catch (e) {
    sendDbError(res, e);
  }
});

export default router;