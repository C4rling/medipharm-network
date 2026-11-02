import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { withRole } from '../db/withRole.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { sendDbError } from '../lib/errors.js';

const router = Router();
const anyUser = [authenticate, requireRole('patient', 'staff', 'admin')];

const toId = (v) => {
  const n = typeof v === 'number' || typeof v === 'string' ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
};

// The patient this login belongs to. The patient database role cannot read
// user_account, so this uses the app connection, like /my/care does.
async function patientIdOf(userId) {
  const rows = await prisma.$queryRaw`
    select profile_id as "profileId" from user_account where user_id = ${userId}::int`;
  return rows[0]?.profileId ?? null;
}

// Book an appointment. A patient always books for themselves; staff and admin
// say which patient. The procedure checks the schedule, the doctor's clinic, and more.
router.post('/appointments', ...anyUser, async (req, res) => {
  const body = req.body ?? {};
  const bad = (message) => res.status(400).json({ error: message });

  const doctorId = toId(body.doctorId);
  const clinicId = toId(body.clinicId);
  const date = typeof body.date === 'string' ? body.date.trim() : '';
  const time = typeof body.time === 'string' ? body.time.trim() : '';

  if (!doctorId) return bad('Choose a doctor');
  if (!clinicId) return bad('Choose a clinic');
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime())
      || parsed.toISOString().slice(0, 10) !== date) {
    return bad('Date must be a valid date (YYYY-MM-DD)');
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return bad('Time must be HH:MM (24-hour)');

  try {
    let patientId;
    if (req.user.role === 'patient') {
      patientId = await patientIdOf(req.user.userId);
      if (!patientId) return res.status(404).json({ error: 'No patient record for this account' });
    } else {
      patientId = toId(body.patientId);
      if (!patientId) return bad('Choose a patient');
    }

    const rows = await withRole(prisma, req.user.role, (tx) => tx.$queryRaw`
      call create_appointment(${patientId}::int, ${doctorId}::int, ${clinicId}::int,
                              ${date}::date, ${time}::time, ${req.user.userId}::int, null::int)`,
    req.user.userId);

    res.status(201).json({ ok: true, appointmentId: rows[0]?.p_appointment_id ?? null });
  } catch (e) {
    sendDbError(res, e);
  }
});

// List appointments. A patient sees only their own; staff and admin see all
// (optionally for one doctor, which gives a doctor's schedule: ?doctorId=5).
router.get('/appointments', ...anyUser, async (req, res) => {
  const hasDoctor = req.query.doctorId !== undefined;
  const doctorId = hasDoctor ? toId(req.query.doctorId) : null;
  if (hasDoctor && !doctorId) return res.status(400).json({ error: 'doctorId must be a number' });

  try {
    let patientFilter = null;
    if (req.user.role === 'patient') {
      patientFilter = await patientIdOf(req.user.userId);
      if (!patientFilter) return res.status(404).json({ error: 'No patient record for this account' });
    }

    const rows = await withRole(prisma, req.user.role, (tx) => tx.$queryRaw`
      select a.appointment_id as "appointmentId",
             to_char(a.appointment_date, 'YYYY-MM-DD') as "date",
             to_char(a.time_slot, 'HH24:MI') as "time",
             a.status,
             a.patient_id as "patientId",
             pp.first_name || ' ' || pp.last_name as "patientName",
             a.doctor_id as "doctorId",
             dp.first_name || ' ' || dp.last_name as "doctorName",
             c.name as clinic
        from appointments a
        join profile pp on pp.profile_id = a.patient_id
        join profile dp on dp.profile_id = a.doctor_id
        join clinic c on c.clinic_id = a.clinic_id
       where (${patientFilter}::int is null or a.patient_id = ${patientFilter}::int)
         and (${doctorId}::int is null or a.doctor_id = ${doctorId}::int)
       order by a.appointment_date desc, a.time_slot desc
       limit 200`, req.user.userId);
    res.json(rows);
  } catch (e) {
    sendDbError(res, e);
  }
});

// Cancel an appointment. A patient can cancel only their own, and only while it is scheduled.
router.patch('/appointments/:id/cancel', ...anyUser, async (req, res) => {
  const id = toId(req.params.id);
  if (!id) return res.status(400).json({ error: 'id must be a number' });

  try {
    let patientFilter = null;
    if (req.user.role === 'patient') {
      patientFilter = await patientIdOf(req.user.userId);
      if (!patientFilter) return res.status(404).json({ error: 'No patient record for this account' });
    }

    const result = await withRole(prisma, req.user.role, async (tx) => {
      const found = await tx.$queryRaw`
        select status from appointments
         where appointment_id = ${id}::int
           and (${patientFilter}::int is null or patient_id = ${patientFilter}::int)`;
      if (found.length === 0) return { notFound: true };
      if (found[0].status !== 'scheduled') return { status: found[0].status };
      await tx.$executeRaw`
        update appointments set status = 'cancelled' where appointment_id = ${id}::int`;
      return { ok: true };
    }, req.user.userId);

    if (result.notFound) return res.status(404).json({ error: 'Appointment not found' });
    if (result.status) {
      return res.status(409).json({
        error: `Only a scheduled appointment can be cancelled (this one is ${result.status})`,
      });
    }
    res.json({ ok: true });
  } catch (e) {
    sendDbError(res, e);
  }
});

export default router;