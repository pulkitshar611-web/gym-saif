const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const users = await prisma.user.findMany({ select: { id: true, email: true, role: true, name: true, tenantId: true } });
    console.log('Users:', users);
    process.exit(0);
}
main();
