const prisma = require('../config/prisma');

const getPaymentHistory = async (req, res) => {
    try {
        const invoices = await prisma.invoice.findMany({
            where: { tenantId: req.user.tenantId, status: 'Paid' },
            orderBy: { paidDate: 'desc' }
        });
        const mapped = await Promise.all(invoices.map(async inv => {
            const member = await prisma.member.findUnique({ where: { id: inv.memberId } });
            return {
                id: inv.invoiceNumber,
                member: member?.name || 'Unknown',
                plan: 'N/A',
                amount: inv.amount,
                date: inv.paidDate || inv.dueDate,
                status: inv.status,
                mode: inv.paymentMode
            };
        }));
        res.json(mapped);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const collectPayment = async (req, res) => {
    try {
        const { memberName, amount, paymentMode, plan } = req.body;
        // Mocking an invoice creation for the collected payment. In a real system you need the exact memberId.
        const member = await prisma.member.findFirst({
            where: { name: memberName, tenantId: req.user.tenantId }
        });

        const invoice = await prisma.invoice.create({
            data: {
                tenantId: req.user.tenantId,
                invoiceNumber: `INV-${Date.now()}`,
                memberId: member ? member.id : 1, // Fallback safely for now
                amount,
                paymentMode: paymentMode || 'Cash',
                status: 'Paid',
                dueDate: new Date(),
                paidDate: new Date()
            }
        });
        res.json(invoice);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const searchMembers = async (req, res) => {
    try {
        const { search } = req.query;
        if (!search) return res.json([]);

        const members = await prisma.member.findMany({
            where: {
                tenantId: req.user.tenantId,
                OR: [
                    { name: { contains: search } },
                    { memberId: { contains: search } },
                    { phone: { contains: search } }
                ]
            },
            take: 10
        });

        res.json(members);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getMembers = async (req, res) => {
    try {
        const members = await prisma.member.findMany({
            where: { tenantId: req.user.tenantId }
        });
        res.json(members);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getMemberById = async (req, res) => {
    try {
        const { id } = req.params;
        const member = await prisma.member.findUnique({
            where: { id: parseInt(id) }
        });
        if (!member) return res.status(404).json({ message: 'Member not found' });
        res.json(member);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getAttendanceReport = async (req, res) => {
    try {
        const result = await prisma.$queryRaw`
            SELECT 
                DATE(checkIn) as date, 
                COUNT(*) as totalCheckIns, 
                COUNT(DISTINCT userId) as uniqueMembers
            FROM attendance 
            WHERE type = 'Member' 
            GROUP BY DATE(checkIn) 
            ORDER BY date DESC 
            LIMIT 7;
        `;
        // Convert BigInt counts from queryRaw to Numbers
        const formatted = result.map(r => ({
            date: r.date.toISOString().split('T')[0],
            totalCheckIns: Number(r.totalCheckIns),
            uniqueMembers: Number(r.uniqueMembers),
            peakHour: 'N/A' // Simple fallback
        }));

        res.json(formatted);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getBookingReport = async (req, res) => {
    try {
        const bookings = await prisma.booking.findMany({
            where: { class: { tenantId: req.user.tenantId } },
            include: { member: true, class: { include: { trainer: true } } }
        });

        const mapped = bookings.map(b => ({
            id: `BK-${b.id}`,
            member: b.member?.name || 'Unknown',
            type: b.class?.name || 'Session',
            trainer: b.class?.trainer?.name || 'N/A',
            time: b.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            status: b.status
        }));

        res.json(mapped);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const checkIn = async (req, res) => {
    try {
        const { memberId } = req.body;
        const member = await prisma.member.findUnique({ where: { id: parseInt(memberId) } });

        if (!member) return res.status(404).json({ message: 'Member not found' });

        const attendance = await prisma.attendance.create({
            data: {
                userId: member.userId || req.user.id, // Fallback safely
                type: 'Member',
                checkIn: new Date(),
            }
        });

        res.json(attendance);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const checkOut = async (req, res) => {
    try {
        const { memberId } = req.body;
        const member = await prisma.member.findUnique({ where: { id: parseInt(memberId) } });
        if (!member) return res.status(404).json({ message: 'Member not found' });

        const activeAttendance = await prisma.attendance.findFirst({
            where: { userId: member.userId, checkOut: null },
            orderBy: { checkIn: 'desc' }
        });

        if (activeAttendance) {
            await prisma.attendance.update({
                where: { id: activeAttendance.id },
                data: { checkOut: new Date() }
            });
        }
        res.json({ message: 'Checked out successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getTodaysCheckIns = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const checkIns = await prisma.attendance.findMany({
            where: {
                user: { tenantId: req.user.tenantId },
                checkIn: { gte: today, lt: tomorrow },
                type: 'Member'
            },
            include: { user: { include: { member: true } } },
            orderBy: { checkIn: 'desc' }
        });

        // Format for frontend
        const formatted = checkIns.map(c => {
            const m = c.user?.member?.[0] || {};
            return {
                id: c.id,
                name: c.user?.name || m.name || 'Unknown',
                in: new Date(c.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                out: c.checkOut ? new Date(c.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-',
                status: c.checkOut ? 'Checked-Out' : 'Inside',
                memberId: m.id,
                memId: m.memberId || 'Unknown'
            };
        });

        const currentlyInsideCount = formatted.filter(f => f.status === 'Inside').length;
        const checkedOutCount = formatted.length - currentlyInsideCount;

        res.json({
            history: formatted,
            stats: { total: formatted.length, inside: currentlyInsideCount, checkedOut: checkedOutCount }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getTasks = async (req, res) => {
    try {
        const { myTasks, status, search } = req.query;
        let where = {};

        if (myTasks === 'true') {
            where.assignedToId = req.user.id;
        } else {
            where.assignedTo = { tenantId: req.user.tenantId };
        }

        if (status && status !== 'All') where.status = status;
        if (search) where.title = { contains: search };

        const tasks = await prisma.task.findMany({
            where,
            include: { assignedTo: { select: { name: true } }, creator: { select: { name: true } } },
            orderBy: { dueDate: 'asc' }
        });

        res.json(tasks.map(t => ({
            id: t.id,
            title: t.title,
            assignedBy: t.creator?.name || 'Admin',
            priority: t.priority,
            due: t.dueDate,
            status: t.status,
            updated: 'Recently'
        })));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateTaskStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const task = await prisma.task.update({
            where: { id: parseInt(id) },
            data: { status }
        });
        res.json(task);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getLockers = async (req, res) => {
    try {
        const lockers = await prisma.locker.findMany({
            where: { tenantId: req.user.tenantId }
        });
        res.json(lockers);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const assignLocker = async (req, res) => {
    try {
        const { id } = req.params;
        const { memberId, memberName } = req.body;

        const updated = await prisma.locker.update({
            where: { id: parseInt(id) },
            data: { status: 'Occupied', assignedToId: parseInt(memberId) }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const releaseLocker = async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await prisma.locker.update({
            where: { id: parseInt(id) },
            data: { status: 'Available', assignedToId: null }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const addLocker = async (req, res) => {
    try {
        const { number } = req.body;
        const newLocker = await prisma.locker.create({
            data: {
                number,
                status: 'Available',
                tenantId: req.user.tenantId
            }
        });
        res.json(newLocker);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    searchMembers,
    checkIn,
    checkOut,
    getTasks,
    updateTaskStatus,
    getLockers,
    assignLocker,
    releaseLocker,
    addLocker,
    getPaymentHistory,
    collectPayment,
    getMembers,
    getMemberById,
    getAttendanceReport,
    getBookingReport,
    getTodaysCheckIns
};
