// gym_backend/prisma/seed.js
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    const hashedPassword = await bcrypt.hash('admin123', 10);

    // Create Superadmin
    const superadmin = await prisma.user.upsert({
        where: { email: 'admin@newgym.com' },
        update: {},
        create: {
            email: 'admin@newgym.com',
            password: hashedPassword,
            name: 'Super Admin',
            role: 'SUPER_ADMIN',
            status: 'Active',
        },
    });

    // Create Test Gym (Tenant)
    const testGym = await prisma.tenant.upsert({
        where: { id: 1 },
        update: {},
        create: {
            id: 1,
            name: 'Test Elite Gym',
            branchName: 'Main Branch',
            owner: 'Test Owner',
            phone: '1234567890',
            location: '123 Fitness St, Fit City',
            status: 'Active'
        }
    });

    // Create Test Branch Admin
    const branchHashedPassword = await bcrypt.hash('123456', 10);
    const branchAdmin = await prisma.user.upsert({
        where: { email: 'testbranch@gym.com' },
        update: {
            tenantId: testGym.id // Ensure it's linked
        },
        create: {
            email: 'testbranch@gym.com',
            password: branchHashedPassword,
            name: 'Test Branch Admin',
            role: 'BRANCH_ADMIN',
            status: 'Active',
            tenantId: testGym.id
        },
    });

    console.log({ superadmin, testGym, branchAdmin });
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
