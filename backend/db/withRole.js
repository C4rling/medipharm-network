export const ROLES = {
  admin: 'medipharm_admin',
  staff: 'medipharm_staff',
  patient: 'medipharm_patient',
};

// Runs `work` in one transaction, acting as the database role for `appRole`.
export async function withRole(prisma, appRole, work) {
  if (!Object.hasOwn(ROLES, appRole)) {
    throw new Error(`Unknown role: ${appRole}`);
  }
  const dbRole = ROLES[appRole]; // always from the fixed map, never from user input

  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE ${dbRole}`);
    return work(tx);
  });
}