import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { withRole } from '../db/withRole.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { sendDbError } from '../lib/errors.js';

const router = Router();

router.post('/prescriptions/:id/dispense', authenticate, requireRole('staff'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'id must be a number' });
  }
  try {
    const out = await withRole(prisma, req.user.role, async (tx) => {
      const called = await tx.$queryRaw`
        call sp_dispense_prescription(${id}::int, ${req.user.userId}::int, null)`;
      const rx = await tx.$queryRaw`
        select prescription_id as "prescriptionId", status, branch_id as "branchId"
        from prescriptions where prescription_id = ${id}`;
      const items = await tx.$queryRaw`
        select m.medicine_id as "medicineId", m.name,
               pi.quantity_requested as "quantityRequested",
               pi.quantity_dispensed as "quantityDispensed",
               pi.item_status as "itemStatus"
        from prescription_items pi
        join medicines m on m.medicine_id = pi.medicine_id
        where pi.prescription_id = ${id}
        order by m.name`;
      return { result: called[0]?.p_result ?? null, prescription: { ...rx[0], items } };
    });
    res.json(out);
  } catch (e) {
    sendDbError(res, e);
  }
});

router.post('/branches/:branchId/restock', authenticate, requireRole('staff', 'admin'), async (req, res) => {
  const branchId = Number(req.params.branchId);
  const { medicineId, quantity } = req.body ?? {};
  if (![branchId, medicineId, quantity].every(Number.isInteger)) {
    return res.status(400).json({ error: 'branchId, medicineId and quantity must be whole numbers' });
  }
  if (quantity <= 0) {
    return res.status(400).json({ error: 'quantity must be greater than 0' });
  }
  try {
    const rows = await withRole(prisma, req.user.role, async (tx) => {
      await tx.$executeRaw`
        call sp_restock_branch(${branchId}::int, ${medicineId}::int, ${quantity}::int, ${req.user.userId}::int)`;
      return tx.$queryRaw`
        select quantity from branches_stock
        where branch_id = ${branchId} and medicine_id = ${medicineId}`;
    });
    res.json({ ok: true, quantity: rows[0]?.quantity ?? null });
  } catch (e) {
    sendDbError(res, e);
  }
});

export default router;