// backend/routes/prescriptions.js
//
// Read-only endpoints for the screens:
//   GET /prescriptions          list (staff, admin). A doctor sees only their own prescriptions,
//                               a pharmacist only those sent to their branch.
//   GET /prescriptions/waiting  how many still need dispensing (the menu badge), same limits
//   GET /prescriptions/:id      one prescription with its items (same limits)
//   GET /alerts               low-stock alerts (staff, admin)
//   GET /audit-logs           latest audit rows (admin only)
//
// Prescriptions are created by doctors from their patient list (see routes/doctor.js).
//
// Every query runs inside withRole(), so PostgreSQL itself enforces what each
// tier may read (see migrations/002_create_roles.sql). Values are passed
// through tagged templates, which Prisma sends as bound parameters.

import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { withRole } from '../db/withRole.js';
import { prisma } from '../lib/prisma.js';

const router = Router();
const staffOrAdmin = [authenticate, requireRole('staff', 'admin')];
const adminOnly = [authenticate, requireRole('admin')];

function fail(res, err) {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
}

// Who may see what:
//   a doctor     only prescriptions they wrote (doctorId)
//   a pharmacist only prescriptions sent to their branch (branchId, from their login)
//   anyone else  no limit (null)
// A doctor or pharmacist login with no matching record gets 0, so it sees nothing.
async function limits(tx, req) {
  let doctorId = null;
  if (req.user.position === 'doctor') {
    const rows = await tx.$queryRaw`
      SELECT d.doctor_id AS id
        FROM user_account u
        JOIN doctor d ON d.doctor_id = u.profile_id
       WHERE u.user_id = ${req.user.userId}::int`;
    doctorId = rows[0]?.id ?? 0;
  }
  const branchId = req.user.position === 'pharmacist' ? Number(req.user.branchId) || 0 : null;
  return { doctorId, branchId };
}

// ---------------------------------------------------------------------
// Prescription list
// ---------------------------------------------------------------------
router.get('/prescriptions', ...staffOrAdmin, async (req, res) => {
  try {
    const rows = await withRole(prisma, req.user.role, async (tx) => {
      const { doctorId, branchId } = await limits(tx, req);
      return tx.$queryRaw`
        SELECT p.prescription_id AS id,
               p.status,
               p.date_created,
               pp.first_name || ' ' || pp.last_name AS patient_name,
               dp.first_name || ' ' || dp.last_name AS doctor_name,
               b.name AS branch_name,
               p.branch_id,
               (p.status = 'pending' AND p.date_created > now() - interval '24 hours') AS is_new,
               (SELECT COUNT(*)::int FROM prescription_items i
                 WHERE i.prescription_id = p.prescription_id) AS item_count
          FROM prescriptions p
          JOIN profile pp ON pp.profile_id = p.patient_id
          JOIN profile dp ON dp.profile_id = p.prescribing_doctor_id
          JOIN pharmacy_branches b ON b.branch_id = p.branch_id
         WHERE (${doctorId}::int IS NULL OR p.prescribing_doctor_id = ${doctorId}::int)
           AND (${branchId}::int IS NULL OR p.branch_id = ${branchId}::int)
         ORDER BY p.prescription_id DESC
      `;
    });
    res.json(rows);
  } catch (err) {
    fail(res, err);
  }
});

// ---------------------------------------------------------------------
// How many prescriptions still need dispensing (drives the menu badge).
// This must stay ABOVE /prescriptions/:id, or "waiting" would be read as an id.
// ---------------------------------------------------------------------
router.get('/prescriptions/waiting', ...staffOrAdmin, async (req, res) => {
  try {
    const row = await withRole(prisma, req.user.role, async (tx) => {
      const { doctorId, branchId } = await limits(tx, req);
      const rows = await tx.$queryRaw`
        SELECT COUNT(*)::int AS count
          FROM prescriptions p
         WHERE p.status IN ('pending', 'partially_dispensed')
           AND (${doctorId}::int IS NULL OR p.prescribing_doctor_id = ${doctorId}::int)
           AND (${branchId}::int IS NULL OR p.branch_id = ${branchId}::int)`;
      return rows[0];
    });
    res.json({ count: row.count });
  } catch (err) {
    fail(res, err);
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
      const { doctorId, branchId } = await limits(tx, req);
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
           AND (${doctorId}::int IS NULL OR p.prescribing_doctor_id = ${doctorId}::int)
           AND (${branchId}::int IS NULL OR p.branch_id = ${branchId}::int)
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