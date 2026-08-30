import { PrismaClient } from '@prisma/client';
import { PERMISSIONS, ROLE_PERMISSIONS } from '../src/common/constants';

const prisma = new PrismaClient();

async function syncRolePermissions() {
  const permissions = await prisma.permission.findMany();
  const permMap = new Map(permissions.map((p) => [p.name, p.id]));

  const roles = await prisma.role.findMany({
    where: { isSystem: true, companyId: { not: null } },
  });

  for (const role of roles) {
    const expected = ROLE_PERMISSIONS[role.slug];
    if (!expected) continue;

    const permissionIds = expected
      .map((name) => permMap.get(name))
      .filter((id): id is string => !!id);

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (permissionIds.length) {
      await prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      });
    }
  }

  console.log(`Synced permissions for ${roles.length} system roles`);
}

async function main() {
  console.log('Seeding permissions...');
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { name: perm.name },
      update: {},
      create: { name: perm.name, module: perm.module, description: perm.name },
    });
  }
  console.log(`Seeded ${PERMISSIONS.length} permissions`);
  await syncRolePermissions();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
