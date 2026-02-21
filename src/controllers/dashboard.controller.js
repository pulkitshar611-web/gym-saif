const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getManagerDashboard = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;

        const activeMembers = await prisma.member.count({
            where: { tenantId, status: 'Active' }
        });

        const classesToday = await prisma.class.count({
            where: { tenantId } // Simplified for now
        });

        const paymentsDue = await prisma.invoice.count({
            where: { tenantId, status: 'Overdue' }
        });

        // Basic attendance data
        const attendance = [
            { id: 1, name: 'Morning Yoga', time: '07:00 AM', attendees: Math.floor(activeMembers / 10), capacity: 15 },
            { id: 2, name: 'HIIT Blast', time: '06:00 PM', attendees: Math.floor(activeMembers / 8), capacity: 20 },
        ];

        res.json({
            activeMembers,
            classesToday,
            paymentsDue,
            attendance
        });
    } catch (error) {
        console.error('Manager Dashboard Error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

exports.getStaffDashboard = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;

        const checkinsToday = await prisma.attendance.count({
            where: { tenantId } // Simply counting all for now
        });

        const pendingPayments = await prisma.invoice.count({
            where: { tenantId, status: 'Pending' }
        });

        const newEnquiries = await prisma.lead.count({
            where: { tenantId, status: 'New' }
        });

        const checkins = await prisma.attendance.findMany({
            where: { tenantId },
            take: 5,
            include: { member: true }
        });

        const formattedCheckins = checkins.map((c, i) => ({
            id: c.id,
            member: c.member?.name || 'Unknown User',
            plan: 'Gym Plan',
            expiry: '2025-12-31',
            balance: 0,
            time: '06:30 PM',
            status: 'Allowed',
            photo: `https://i.pravatar.cc/150?u=${c.id}`
        }));

        res.json({
            checkinsToday,
            pendingPayments,
            newEnquiries,
            checkins: formattedCheckins.length > 0 ? formattedCheckins : [
                { id: 101, member: 'John (Mock)', plan: 'Gold Annual', expiry: '2025-12-31', balance: 0, time: '06:30 PM', status: 'Allowed', photo: 'https://i.pravatar.cc/150?u=tom' },
                { id: 102, member: 'Alice (Mock)', plan: 'Silver Monthly', expiry: '2025-02-14', balance: 0, time: '06:35 PM', status: 'Allowed', photo: 'https://i.pravatar.cc/150?u=brad' }
            ]
        });
    } catch (error) {
        console.error('Staff Dashboard Error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

exports.getTrainerDashboard = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;

        const totalMembers = await prisma.member.count({
            where: { tenantId, assignedTrainerId: req.user.id }
        });

        const sessionsToday = 4; // Mock value as Session model might be complex
        const pendingPlans = 2; // Mock value

        res.json({
            totalMembers,
            sessionsToday,
            pendingPlans
            // Other fields left to frontend mock data fallback for now as they are complex
        });
    } catch (error) {
        console.error('Trainer Dashboard Error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

exports.getMemberDashboard = async (req, res) => {
    try {
        // Mock fallback but real API structure to satisfy API call
        res.json({
            planName: 'Gold Annual',
            nextClass: 'Yoga @ 6PM',
            attendanceRate: '85%'
        });
    } catch (error) {
        console.error('Member Dashboard Error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
