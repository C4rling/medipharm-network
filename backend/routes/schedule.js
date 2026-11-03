// backend/routes/schedule.js
//
// Doctors (staff accounts that belong to a doctor) publish available times:
//   GET    /schedule/clinics   clinics this doctor is actively assigned to
//   GET    /schedule/mine      this doctor's upcoming slots, with the patient on taken ones
//   POST   /schedule           create slots for one day from one or more time windows
//   DELETE /schedule/:id       cancel an open slot
//
// Patients pick one of those times:
//   GET    /schedule/open      every open, upcoming slot
//   POST   /schedule/:id/book  book it (the book_slot procedure does this in one step)
//
// Who is acting always comes from the signed-in login (user_account.profile_id),
// never from the request, so a doctor can only touch their own schedule.

import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { withRole } from '../db/withRole.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { sendDbError } from '../lib/errors.js';

const router = Router();
const doctorOnly = [authenticate, requireRole('staff')];
const patientOnly = [authenticate, requireRole('patient')];

const SLOT_LENGTHS = [15, 20, 30, 45, 60, 90, 120];
const MAX_SLOTS = 48;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const toId = (v) => {
  const n = typeof v === 'number' || typeof v === 'string' ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
};
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toHHMM = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const realDate = (s) => {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

// A message raised by a database procedure (SQLSTATE P0001) is meant for people.
function procedureProblem(e) {
  const text = String(e?.message ?? '');
  if (!text.includes('P0001')) return null;
  const m = text.match(/Message: `([^`]*)`/);
  return m ? m[1] : null;
}

// Which doctor is this login? Null when the login does not belong to a doctor.
async function doctorIdFor(tx, userId) {
  const rows = await tx.$queryRaw`
    SELECT d.doctor_id AS id
      FROM user_account u
      JOIN doctor d ON d.doctor_id = u.profile_id
     WHERE u.user_id = ${userId}::int`;
  return rows[0]?.id ?? null;
}

const notDoctor = (res) => res.status(403).json({ error: 'Only doctors have a schedule' });

// ---------------------------------------------------------------------
// Doctor: clinics I can publish times for
// ---------------------------------------------------------------------
router.get('/schedule/clinics', ...doctorOnly, async (req, res) => {
  try {
    const rows = await withRole(prisma, req.user.role, async (tx) => {
      const doctorId = await doctorIdFor(tx, req.user.userId);
      if (!doctorId) return null;
      return tx.$queryRaw`
        SELECT c.clinic_id AS id, c.name, c.address
          FROM doctor_clinic_assignments a
          JOIN clinic c ON c.clinic_id = a.clinic_id
         WHERE a.doctor_id = ${doctorId}::int AND a.status = 'active'
         ORDER BY c.name`;
    });
    if (!rows) return notDoctor(res);
    res.json(rows);
  } catch (e) {
    sendDbError(res, e);
  }
});

// ---------------------------------------------------------------------
// Doctor: my upcoming slots
// ---------------------------------------------------------------------
router.get('/schedule/mine', ...doctorOnly, async (req, res) => {
  try {
    const rows = await withRole(prisma, req.user.role, async (tx) => {
      const doctorId = await doctorIdFor(tx, req.user.userId);
      if (!doctorId) return null;
      return tx.$queryRaw`
        SELECT s.slot_id AS id,
               to_char(s.slot_date, 'YYYY-MM-DD') AS date,
               to_char(s.start_time, 'HH24:MI') AS "start",
               to_char(s.end_time, 'HH24:MI') AS "end",
               c.name AS clinic,
               s.status,
               pp.first_name || ' ' || pp.last_name AS "patientName"
          FROM doctor_availability s
          JOIN clinic c ON c.clinic_id = s.clinic_id
          LEFT JOIN appointments a ON a.appointment_id = s.appointment_id
          LEFT JOIN profile pp ON pp.profile_id = a.patient_id
         WHERE s.doctor_id = ${doctorId}::int
           AND s.status <> 'cancelled'
           AND s.slot_date >= (now() AT TIME ZONE 'Asia/Manila')::date
         ORDER BY s.slot_date, s.start_time
         LIMIT 500`;
    });
    if (!rows) return notDoctor(res);
    res.json(rows);
  } catch (e) {
    sendDbError(res, e);
  }
});

// ---------------------------------------------------------------------
// Doctor: publish a day's availability
// body: { clinicId, date: 'YYYY-MM-DD', windows: [{from:'09:00', to:'11:30'}], slotMinutes: 60 }
// Only whole appointments are created: a window's leftover time that is
// shorter than one appointment is not offered.
// ---------------------------------------------------------------------
router.post('/schedule', ...doctorOnly, async (req, res) => {
  const body = req.body ?? {};
  const bad = (message) => res.status(400).json({ error: message });

  const clinicId = toId(body.clinicId);
  const date = typeof body.date === 'string' ? body.date : '';
  const slotMinutes = Number(body.slotMinutes);

  if (!clinicId) return bad('Choose a clinic');
  if (!realDate(date)) return bad('Choose a valid date');
  if (!SLOT_LENGTHS.includes(slotMinutes)) return bad('Choose a valid appointment length');
  if (!Array.isArray(body.windows) || body.windows.length === 0 || body.windows.length > 6) {
    return bad('Add 1 to 6 time windows');
  }

  const windows = [];
  for (const w of body.windows) {
    const from = typeof w?.from === 'string' ? w.from : '';
    const to = typeof w?.to === 'string' ? w.to : '';
    if (!TIME_RE.test(from) || !TIME_RE.test(to)) return bad('Enter every time as hours and minutes');
    if (toMin(from) >= toMin(to)) return bad('Each time window must end after it starts');
    windows.push({ from: toMin(from), to: toMin(to) });
  }
  windows.sort((a, b) => a.from - b.from);
  for (let i = 1; i < windows.length; i += 1) {
    if (windows[i].from < windows[i - 1].to) return bad('Time windows cannot overlap');
  }

  const slots = [];
  for (const w of windows) {
    for (let t = w.from; t + slotMinutes <= w.to; t += slotMinutes) {
      slots.push({ start: t, end: t + slotMinutes });
    }
  }
  if (slots.length === 0) {
    return bad('No full appointment fits in those windows. Use a shorter appointment length or a longer window.');
  }
  if (slots.length > MAX_SLOTS) {
    return bad(`That makes ${slots.length} appointments. Please create at most ${MAX_SLOTS} at a time.`);
  }

  try {
    const result = await withRole(prisma, req.user.role, async (tx) => {
      const doctorId = await doctorIdFor(tx, req.user.userId);
      if (!doctorId) return { forbidden: true };

      const assigned = await tx.$queryRaw`
        SELECT 1 FROM doctor_clinic_assignments
         WHERE doctor_id = ${doctorId}::int AND clinic_id = ${clinicId}::int AND status = 'active'`;
      if (assigned.length === 0) return { problem: 'You are not assigned to that clinic' };

      const clock = await tx.$queryRaw`
        SELECT to_char(now() AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD') AS today,
               to_char(now() AT TIME ZONE 'Asia/Manila', 'HH24:MI') AS now`;
      if (date < clock[0].today) return { problem: 'That date has already passed' };
      if (date === clock[0].today && toHHMM(slots[0].start) <= clock[0].now) {
        return { problem: 'Some of those times have already passed today' };
      }

      const existing = await tx.$queryRaw`
        SELECT to_char(start_time, 'HH24:MI') AS "start", to_char(end_time, 'HH24:MI') AS "end"
          FROM doctor_availability
         WHERE doctor_id = ${doctorId}::int AND slot_date = ${date}::date AND status <> 'cancelled'`;
      for (const s of slots) {
        for (const e of existing) {
          if (s.start < toMin(e.end) && s.end > toMin(e.start)) {
            return { problem: `You already have a time published at ${e.start} to ${e.end} on that day` };
          }
        }
      }

      const booked = await tx.$queryRaw`
        SELECT to_char(time_slot, 'HH24:MI') AS "start"
          FROM appointments
         WHERE doctor_id = ${doctorId}::int AND appointment_date = ${date}::date
           AND status IN ('scheduled', 'completed')`;
      for (const s of slots) {
        for (const b of booked) {
          const at = toMin(b.start);
          if (at >= s.start && at < s.end) {
            return { problem: `You already have an appointment at ${b.start} on that day` };
          }
        }
      }

      for (const s of slots) {
        await tx.$executeRaw`
          INSERT INTO doctor_availability (doctor_id, clinic_id, slot_date, start_time, end_time)
          VALUES (${doctorId}::int, ${clinicId}::int, ${date}::date,
                  ${toHHMM(s.start)}::time, ${toHHMM(s.end)}::time)`;
      }
      return { created: slots.length };
    });

    if (result.forbidden) return notDoctor(res);
    if (result.problem) return bad(result.problem);
    res.status(201).json({ ok: true, created: result.created });
  } catch (e) {
    sendDbError(res, e);
  }
});

// ---------------------------------------------------------------------
// Doctor: cancel an open slot (a taken slot belongs to a patient's appointment)
// ---------------------------------------------------------------------
router.delete('/schedule/:id', ...doctorOnly, async (req, res) => {
  const id = toId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid slot id' });
  try {
    const result = await withRole(prisma, req.user.role, async (tx) => {
      const doctorId = await doctorIdFor(tx, req.user.userId);
      if (!doctorId) return { forbidden: true };
      const rows = await tx.$queryRaw`
        SELECT status FROM doctor_availability
         WHERE slot_id = ${id}::int AND doctor_id = ${doctorId}::int`;
      if (rows.length === 0) return { notFound: true };
      if (rows[0].status !== 'open') {
        return { problem: 'Only open times can be removed. This one is already taken or removed.' };
      }
      const changed = await tx.$executeRaw`
        UPDATE doctor_availability SET status = 'cancelled'
         WHERE slot_id = ${id}::int AND doctor_id = ${doctorId}::int AND status = 'open'`;
      if (changed === 0) return { problem: 'That time was just taken, so it cannot be removed' };
      return { ok: true };
    });
    if (result.forbidden) return notDoctor(res);
    if (result.notFound) return res.status(404).json({ error: 'Time slot not found' });
    if (result.problem) return res.status(400).json({ error: result.problem });
    res.json({ ok: true });
  } catch (e) {
    sendDbError(res, e);
  }
});

// ---------------------------------------------------------------------
// Patient: every open, upcoming slot
// ---------------------------------------------------------------------
router.get('/schedule/open', ...patientOnly, async (req, res) => {
  try {
    const rows = await withRole(prisma, req.user.role, (tx) => tx.$queryRaw`
      SELECT s.slot_id AS id,
             to_char(s.slot_date, 'YYYY-MM-DD') AS date,
             to_char(s.start_time, 'HH24:MI') AS "start",
             to_char(s.end_time, 'HH24:MI') AS "end",
             s.doctor_id AS "doctorId",
             dp.first_name || ' ' || dp.last_name AS "doctorName",
             d.specialty,
             s.clinic_id AS "clinicId",
             c.name AS clinic,
             c.address AS "clinicAddress"
        FROM doctor_availability s
        JOIN doctor d ON d.doctor_id = s.doctor_id
        JOIN profile dp ON dp.profile_id = s.doctor_id
        JOIN clinic c ON c.clinic_id = s.clinic_id
       WHERE s.status = 'open'
         AND (s.slot_date + s.start_time) > (now() AT TIME ZONE 'Asia/Manila')
       ORDER BY s.slot_date, s.start_time, dp.last_name
       LIMIT 300`);
    res.json(rows);
  } catch (e) {
    sendDbError(res, e);
  }
});

// ---------------------------------------------------------------------
// Patient: book a slot for myself
// ---------------------------------------------------------------------
router.post('/schedule/:id/book', ...patientOnly, async (req, res) => {
  const slotId = toId(req.params.id);
  if (!slotId) return res.status(400).json({ error: 'Invalid slot id' });
  try {
    // The token only holds userId and role, and the patient database role cannot
    // read user_account, so the patient's profile id is looked up here.
    const link = await prisma.$queryRaw`
      SELECT profile_id AS "profileId" FROM user_account WHERE user_id = ${req.user.userId}::int`;
    if (link.length === 0) return res.status(404).json({ error: 'No patient record for this account' });
    const patientId = link[0].profileId;

    const rows = await withRole(prisma, req.user.role, (tx) => tx.$queryRaw`
      CALL book_slot(${slotId}::int, ${patientId}::int, ${req.user.userId}::int, NULL::int)`);
    res.status(201).json({ ok: true, appointmentId: rows[0]?.p_appointment_id ?? null });
  } catch (e) {
    const problem = procedureProblem(e);
    if (problem) return res.status(400).json({ error: problem });
    sendDbError(res, e);
  }
});

export default router;