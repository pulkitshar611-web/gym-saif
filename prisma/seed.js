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

    // Create Dummy Manager
    const manager = await prisma.user.upsert({
        where: { email: 'manager@gym.com' },
        update: { tenantId: testGym.id },
        create: {
            email: 'manager@gym.com',
            password: branchHashedPassword, // 123456
            name: 'Test Manager',
            role: 'MANAGER',
            status: 'Active',
            tenantId: testGym.id
        }
    });

    // Create Dummy Staff
    const staff = await prisma.user.upsert({
        where: { email: 'staff@gym.com' },
        update: { tenantId: testGym.id },
        create: {
            email: 'staff@gym.com',
            password: branchHashedPassword, // 123456
            name: 'Test Staff',
            role: 'STAFF',
            status: 'Active',
            tenantId: testGym.id
        }
    });

    // Create Dummy Trainer
    const trainer = await prisma.user.upsert({
        where: { email: 'trainer@gym.com' },
        update: { tenantId: testGym.id },
        create: {
            email: 'trainer@gym.com',
            password: branchHashedPassword, // 123456
            name: 'Test Trainer',
            role: 'TRAINER',
            status: 'Active',
            tenantId: testGym.id
        }
    });

    // Create Dummy Member
    const member = await prisma.member.upsert({
        where: {
            memberId: 'MEM-001'
        },
        update: { tenantId: testGym.id },
        create: {
            memberId: 'MEM-001',
            email: 'member@gym.com',
            name: 'Test Member',
            phone: '9876543210',
            status: 'Active',
            tenantId: testGym.id,
            joinDate: new Date(),
        }
    });

    console.log("Seeding completed successfully.");
    console.log("--- Logins ---");
    console.log("SuperAdmin: admin@newgym.com / admin123");
    console.log("BranchAdmin: testbranch@gym.com / 123456");
    console.log("Manager: manager@gym.com / 123456");
    console.log("Staff: staff@gym.com / 123456");
    console.log("Trainer: trainer@gym.com / 123456");
    console.log("Member: Doesn't login to dashboard directly today, but connected in DB: member@gym.com");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
