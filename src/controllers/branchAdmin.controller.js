const prisma = require('../config/prisma');

// Get Dashboard Stats
const getDashboardStats = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;

        if (!tenantId) {
            return res.status(400).json({ message: 'Tenant ID not found for user' });
        }

        // 1. Total Members
        const totalMembers = await prisma.member.count({
            where: { tenantId }
        });

        // 2. Active Trainers
        const activeTrainers = await prisma.user.count({
            where: {
                tenantId,
                role: 'TRAINER',
                status: 'Active'
            }
        });

        // 3. Today's Check-ins
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const todaysCheckIns = await prisma.attendance.count({
            where: {
                user: { tenantId },
                checkIn: { gte: startOfDay }
            }
        });

        // 4. Monthly Revenue (Current Month)
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const revenue = await prisma.invoice.aggregate({
            where: {
                tenantId,
                status: 'Paid',
                paidDate: { gte: startOfMonth }
            },
            _sum: { amount: true }
        });

        res.json({
            stats: [
                { id: 1, title: 'Branch Members', value: totalMembers, icon: 'Users', trend: 'Live', color: 'primary' },
                { id: 2, title: 'Active Trainers', value: activeTrainers, icon: 'Users', trend: 'Current', color: 'success' },
                { id: 3, title: 'Today Check-ins', value: todaysCheckIns, icon: 'CheckCircle', trend: 'Today', color: 'primary' },
                { id: 4, title: 'Branch Revenue', value: `₹${revenue._sum.amount || 0}`, icon: 'DollarSign', trend: 'This Month', color: 'success' },
            ]
        });

    } catch (error) {
        console.error('Dashboard Stats Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// Get Recent Member Activity
const getRecentActivities = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;

        // Fetch recent check-ins
        const recentCheckIns = await prisma.attendance.findMany({
            where: { user: { tenantId } },
            take: 5,
            orderBy: { checkIn: 'desc' },
            include: { user: { select: { name: true } } }
        });

        const activities = recentCheckIns.map((checkIn, index) => ({
            id: index + 1,
            member: checkIn.user.name,
            action: 'Check-in',
            time: new Date(checkIn.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }));

        res.json(activities);

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get Trainer Availability
const getTrainerAvailability = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;

        const trainers = await prisma.user.findMany({
            where: { tenantId, role: 'TRAINER' },
            select: { id: true, name: true, status: true }
        });

        const formattedTrainers = trainers.map(t => ({
            id: t.id,
            name: t.name,
            status: t.status === 'Active' ? 'Available' : 'Unavailable',
            specialty: 'General' // Placeholder as specialty isn't in User model yet
        }));

        res.json(formattedTrainers);

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get Financial Stats (Daily Collection)
const getFinancialStats = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        // 1. Fetch Invoices for Today (Paid only)
        const invoices = await prisma.invoice.findMany({
            where: {
                tenantId,
                status: 'Paid',
                paidDate: { gte: startOfDay }
            },
            select: {
                amount: true,
                paymentMode: true
            }
        });

        // 2. Aggregate by Payment Mode
        let cash = 0, upi = 0, card = 0;
        invoices.forEach(inv => {
            const amount = parseFloat(inv.amount);
            if (inv.paymentMode === 'Cash') cash += amount;
            else if (inv.paymentMode === 'UPI') upi += amount;
            else if (inv.paymentMode === 'Card') card += amount;
        });

        // 3. Fetch Expenses for Today
        const expenses = await prisma.expense.aggregate({
            where: {
                tenantId,
                date: { gte: startOfDay }
            },
            _sum: { amount: true }
        });

        const totalExpenses = parseFloat(expenses._sum.amount || 0);

        res.json({
            collection: {
                cash,
                upi,
                card
            },
            expenses: {
                today: totalExpenses
            }
        });

    } catch (error) {
        console.error('Financial Stats Error:', error);
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getDashboardStats,
    getRecentActivities,
    getTrainerAvailability,
    getFinancialStats
};
