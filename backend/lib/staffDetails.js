import { prisma } from './prisma.js';
import { withRole } from '../db/withRole.js';

// For a staff login: is this person a doctor, a pharmacist, or neither?
// Doctors are rows in the doctor table and pharmacists are rows in the pharmacist table
// (which also holds their branch). Both use the same user_account profile_id.
// Called once at login, and the answer goes into the token.
export async function staffDetailsFor(userId) {
  try {
    const rows = await withRole(prisma, 'staff', (tx) => tx.$queryRaw`
      select (d.doctor_id is not null) as "isDoctor",
             (ph.pharmacist_id is not null) as "isPharmacist",
             ph.branch_id as "branchId"
        from user_account ua
        left join doctor d on d.doctor_id = ua.profile_id
        left join pharmacist ph on ph.pharmacist_id = ua.profile_id
       where ua.user_id = ${userId}::int`);
    const r = rows[0];
    if (r?.isDoctor) return { position: 'doctor', branchId: null };
    if (r?.isPharmacist) return { position: 'pharmacist', branchId: r.branchId };
  } catch (e) {
    console.error('Could not look up the staff position', e);
  }
  // Neither (or the lookup failed): treated as general staff, who see everything.
  return { position: 'staff', branchId: null };
}