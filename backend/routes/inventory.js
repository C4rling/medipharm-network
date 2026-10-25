import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { withRole } from '../db/withRole.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();
const staffOrAdmin = [authenticate, requireRole('staff', 'admin')];

function handleError(res, e) {
  if (String(e.message).includes('permission denied')) {
    return res.status(403).json({ error: 'Permission denied' });
  }
  console.error(e);
  return res.status(500).json({ error: 'Server error' });
}

router.get('/medicines', ...staffOrAdmin, async (req, res) => {
  try {
    const rows = await withRole(prisma, req.user.role, (tx) => tx.$queryRaw`
      select medicine_id as "medicineId", name, generic_name as "genericName",
             form, unit, reorder_threshold as "reorderThreshold"
      from medicines
      order by name`);
    res.json(rows);
  } catch (e) {
    handleError(res, e);
  }
});

router.get('/branches', ...staffOrAdmin, async (req, res) => {
  try {
    const rows = await withRole(prisma, req.user.role, (tx) => tx.$queryRaw`
      select branch_id as "branchId", name, address, phone
      from pharmacy_branches
      order by name`);
    res.json(rows);
  } catch (e) {
    handleError(res, e);
  }
});

router.get('/branches/:branchId/stock', ...staffOrAdmin, async (req, res) => {
  const branchId = Number(req.params.branchId);
  if (!Number.isInteger(branchId)) {
    return res.status(400).json({ error: 'branchId must be a number' });
  }
  try {
    const rows = await withRole(prisma, req.user.role, async (tx) => {
      const branch = await tx.$queryRaw`
        select branch_id from pharmacy_branches where branch_id = ${branchId}`;
      if (branch.length === 0) return null;
      return tx.$queryRaw`
        select m.medicine_id as "medicineId", m.name, m.unit,
               m.reorder_threshold as "reorderThreshold",
               s.quantity, s.updated_on as "updatedOn"
        from branches_stock s
        join medicines m on m.medicine_id = s.medicine_id
        where s.branch_id = ${branchId}
        order by m.name`;
    });
    if (rows === null) {
      return res.status(404).json({ error: `Branch ${branchId} not found` });
    }
    res.json(rows);
  } catch (e) {
    handleError(res, e);
  }
});

export default router;