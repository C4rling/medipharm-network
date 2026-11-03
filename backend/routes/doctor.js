// backend/routes/doctor.js
//
// The doctor's side of a visit. Only a doctor's own appointments are visible:
//   GET  /doctor/patients                 my booked appointments (scheduled = pending, completed)
//   GET  /doctor/appointments/:id         one appointment with the patient, medicines and any saved consultation
//   POST /doctor/appointments/:id/consult save the diagnosis and, if medicines are chosen,
//                                         create the prescription for the pharmacist; the
//                                         appointment then becomes completed
//
// Who is acting always comes from the signed-in login (user_account.profile_id),
// never from the request, so a doctor cannot open another doctor's patients.

import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { withRole } from '../db/withRole.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { sendDbError } from '../lib/errors.js';

const router = Router();
const doctorOnly = [authenticate, requireRole('staff')];

const toId = (v) => {
  const n = typeof v === 'number' || typeof v === 'string' ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
};

async function doctorIdFor(tx, userId) {
  const rows = await tx.$queryRaw`
    SELECT d.doctor_id AS id
      FROM user_account u
      JOIN doctor d ON d.doctor_id = u.profile_id
     WHERE u.user_id = ${userId}::int`;
  return rows[0]?.id ?? null;
}

const notDoctor = (res) => res.status(403).json({ error: 'Only doctors can use this page' });

// ---------------------------------------------------------------------
// My patients: pending first (soonest first), then completed (latest first)
// ---------------------------------------------------------------------
router.get('/doctor/patients', ...doctorOnly, async (req, res) => {
  try {
    const rows = await withRole(prisma, req.user.role, async (tx) => {
      const doctorId = await doctorIdFor(tx, req.user.userId);
      if (!doctorId) return null;
      return tx.$queryRaw`
        SELECT a.appointment_id AS id,
               to_char(a.appointment_date, 'YYYY-MM-DD') AS date,
               to_char(a.time_slot, 'HH24:MI') AS time,
               a.status,
               a.patient_id AS "patientId",
               pp.first_name || ' ' || pp.last_name AS "patientName",
               c.name AS clinic,
               (SELECT pr.prescription_id
                  FROM consultation co
                  JOIN prescriptions pr ON pr.consultation_id = co.consultation_id
                 WHERE co.appointment_id = a.appointment_id
                 ORDER BY pr.prescription_id DESC
                 LIMIT 1) AS "prescriptionId"
          FROM appointments a
          JOIN profile pp ON pp.profile_id = a.patient_id
          JOIN clinic c ON c.clinic_id = a.clinic_id
         WHERE a.doctor_id = ${doctorId}::int
           AND a.status IN ('scheduled', 'completed')
         ORDER BY (a.status <> 'scheduled'),
                  CASE WHEN a.status = 'scheduled' THEN a.appointment_date END ASC,
                  CASE WHEN a.status = 'scheduled' THEN a.time_slot END ASC,
                  a.appointment_date DESC, a.time_slot DESC
         LIMIT 300`;
    });
    if (!rows) return notDoctor(res);
    res.json(rows);
  } catch (e) {
    sendDbError(res, e);
  }
});

// ---------------------------------------------------------------------
// One appointment: patient, medicines (with stock at the clinic's branch),
// and the consultation and prescription if they already exist
// ---------------------------------------------------------------------
router.get('/doctor/appointments/:id', ...doctorOnly, async (req, res) => {
  const id = toId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid appointment id' });
  try {
    const data = await withRole(prisma, req.user.role, async (tx) => {
      const doctorId = await doctorIdFor(tx, req.user.userId);
      if (!doctorId) return { forbidden: true };

      const found = await tx.$queryRaw`
        SELECT a.appointment_id AS id,
               to_char(a.appointment_date, 'YYYY-MM-DD') AS date,
               to_char(a.time_slot, 'HH24:MI') AS time,
               a.status,
               a.patient_id AS "patientId",
               pp.first_name || ' ' || pp.last_name AS "patientName",
               to_char(pt.date_of_birth, 'YYYY-MM-DD') AS "dateOfBirth",
               pt.gender,
               c.name AS clinic,
               c.branch_id AS "branchId",
               b.name AS "branchName"
          FROM appointments a
          JOIN profile pp ON pp.profile_id = a.patient_id
          JOIN patient pt ON pt.patient_id = a.patient_id
          JOIN clinic c ON c.clinic_id = a.clinic_id
          LEFT JOIN pharmacy_branches b ON b.branch_id = c.branch_id
         WHERE a.appointment_id = ${id}::int AND a.doctor_id = ${doctorId}::int`;
      if (found.length === 0) return { notFound: true };
      const appointment = found[0];

      const medicines = await tx.$queryRaw`
        SELECT m.medicine_id AS id, m.name, m.unit, COALESCE(bs.quantity, 0)::int AS stock
          FROM medicines m
          LEFT JOIN branches_stock bs
                 ON bs.medicine_id = m.medicine_id AND bs.branch_id = ${appointment.branchId ?? 0}::int
         ORDER BY m.name`;

      const cons = await tx.$queryRaw`
        SELECT consultation_id AS "consultationId", diagnosis, notes
          FROM consultation
         WHERE appointment_id = ${id}::int
         ORDER BY consultation_id DESC
         LIMIT 1`;

      const rx = await tx.$queryRaw`
        SELECT pr.prescription_id AS id, pr.status, b.name AS "branchName"
          FROM consultation co
          JOIN prescriptions pr ON pr.consultation_id = co.consultation_id
          JOIN pharmacy_branches b ON b.branch_id = pr.branch_id
         WHERE co.appointment_id = ${id}::int
         ORDER BY pr.prescription_id DESC
         LIMIT 1`;

      let prescription = null;
      if (rx.length > 0) {
        const items = await tx.$queryRaw`
          SELECT m.name, m.unit,
                 pi.quantity_requested AS "quantityRequested",
                 pi.quantity_dispensed AS "quantityDispensed",
                 pi.item_status AS "itemStatus"
            FROM prescription_items pi
            JOIN medicines m ON m.medicine_id = pi.medicine_id
           WHERE pi.prescription_id = ${rx[0].id}::int
           ORDER BY m.name`;
        prescription = { ...rx[0], items };
      }

      return { appointment, medicines, consultation: cons[0] ?? null, prescription };
    });

    if (data.forbidden) return notDoctor(res);
    if (data.notFound) return res.status(404).json({ error: 'Appointment not found' });
    res.json(data);
  } catch (e) {
    sendDbError(res, e);
  }
});

// ---------------------------------------------------------------------
// Save the diagnosis and, when medicines are chosen, the prescription.
// body: { diagnosis, notes, items: [{ medicineId, quantity }] }   (items may be empty)
// One transaction: the consultation, the prescription with its items, and
// the appointment turning completed are saved together or not at all.
// ---------------------------------------------------------------------
router.post('/doctor/appointments/:id/consult', ...doctorOnly, async (req, res) => {
  const bad = (message) => res.status(400).json({ error: message });
  const id = toId(req.params.id);
  if (!id) return bad('Invalid appointment id');

  const body = req.body ?? {};
  const diagnosis = typeof body.diagnosis === 'string' ? body.diagnosis.trim() : '';
  const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;
  if (diagnosis.length < 3) return bad('Enter the diagnosis');
  if (diagnosis.length > 2000 || (notes?.length ?? 0) > 2000) {
    return bad('Diagnosis and notes can be at most 2000 characters each');
  }

  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length > 20) return bad('A prescription can have at most 20 medicines');
  const items = [];
  const seen = new Set();
  for (const raw of rawItems) {
    const medicineId = toId(raw?.medicineId);
    const quantity = toId(raw?.quantity);
    if (!medicineId) return bad('Choose a medicine for every row, or remove the empty row');
    if (!quantity || quantity > 10000) return bad('Quantity must be a whole number from 1 to 10000');
    if (seen.has(medicineId)) return bad('Each medicine can only appear once');
    seen.add(medicineId);
    items.push({ medicineId, quantity });
  }

  try {
    const result = await withRole(prisma, req.user.role, async (tx) => {
      // Tell the audit triggers who is acting, as migration 014 does.
      await tx.$queryRaw`
        SELECT set_config('app.current_user_id', ${String(req.user.userId)}, true)`;

      const doctorId = await doctorIdFor(tx, req.user.userId);
      if (!doctorId) return { forbidden: true };

      const found = await tx.$queryRaw`
        SELECT a.patient_id AS "patientId", a.status, c.branch_id AS "branchId"
          FROM appointments a
          JOIN clinic c ON c.clinic_id = a.clinic_id
         WHERE a.appointment_id = ${id}::int AND a.doctor_id = ${doctorId}::int
           FOR UPDATE OF a`;
      if (found.length === 0) return { notFound: true };
      const { patientId, status, branchId } = found[0];

      if (status !== 'scheduled') {
        return { problem: 'This appointment is already finished or no longer active' };
      }
      if (items.length > 0 && !branchId) {
        return { problem: 'The clinic for this appointment is not linked to a pharmacy branch yet, so a prescription cannot be sent' };
      }
      for (const it of items) {
        const med = await tx.$queryRaw`
          SELECT 1 FROM medicines WHERE medicine_id = ${it.medicineId}::int`;
        if (med.length === 0) return { problem: 'One of the medicines does not exist' };
      }

      // The consultation: reuse one that already exists for this appointment.
      let consultationId;
      const existing = await tx.$queryRaw`
        SELECT consultation_id AS id FROM consultation
         WHERE appointment_id = ${id}::int
         ORDER BY consultation_id DESC LIMIT 1`;
      if (existing.length > 0) {
        consultationId = existing[0].id;
        await tx.$executeRaw`
          UPDATE consultation SET diagnosis = ${diagnosis}, notes = ${notes}
           WHERE consultation_id = ${consultationId}::int`;
      } else {
        const made = await tx.$queryRaw`
          INSERT INTO consultation (appointment_id, diagnosis, notes)
          VALUES (${id}::int, ${diagnosis}, ${notes})
          RETURNING consultation_id AS id`;
        consultationId = made[0].id;
      }

      let prescriptionId = null;
      if (items.length > 0) {
        const created = await tx.$queryRaw`
          INSERT INTO prescriptions (consultation_id, patient_id, prescribing_doctor_id, branch_id)
          VALUES (${consultationId}::int, ${patientId}::int, ${doctorId}::int, ${branchId}::int)
          RETURNING prescription_id AS id`;
        prescriptionId = created[0].id;
        // quantity_dispensed (0) and item_status ('pending') use the table defaults;
        // the stock trigger from migration 015 flags items the branch cannot cover.
        for (const it of items) {
          await tx.$executeRaw`
            INSERT INTO prescription_items (prescription_id, medicine_id, quantity_requested)
            VALUES (${prescriptionId}::int, ${it.medicineId}::int, ${it.quantity}::int)`;
        }
      }

      await tx.$executeRaw`
        UPDATE appointments SET status = 'completed' WHERE appointment_id = ${id}::int`;

      return { consultationId, prescriptionId };
    });

    if (result.forbidden) return notDoctor(res);
    if (result.notFound) return res.status(404).json({ error: 'Appointment not found' });
    if (result.problem) return bad(result.problem);
    res.status(201).json({ ok: true, ...result });
  } catch (e) {
    sendDbError(res, e);
  }
});

export default router;