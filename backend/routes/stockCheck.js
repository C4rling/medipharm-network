import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { withRole } from '../db/withRole.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { sendDbError } from '../lib/errors.js';

const router = Router();

// Stock of one medicine at every branch, best branch first.
// Example: GET /stock-check?medicineId=3&quantity=20
router.get('/stock-check', authenticate, requireRole('staff', 'admin'), async (req, res) => {
  const medicineId = Number(req.query.medicineId);
  const quantity = Number(req.query.quantity);
  if (!Number.isInteger(medicineId) || medicineId <= 0) {
    return res.status(400).json({ error: 'medicineId must be a whole number' });
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) {
    return res.status(400).json({ error: 'quantity must be a whole number from 1 to 10000' });
  }
  try {
    const rows = await withRole(prisma, req.user.role, (tx) => tx.$queryRaw`
      select branch_id as "branchId", branch_name as "branchName",
             stock, is_enough as "isEnough"
        from fn_stock_check(${medicineId}::int, ${quantity}::int)`, req.user.userId);
    res.json(rows);
  } catch (e) {
    sendDbError(res, e);
  }
});

export default router;
