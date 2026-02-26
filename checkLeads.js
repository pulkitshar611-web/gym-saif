const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const leads = await prisma.lead.findMany({
        select: {
            id: true,
            name: true,
            nextFollowUp: true,
            status: true,
            tenantId: true
        }
    });
    console.log(JSON.stringify(leads, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
