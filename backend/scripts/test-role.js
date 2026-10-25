import { prisma } from '../lib/prisma.js';
import { withRole } from '../db/withRole.js';

async function main() {
  console.log('Plain connection:', await prisma.$queryRaw`select current_user`);

  const asStaff = await withRole(prisma, 'staff', async (tx) => ({
    user: await tx.$queryRaw`select current_user`,
    medicines: await tx.$queryRaw`select count(*)::int as n from medicines`,
  }));
  console.log('As staff:', asStaff);

  try {
    await withRole(prisma, 'hacker', async () => {});
  } catch (e) {
    console.log('Bad role rejected:', e.message);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());