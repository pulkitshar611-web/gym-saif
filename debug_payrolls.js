
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkPayrolls() {
    try {
        const payrolls = await prisma.payroll.findMany({
            include: {
                tenant: { select: { name: true } }
            }
        });
        console.log('--- All Payrolls ---');
        console.log(JSON.stringify(payrolls, null, 2));

        const users = await prisma.user.findMany({
            select: { id: true, name: true, tenantId: true, role: true }
        });
        console.log('--- All Users ---');
        console.log(JSON.stringify(users, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

checkPayrolls();
