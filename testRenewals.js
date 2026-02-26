const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Let's create two test members: one expiring soon (3 days from now), one expired (3 days ago)
    const today = new Date();

    const expiringDate = new Date();
    expiringDate.setDate(today.getDate() + 3);

    const expiredDate = new Date();
    expiredDate.setDate(today.getDate() - 3);

    const m1 = await prisma.member.create({
        data: {
            tenantId: 1,
            memberId: "MEM-TEST-EXP1",
            name: "Soon To Expire",
            phone: "9999999991",
            status: "Active",
            joinDate: new Date(),
            expiryDate: expiringDate
        }
    });

    const m2 = await prisma.member.create({
        data: {
            tenantId: 1,
            memberId: "MEM-TEST-EXP2",
            name: "Already Expired Test",
            phone: "9999999992",
            status: "Expired",
            joinDate: new Date(),
            expiryDate: expiredDate
        }
    });
    console.log("Created test members.");
}

main().finally(() => prisma.$disconnect());
