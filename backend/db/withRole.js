export const ROLES = {
  admin: 'medipharm_admin',
  staff: 'medipharm_staff',
  patient: 'medipharm_patient',
};

// Runs `work` in one transaction, acting as the database role for `appRole`.
// Pass the signed-in user's id as the 4th argument so audit rows show who acted
// (and so row-level security can use it later).
export async function withRole(prisma, appRole, work, userId = null) {
  if (!Object.hasOwn(ROLES, appRole)) {
    throw new Error(`Unknown role: ${appRole}`);
  }
  const dbRole = ROLES[appRole]; // always from the fixed map, never from user input

  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${dbRole}`);
      if (userId !== null && userId !== undefined) {
        await tx.$executeRaw`select set_config('app.current_user_id', ${String(userId)}, true)`;
      }
      return work(tx);
    },
    { maxWait: 10000, timeout: 15000 },
  );
}