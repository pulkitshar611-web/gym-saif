const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const lead = await prisma.lead.create({
            data: {
                tenantId: 1,
                name: "Test Lead Today",
                phone: "1234567890",
                email: "",
                gender: "",
                age: null,
                interests: [],
                source: "",
                budget: "",
                preferredContact: "WhatsApp",
                assignedToId: null,
                notes: "Just testing",
                nextFollowUp: new Date("2026-02-26T12:00:00.000Z"),
                status: 'New'
            }
        });

        await prisma.followUp.create({
            data: {
                leadId: lead.id,
                status: 'Pending',
                nextDate: new Date("2026-02-26T12:00:00.000Z"),
                notes: 'Initial Follow-up Schedule'
            }
        });

        console.log("Created successfully", lead);
    } catch (e) {
        console.error("Error creating:", e.message);
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
