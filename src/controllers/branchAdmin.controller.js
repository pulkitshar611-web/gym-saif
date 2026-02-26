const prisma = require('../config/prisma');

// Get Dashboard Stats
const getDashboardStats = async (req, res) => {
    try {
        const { tenantId, role } = req.user;

        if (!tenantId && role !== 'SUPER_ADMIN') {
            return res.status(400).json({ message: 'Tenant ID not found for user' });
        }

        const whereClause = role === 'SUPER_ADMIN' ? {} : { tenantId };

        // 1. Total Members
        const totalMembers = await prisma.member.count({
            where: whereClause
        });

        // 2. Active Trainers
        const activeTrainers = await prisma.user.count({
            where: {
                ...whereClause,
                role: 'TRAINER',
                status: 'Active'
            }
        });

        // 3. Today's Check-ins
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const todaysCheckIns = await prisma.attendance.count({
            where: {
                user: role === 'SUPER_ADMIN' ? {} : { tenantId },
                checkIn: { gte: startOfDay }
            }
        });

        // 4. Monthly Revenue (Current Month)
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const revenue = await prisma.invoice.aggregate({
            where: {
                ...whereClause,
                status: 'Paid',
                paidDate: { gte: startOfMonth }
            },
            _sum: { amount: true }
        });

        // 5. Equipment Data
        const equipmentData = await prisma.equipment.findMany({
            where: whereClause,
            select: { id: true, name: true, status: true, category: true }
        });

        // 6. Security Risks
        const defaulterCheckIns = await prisma.attendance.count({
            where: {
                user: {
                    ...(role === 'SUPER_ADMIN' ? {} : { tenantId }),
                    status: 'Inactive'
                },
                checkIn: { gte: startOfDay }
            }
        });

        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);

        const expiringSoonCount = await prisma.member.count({
            where: {
                ...whereClause,
                status: 'Active',
                expiryDate: {
                    gte: startOfDay,
                    lte: nextWeek
                }
            }
        });

        res.json({
            stats: [
                { id: 1, title: 'Branch Members', value: totalMembers, icon: 'Users', trend: 'Live', color: 'primary' },
                { id: 2, title: 'Active Trainers', value: activeTrainers, icon: 'Users', trend: 'Current', color: 'success' },
                { id: 3, title: 'Today Check-ins', value: todaysCheckIns, icon: 'CheckCircle', trend: 'Today', color: 'primary' },
                { id: 4, title: 'Branch Revenue', value: `₹${revenue._sum.amount || 0}`, icon: 'DollarSign', trend: 'This Month', color: 'success' },
            ],
            equipment: equipmentData,
            risks: {
                defaulters: defaulterCheckIns,
                expiringSoon: expiringSoonCount,
                manualOverrides: 0
            }
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

// Get Revenue Report
const getRevenueReport = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const { date } = req.query; // format 'YYYY-MM-DD'

        if (!tenantId) {
            return res.status(400).json({ message: 'Tenant ID not found for user' });
        }

        const startOfMonth = date ? new Date(date) : new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const endOfMonth = new Date(startOfMonth);
        endOfMonth.setMonth(endOfMonth.getMonth() + 1);

        // 1. Total Revenue (Paid in current month)
        const totalRevenue = await prisma.invoice.aggregate({
            where: {
                tenantId,
                status: 'Paid',
                paidDate: { gte: startOfMonth, lt: endOfMonth }
            },
            _sum: { amount: true }
        });

        // 2. Pending Payments (Unpaid or Partial due in current month)
        const pendingPayments = await prisma.invoice.aggregate({
            where: {
                tenantId,
                status: { in: ['Unpaid', 'Partial'] },
                dueDate: { gte: startOfMonth, lt: endOfMonth }
            },
            _sum: { amount: true }
        });

        // 3. Transactions (Table Data) — all tenant invoices
        const transactions = await prisma.invoice.findMany({
            where: { tenantId },
            include: { member: { select: { name: true } } },
            orderBy: { dueDate: 'desc' },
            take: 100
        });

        // Mock Target (or fetch from settings if exists)
        const monthlyTarget = 500000;

        res.json({
            stats: [
                { label: 'Total Revenue', value: (totalRevenue._sum.amount || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }), icon: 'DollarSign', bg: 'bg-indigo-50', color: 'text-indigo-600' },
                { label: 'Monthly Target', value: (monthlyTarget).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }), icon: 'TrendingUp', bg: 'bg-emerald-50', color: 'text-emerald-600' },
                { label: 'Pending Payments', value: (pendingPayments._sum.amount || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }), icon: 'Banknote', bg: 'bg-amber-50', color: 'text-amber-600' },
            ],
            revenueData: transactions.map(inv => ({
                id: inv.id,
                date: inv.paidDate ? new Date(inv.paidDate).toISOString().split('T')[0] : (inv.dueDate ? new Date(inv.dueDate).toISOString().split('T')[0] : 'N/A'),
                member: inv.member?.name || 'Unknown',
                service: 'Membership Fee',
                amount: (inv.amount || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }),
                mode: inv.paymentMode || 'N/A',
                status: inv.status
            }))
        });

    } catch (error) {
        console.error('Revenue Report Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// Get Membership Report
const getMembershipReport = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const { date } = req.query; // format 'YYYY-MM-DD'

        if (!tenantId) {
            return res.status(400).json({ message: 'Tenant ID not found for user' });
        }

        const startOfMonth = date ? new Date(date) : new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const endOfMonth = new Date(startOfMonth);
        endOfMonth.setMonth(endOfMonth.getMonth() + 1);

        // 1. Active Members Total
        const activeMembersCount = await prisma.member.count({
            where: {
                tenantId,
                status: 'Active'
            }
        });

        // 2. New Joins (MTD)
        const newJoinsCount = await prisma.member.count({
            where: {
                tenantId,
                joinDate: { gte: startOfMonth, lt: endOfMonth }
            }
        });

        // 3. Expired (MTD)
        const expiredCount = await prisma.member.count({
            where: {
                tenantId,
                status: 'Expired',
                expiryDate: { gte: startOfMonth, lt: endOfMonth }
            }
        });

        // 4. Member List (Table Data) — all members, not just this month
        const members = await prisma.member.findMany({
            where: { tenantId },
            include: { plan: { select: { name: true } } },
            orderBy: { joinDate: 'desc' },
            take: 100
        });

        res.json({
            stats: [
                { label: 'Active Members', value: activeMembersCount.toLocaleString(), icon: 'UserCheck', bg: 'bg-emerald-50', color: 'text-emerald-600' },
                { label: 'New Joins (MTD)', value: newJoinsCount.toLocaleString(), icon: 'UserPlus', bg: 'bg-blue-50', color: 'text-blue-600' },
                { label: 'Expired (MTD)', value: expiredCount.toLocaleString(), icon: 'UserMinus', bg: 'bg-rose-50', color: 'text-rose-600' },
            ],
            membershipData: members.map(m => ({
                id: m.id,
                name: m.name || 'Unknown',
                plan: m.plan?.name || 'No Plan',
                startDate: m.joinDate ? m.joinDate.toISOString().split('T')[0] : 'N/A',
                endDate: m.expiryDate ? m.expiryDate.toISOString().split('T')[0] : 'N/A',
                status: m.status
            }))
        });

    } catch (error) {
        console.error('Membership Report Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// Get Lead Conversion Report
const getLeadConversionReport = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const { date } = req.query;

        if (!tenantId) {
            return res.status(400).json({ message: 'Tenant ID not found for user' });
        }

        const startOfMonth = date ? new Date(date) : new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const endOfMonth = new Date(startOfMonth);
        endOfMonth.setMonth(endOfMonth.getMonth() + 1);

        // Stats: based on selected month
        const totalLeads = await prisma.lead.count({
            where: { tenantId, createdAt: { gte: startOfMonth, lt: endOfMonth } }
        });
        const convertedLeads = await prisma.lead.count({
            where: { tenantId, status: 'Converted', updatedAt: { gte: startOfMonth, lt: endOfMonth } }
        });
        const conversionRate = totalLeads > 0 ? ((convertedLeads / totalLeads) * 100).toFixed(1) : 0;

        // Table: show all leads for the tenant (most recent first)
        const leads = await prisma.lead.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
            take: 100
        });

        res.json({
            stats: [
                { label: 'Total Leads (MTD)', value: totalLeads.toLocaleString(), icon: 'MousePointer2', bg: 'bg-orange-50', color: 'text-orange-600' },
                { label: 'Converted (MTD)', value: convertedLeads.toLocaleString(), icon: 'Target', bg: 'bg-purple-50', color: 'text-purple-600' },
                { label: 'Conversion Rate', value: `${conversionRate}%`, icon: 'Percent', bg: 'bg-blue-50', color: 'text-blue-600' },
            ],
            leadData: leads.map(l => ({
                id: l.id,
                name: l.name || 'Anonymous',
                source: l.source || 'Direct',
                date: l.createdAt.toISOString().split('T')[0],
                status: l.status,
                notes: l.notes || 'No notes available'
            }))
        });

    } catch (error) {
        console.error('Lead Conversion Report Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// Get Expense Report
const getExpenseReport = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const { date } = req.query; // format 'YYYY-MM-DD'

        if (!tenantId) {
            return res.status(400).json({ message: 'Tenant ID not found for user' });
        }

        const startOfMonth = date ? new Date(date) : new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const endOfMonth = new Date(startOfMonth);
        endOfMonth.setMonth(endOfMonth.getMonth() + 1);

        // 1. Total Expenses
        const totalExpenses = await prisma.expense.aggregate({
            where: {
                tenantId,
                date: { gte: startOfMonth, lt: endOfMonth }
            },
            _sum: { amount: true }
        });

        // 2. Operational Costs (Everything except Inventory category)
        const operationalCosts = await prisma.expense.aggregate({
            where: {
                tenantId,
                date: { gte: startOfMonth, lt: endOfMonth },
                category: { not: 'Inventory' }
            },
            _sum: { amount: true }
        });

        // 3. Supplies/Inventory
        const inventoryCosts = await prisma.expense.aggregate({
            where: {
                tenantId,
                date: { gte: startOfMonth, lt: endOfMonth },
                category: 'Inventory'
            },
            _sum: { amount: true }
        });

        // 4. Expense List — all tenant expenses
        const expenses = await prisma.expense.findMany({
            where: { tenantId },
            orderBy: { date: 'desc' },
            take: 100
        });

        res.json({
            stats: [
                { label: 'Total Expenses', value: (totalExpenses._sum.amount || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }), icon: 'CreditCard', bg: 'bg-rose-50', color: 'text-rose-600' },
                { label: 'Operational Costs', value: (operationalCosts._sum.amount || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }), icon: 'Zap', bg: 'bg-blue-50', color: 'text-blue-600' },
                { label: 'Supplies/Inventory', value: (inventoryCosts._sum.amount || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }), icon: 'ShoppingBag', bg: 'bg-amber-50', color: 'text-amber-600' },
            ],
            expenseData: expenses.map(e => ({
                id: e.id,
                date: e.date.toISOString().split('T')[0],
                category: e.category,
                description: e.title,
                amount: (e.amount || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }),
                status: e.status
            }))
        });

    } catch (error) {
        console.error('Expense Report Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// Get Branch Performance Report
const getPerformanceReport = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;

        if (!tenantId) {
            return res.status(400).json({ message: 'Tenant ID not found for user' });
        }

        const { date: reqDate } = req.query;
        // We'll calculate performance for the last 4 months
        const performanceData = [];
        for (let i = 0; i < 4; i++) {
            const date = reqDate ? new Date(reqDate) : new Date();
            date.setMonth(date.getMonth() - i);
            date.setDate(1);
            date.setHours(0, 0, 0, 0);

            const startOfMonth = new Date(date);
            const endOfMonth = new Date(date);
            endOfMonth.setMonth(endOfMonth.getMonth() + 1);

            const revenue = await prisma.invoice.aggregate({
                where: { tenantId, status: 'Paid', paidDate: { gte: startOfMonth, lt: endOfMonth } },
                _sum: { amount: true }
            });

            const expense = await prisma.expense.aggregate({
                where: { tenantId, date: { gte: startOfMonth, lt: endOfMonth } },
                _sum: { amount: true }
            });

            const revAmount = Number(revenue._sum.amount || 0);
            const expAmount = Number(expense._sum.amount || 0);
            const profitValue = revAmount - expAmount;
            const marginValue = revAmount > 0 ? ((profitValue / revAmount) * 100).toFixed(1) : 0;

            performanceData.push({
                id: i + 1,
                month: date.toLocaleString('default', { month: 'long', year: 'numeric' }),
                revenue: revAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }),
                expense: expAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }),
                profit: profitValue.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }),
                margin: `${marginValue}%`,
                status: marginValue >= 70 ? 'Excellent' : (marginValue >= 50 ? 'Good' : 'Average')
            });
        }

        // Calculate Stats (Current Month vs Previous)
        // For simplicity, we'll return fixed stats for now but based on real data if possible
        const currentMonth = performanceData[0];
        const prevMonth = performanceData[1];

        res.json({
            stats: [
                { label: 'Revenue (vs Exp)', value: currentMonth.margin, icon: 'TrendingUp', bg: 'bg-indigo-50', color: 'text-indigo-600', trend: 'up' },
                { label: 'Lead Conv. Rate', value: '24.8%', icon: 'Target', bg: 'bg-purple-50', color: 'text-purple-600', trend: 'up' },
                { label: 'Member Retention', value: '92.1%', icon: 'Activity', bg: 'bg-emerald-50', color: 'text-emerald-600', trend: 'up' },
            ],
            performanceData
        });

    } catch (error) {
        console.error('Performance Report Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// Get Full Attendance Report
const getAttendanceReport = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const { date, type, search, page = 1, limit = 10 } = req.query;

        let startOfDay;
        if (date) {
            startOfDay = new Date(date + 'T00:00:00.000Z');
        } else {
            const d = new Date();
            startOfDay = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        }
        const endOfDay = new Date(startOfDay);
        endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

        const where = {
            tenantId,
            date: { gte: startOfDay, lt: endOfDay }
        };

        if (type && type !== 'All') {
            where.user = where.user || {};
            if (type === 'Staff') {
                where.user.role = { in: ['STAFF', 'TRAINER', 'MANAGER'] };
            } else if (type === 'Member' || type === 'MEMBER') {
                where.user.role = 'MEMBER';
            } else {
                where.user.role = type.toUpperCase();
            }
        }

        if (search) {
            where.user = where.user || {};
            where.user.name = { contains: search, mode: 'insensitive' };
        }

        const [attendance, total] = await Promise.all([
            prisma.attendance.findMany({
                where,
                include: { user: true },
                orderBy: { date: 'desc' },
                skip: (parseInt(page) - 1) * parseInt(limit),
                take: parseInt(limit)
            }),
            prisma.attendance.count({ where })
        ]);

        // Stats
        const totalToday = await prisma.attendance.count({ where: { tenantId, date: { gte: startOfDay, lt: endOfDay } } });
        const membersToday = await prisma.attendance.count({ where: { tenantId, user: { role: 'MEMBER' }, date: { gte: startOfDay, lt: endOfDay } } });
        const staffToday = await prisma.attendance.count({ where: { tenantId, user: { role: { in: ['STAFF', 'TRAINER', 'MANAGER'] } }, date: { gte: startOfDay, lt: endOfDay } } });

        res.json({
            data: attendance.map(a => ({
                id: a.id,
                name: a.user?.name || 'Unknown',
                type: a.user?.role === 'MEMBER' ? 'Member' : (a.user?.role === 'TRAINER' ? 'Trainer' : 'Staff'),
                checkIn: a.checkIn ? a.checkIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-',
                checkOut: a.checkOut ? a.checkOut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-',
                status: a.checkOut ? 'checked-out' : (a.checkIn ? 'checked-in' : 'absent')
            })),
            total,
            stats: { totalToday, membersToday, staffToday }
        });
    } catch (error) {
        console.error('Attendance Report Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// Get Full Booking Report
const getBookingReport = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const { search, status, dateRange, page = 1, limit = 10 } = req.query;

        // Build AND conditions
        const andConditions = [
            { member: { tenantId } }
        ];

        if (status && status !== 'All') {
            andConditions.push({ status });
        }

        if (search) {
            andConditions.push({
                OR: [
                    { member: { name: { contains: search } } },
                    { class: { name: { contains: search } } }
                ]
            });
        }

        // Date Range logic
        if (dateRange && dateRange !== 'All') {
            const now = new Date();
            if (dateRange === 'Today') {
                const sod = new Date(now); sod.setHours(0, 0, 0, 0);
                const eod = new Date(now); eod.setHours(23, 59, 59, 999);
                andConditions.push({ date: { gte: sod, lte: eod } });
            } else if (dateRange === 'This Week') {
                const weekAgo = new Date(now);
                weekAgo.setDate(now.getDate() - 7);
                andConditions.push({ date: { gte: weekAgo } });
            } else if (dateRange === 'This Month') {
                const som = new Date(now); som.setDate(1); som.setHours(0, 0, 0, 0);
                andConditions.push({ date: { gte: som } });
            }
        }

        const where = { AND: andConditions };

        const [bookings, total] = await Promise.all([
            prisma.booking.findMany({
                where,
                include: { member: true, class: { include: { trainer: true } } },
                orderBy: { date: 'desc' },
                skip: (parseInt(page) - 1) * parseInt(limit),
                take: parseInt(limit)
            }),
            prisma.booking.count({ where })
        ]);

        const stats = {
            total: await prisma.booking.count({ where: { member: { tenantId } } }),
            completed: await prisma.booking.count({ where: { AND: [{ member: { tenantId } }, { status: 'Completed' }] } }),
            cancelled: await prisma.booking.count({ where: { AND: [{ member: { tenantId } }, { status: 'Cancelled' }] } })
        };

        res.json({
            data: bookings.map(b => ({
                id: b.id,
                memberName: b.member?.name || 'Unknown',
                classType: b.class?.name || 'Private Session',
                trainerName: b.class?.trainer?.name || 'Any Trainer',
                time: b.date ? b.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-',
                date: b.date ? b.date.toISOString().split('T')[0] : '-',
                status: b.status || 'Pending'
            })),
            total,
            stats
        });
    } catch (error) {
        console.error('Booking Report Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// Get Live Access Control — today's check-ins with membership/dues status
const getLiveAccess = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);

        const where = role === 'SUPER_ADMIN' ? {} : { user: { tenantId } };

        // Fetch today's attendance records
        const records = await prisma.attendance.findMany({
            where: { ...where, checkIn: { gte: startOfDay, lte: endOfDay } },
            include: { user: { select: { id: true, name: true, role: true, avatar: true } } },
            orderBy: { checkIn: 'desc' },
            take: 50
        });

        // Optimization: Fetch all needed members in one go
        const userIds = records.map(r => r.userId);
        const members = await prisma.member.findMany({
            where: { userId: { in: userIds }, user: { tenantId } },
            include: { plan: true }
        });

        const checkins = await Promise.all(records.map(async (r) => {
            const memberData = members.find(m => m.userId === r.userId);

            // Get outstanding dues
            let duesAmount = 0;
            if (memberData) {
                const dues = await prisma.invoice.aggregate({
                    where: { memberId: memberData.id, status: { in: ['Unpaid', 'Partial'] } },
                    _sum: { amount: true }
                });
                duesAmount = parseFloat(dues._sum.amount || 0);
            }

            return {
                id: r.id,
                member: r.user?.name || 'Unknown',
                name: r.user?.name || 'Unknown',
                type: r.type,
                plan: memberData?.plan?.name || (r.type === 'Member' ? 'Standard' : r.type),
                time: r.checkIn ? new Date(r.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-',
                expiry: memberData?.expiryDate ? memberData.expiryDate.toISOString().split('T')[0] : null,
                balance: duesAmount,
                photo: r.user?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(r.user?.name || 'U')}&background=6d28d9&color=fff&size=48`,
                status: r.checkOut ? 'Checked Out' : 'checked-in'
            };
        }));

        res.json(checkins);
    } catch (error) {
        console.error('Live Access Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// Get Renewal Alerts — expiring soon + recently expired members
const getRenewalAlerts = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const in7Days = new Date(today);
        in7Days.setDate(today.getDate() + 7);

        const minus15Days = new Date(today);
        minus15Days.setDate(today.getDate() - 15);

        // Expiring within 7 days (not yet expired)
        const expiringSoon = await prisma.member.findMany({
            where: {
                tenantId,
                status: 'Active',
                expiryDate: { gte: today, lte: in7Days }
            },
            include: { plan: { select: { name: true } } },
            orderBy: { expiryDate: 'asc' },
            take: 5
        });

        // Expired in last 15 days
        const recentlyExpired = await prisma.member.findMany({
            where: {
                tenantId,
                expiryDate: { gte: minus15Days, lt: today }
            },
            include: { plan: { select: { name: true } } },
            orderBy: { expiryDate: 'desc' },
            take: 5
        });

        res.json({
            expiringSoon: expiringSoon.map(m => ({
                id: m.id,
                memberName: m.name,
                planName: m.plan?.name || 'No Plan',
                endDate: m.expiryDate ? m.expiryDate.toISOString().split('T')[0] : null,
                phone: m.phone || null
            })),
            recentlyExpired: recentlyExpired.map(m => ({
                id: m.id,
                memberName: m.name,
                planName: m.plan?.name || 'No Plan',
                endDate: m.expiryDate ? m.expiryDate.toISOString().split('T')[0] : null,
                phone: m.phone || null
            }))
        });
    } catch (error) {
        console.error('Renewal Alerts Error:', error);
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getDashboardStats,
    getRecentActivities,
    getTrainerAvailability,
    getFinancialStats,
    getRevenueReport,
    getMembershipReport,
    getLeadConversionReport,
    getExpenseReport,
    getPerformanceReport,
    getAttendanceReport,
    getBookingReport,
    getLiveAccess,
    getRenewalAlerts
};
