// backend/routes/prescriptions.js
//
// Endpoints for the screens:
//   GET  /prescriptions          list (staff, admin)
//   GET  /prescriptions/options  appointments, branches and medicines for the new-prescription form (staff, admin)
//   POST /prescriptions          create a prescription with its items (staff, admin)
//   GET  /prescriptions/:id      one prescription with its items (staff, admin)
//   GET  /alerts                 low-stock alerts (staff, admin)
//   GET  /audit-logs             latest audit rows (admin only)
//
// A prescription belongs to a consultation, and a consultation belongs to an
// appointment. So a new prescription starts from an appointment: the patient and
// doctor come from that appointment, and the consultation is reused if the
// appointment already has one, or created if it does not.
//
// Every query runs inside withRole(), so PostgreSQL itself enforces what each
// tier may read or write (see migrations/002_create_roles.sql). Values are passed
// through tagged templates, which Prisma sends as bound parameters.

import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { withRole } from '../db/withRole.js';
import { prisma } from '../lib/prisma.js';
import { sendDbError } from '../lib/errors.js';

const router = Router();
const staffOrAdmin = [authenticate, requireRole('staff', 'admin')];
const adminOnly = [authenticate, requireRole('admin')];

function fail(res, err) {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
}

// ---------------------------------------------------------------------
// Prescription list
// ---------------------------------------------------------------------
router.get('/prescriptions', ...staffOrAdmin, async (req, res) => {
  try {
    const rows = await withRole(prisma, req.user.role, (tx) => tx.$queryRaw`
      SELECT p.prescription_id AS id,
             p.status,
             p.date_created,
             pp.first_name || ' ' || pp.last_name AS patient_name,
             dp.first_name || ' ' || dp.last_name AS doctor_name,
             b.name AS branch_name,
             p.branch_id,
             (SELECT COUNT(*)::int FROM prescription_items i
               WHERE i.prescription_id = p.prescription_id) AS item_count
        FROM prescriptions p
        JOIN profile pp ON pp.profile_id = p.patient_id
        JOIN profile dp ON dp.profile_id = p.prescribing_doctor_id
        JOIN pharmacy_branches b ON b.branch_id = p.branch_id
       ORDER BY p.prescription_id DESC
    `);
    res.json(rows);
  } catch (err) {
    fail(res, err);
  }
});

// ---------------------------------------------------------------------
// Choices for the new-prescription form.
// This must stay ABOVE /prescriptions/:id, or "options" would be read as an id.
// ---------------------------------------------------------------------
router.get('/prescriptions/options', ...staffOrAdmin, async (req, res) => {
  try {
    const data = await withRole(prisma, req.user.role, async (tx) => {
      const appointments = await tx.$queryRaw`
        SELECT a.appointment_id AS id,
               a.patient_id,
               pp.first_name || ' ' || pp.last_name AS patient_name,
               a.doctor_id,
               dp.first_name || ' ' || dp.last_name AS doctor_name,
               c.name AS clinic,
               to_char(a.appointment_date, 'YYYY-MM-DD') AS date,
               to_char(a.time_slot, 'HH24:MI') AS time,
               a.status
          FROM appointments a
          JOIN profile pp ON pp.profile_id = a.patient_id
          JOIN profile dp ON dp.profile_id = a.doctor_id
          JOIN clinic c ON c.clinic_id = a.clinic_id
         WHERE a.status <> 'cancelled'
         ORDER BY a.appointment_date DESC, a.time_slot DESC
         LIMIT 500`;
      const branches = await tx.$queryRaw`
        SELECT branch_id AS id, name FROM pharmacy_branches ORDER BY name`;
      const medicines = await tx.$queryRaw`
        SELECT medicine_id AS id, name, unit FROM medicines ORDER BY name`;
      return { appointments, branches, medicines };
    });
    res.json(data);
  } catch (err) {
    sendDbError(res, err);
  }
});

// ---------------------------------------------------------------------
// Create a prescription: the consultation (if the appointment has none yet),
// one prescriptions row, and one row per medicine, all in one transaction,
// so it is never saved half-way.
// ---------------------------------------------------------------------
router.post('/prescriptions', ...staffOrAdmin, async (req, res) => {
  const body = req.body ?? {};
  const bad = (message) => res.status(400).json({ error: message });
  const toId = (v) => {
    const n = typeof v === 'number' || typeof v === 'string' ? Number(v) : NaN;
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  const optionalText = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

  const appointmentId = toId(body.appointmentId);
  const branchId = toId(body.branchId);
  if (!appointmentId) return bad('Choose the appointment this prescription comes from');
  if (!branchId) return bad('Choose a branch');

  const diagnosis = optionalText(body.diagnosis);
  const notes = optionalText(body.notes);
  if ((diagnosis?.length ?? 0) > 2000 || (notes?.length ?? 0) > 2000) {
    return bad('Diagnosis and notes can be at most 2000 characters each');
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return bad('Add at least one medicine');
  }
  if (body.items.length > 20) return bad('A prescription can have at most 20 medicines');

  const items = [];
  const seen = new Set();
  for (const raw of body.items) {
    const medicineId = toId(raw?.medicineId);
    const quantity = toId(raw?.quantity);
    if (!medicineId) return bad('Choose a medicine for every row');
    if (!quantity || quantity > 10000) {
      return bad('Quantity must be a whole number from 1 to 10000');
    }
    if (seen.has(medicineId)) return bad('Each medicine can only appear once');
    seen.add(medicineId);
    items.push({ medicineId, quantity });
  }

  try {
    const result = await withRole(prisma, req.user.role, async (tx) => {
      const appt = await tx.$queryRaw`
        SELECT patient_id AS "patientId", doctor_id AS "doctorId", status
          FROM appointments
         WHERE appointment_id = ${appointmentId}::int`;
      if (appt.length === 0) return { problem: 'That appointment does not exist' };
      if (appt[0].status === 'cancelled') {
        return { problem: 'A prescription cannot come from a cancelled appointment' };
      }
      const { patientId, doctorId } = appt[0];

      const branch = await tx.$queryRaw`
        SELECT 1 FROM pharmacy_branches WHERE branch_id = ${branchId}::int`;
      if (branch.length === 0) return { problem: 'That branch does not exist' };

      for (const it of items) {
        const med = await tx.$queryRaw`
          SELECT 1 FROM medicines WHERE medicine_id = ${it.medicineId}::int`;
        if (med.length === 0) return { problem: 'One of the medicines does not exist' };
      }

      // Reuse the appointment's consultation, or create one.
      let consultationId;
      const existing = await tx.$queryRaw`
        SELECT consultation_id AS id
          FROM consultation
         WHERE appointment_id = ${appointmentId}::int
         ORDER BY consultation_id DESC
         LIMIT 1`;
      if (existing.length > 0) {
        consultationId = existing[0].id;
      } else {
        const made = await tx.$queryRaw`
          INSERT INTO consultation (appointment_id, diagnosis, notes)
          VALUES (${appointmentId}::int, ${diagnosis}, ${notes})
          RETURNING consultation_id AS id`;
        consultationId = made[0].id;
      }

      // status and date_created use the table defaults ('pending' and now).
      const created = await tx.$queryRaw`
        INSERT INTO prescriptions (consultation_id, patient_id, prescribing_doctor_id, branch_id)
        VALUES (${consultationId}::int, ${patientId}::int, ${doctorId}::int, ${branchId}::int)
        RETURNING prescription_id AS id`;
      const id = created[0].id;

      // quantity_dispensed (0) and item_status ('pending') use the table defaults.
      for (const it of items) {
        await tx.$executeRaw`
          INSERT INTO prescription_items (prescription_id, medicine_id, quantity_requested)
          VALUES (${id}::int, ${it.medicineId}::int, ${it.quantity}::int)`;
      }
      return { id };
    });

    if (result.problem) return bad(result.problem);
    res.status(201).json({ ok: true, id: result.id });
  } catch (err) {
    sendDbError(res, err);
  }
});

// ---------------------------------------------------------------------
// One prescription with its items
// ---------------------------------------------------------------------
router.get('/prescriptions/:id', ...staffOrAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid prescription id' });
  }
  try {
    const result = await withRole(prisma, req.user.role, async (tx) => {
      const header = await tx.$queryRaw`
        SELECT p.prescription_id AS id,
               p.status,
               p.date_created,
               pp.first_name || ' ' || pp.last_name AS patient_name,
               dp.first_name || ' ' || dp.last_name AS doctor_name,
               b.name AS branch_name,
               p.branch_id
          FROM prescriptions p
          JOIN profile pp ON pp.profile_id = p.patient_id
          JOIN profile dp ON dp.profile_id = p.prescribing_doctor_id
          JOIN pharmacy_branches b ON b.branch_id = p.branch_id
         WHERE p.prescription_id = ${id}
      `;
      if (header.length === 0) return null;

      const items = await tx.$queryRaw`
        SELECT i.prescription_item_id AS id,
               m.medicine_id,
               m.name AS medicine,
               i.quantity_requested,
               i.quantity_dispensed,
               i.item_status
          FROM prescription_items i
          JOIN medicines m ON m.medicine_id = i.medicine_id
         WHERE i.prescription_id = ${id}
         ORDER BY m.name
      `;
      return { ...header[0], items };
    });

    if (!result) return res.status(404).json({ error: 'Prescription not found' });
    res.json(result);
  } catch (err) {
    fail(res, err);
  }
});

// ---------------------------------------------------------------------
// Low-stock alerts
// ---------------------------------------------------------------------
router.get('/alerts', ...staffOrAdmin, async (req, res) => {
  try {
    const rows = await withRole(prisma, req.user.role, (tx) => tx.$queryRaw`
      SELECT a.alert_id AS id,
             b.name AS branch_name,
             m.name AS medicine,
             a.current_quantity,
             a.threshold,
             a.date_created,
             a.resolved
        FROM low_stock_alerts a
        JOIN pharmacy_branches b ON b.branch_id = a.branch_id
        JOIN medicines m ON m.medicine_id = a.medicine_id
       ORDER BY a.resolved, a.date_created DESC
    `);
    res.json(rows);
  } catch (err) {
    fail(res, err);
  }
});

// ---------------------------------------------------------------------
// Audit log (admin only: staff and patient have no access in the database)
// ---------------------------------------------------------------------
router.get('/audit-logs', ...adminOnly, async (req, res) => {
  try {
    const rows = await withRole(prisma, req.user.role, (tx) => tx.$queryRaw`
      SELECT log_id AS id,
             table_name,
             record_id,
             action,
             changed_by,
             old_status_value,
             new_status_value,
             changed_on
        FROM audit_logs
       ORDER BY log_id DESC
       LIMIT 100
    `);
    res.json(rows);
  } catch (err) {
    fail(res, err);
  }
});

export default router;