const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.user.findMany({ select: { id: true, email: true, name: true, role: true, tenantId: true } }).then(users => {
    console.log(JSON.stringify(users, null, 2));
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
