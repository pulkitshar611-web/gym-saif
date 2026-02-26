const prisma = require('../config/prisma');
const bcrypt = require('bcryptjs');

const getPaymentHistory = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const where = role === 'SUPER_ADMIN' ? { status: 'Paid' } : { tenantId, status: 'Paid' };
        const invoices = await prisma.invoice.findMany({
            where,
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
        const { tenantId, role } = req.user;

        if (!tenantId && role !== 'SUPER_ADMIN') {
            return res.status(400).json({ message: 'Tenant ID required' });
        }

        // Mocking an invoice creation for the collected payment. In a real system you need the exact memberId.
        const memberWhere = role === 'SUPER_ADMIN' ? { name: memberName } : { name: memberName, tenantId };
        const member = await prisma.member.findFirst({
            where: memberWhere
        });

        const invoice = await prisma.invoice.create({
            data: {
                tenantId: tenantId || member?.tenantId || 1,
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
        const { tenantId, role } = req.user;

        const where = {
            OR: [
                { name: { contains: search } },
                { memberId: { contains: search } },
                { phone: { contains: search } }
            ]
        };

        if (role !== 'SUPER_ADMIN') {
            where.tenantId = tenantId;
        }

        // 1. Find Members
        const members = await prisma.member.findMany({
            where,
            take: 10
        });

        // 2. Find Users (Staff, Trainers, Managers)
        const userWhere = {
            OR: [
                { name: { contains: search } },
                { email: { contains: search } },
                { phone: { contains: search } }
            ],
            role: { in: ['STAFF', 'TRAINER', 'MANAGER', 'BRANCH_ADMIN'] },
            status: 'Active'
        };

        if (role !== 'SUPER_ADMIN') {
            userWhere.tenantId = tenantId;
        }

        const users = await prisma.user.findMany({
            where: userWhere,
            take: 5
        });

        // 3. Merge Results
        const combined = [
            ...members.map(m => ({ ...m, type: 'Member' })),
            ...users.map(u => ({
                id: u.id,
                userId: u.id,
                name: u.name,
                phone: u.phone,
                status: u.status,
                type: 'Staff', // UI label
                actualRole: u.role,
                isStaffUser: true // Flag for checkIn controller
            }))
        ];

        res.json(combined);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getMembers = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const where = role === 'SUPER_ADMIN' ? {} : { tenantId };
        const members = await prisma.member.findMany({
            where
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
        const { tenantId, role } = req.user;
        const where = role === 'SUPER_ADMIN' ? {} : { class: { tenantId } };
        const bookings = await prisma.booking.findMany({
            where,
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
        const { memberId, isStaffUser } = req.body;
        let targetUserId;
        let tenantId = req.user.tenantId;
        let checkInType = 'Member';
        let name = '';

        if (isStaffUser) {
            const user = await prisma.user.findUnique({ where: { id: parseInt(memberId) } });
            if (!user) return res.status(404).json({ message: 'User not found' });
            targetUserId = user.id;
            tenantId = user.tenantId;
            checkInType = user.role === 'TRAINER' ? 'Trainer' : 'Staff';
            name = user.name;
        } else {
            const member = await prisma.member.findUnique({ where: { id: parseInt(memberId) } });
            if (!member) return res.status(404).json({ message: 'Member not found' });
            name = member.name;
            targetUserId = member.userId;
            tenantId = member.tenantId;

            if (!targetUserId) {
                const hashedPassword = await bcrypt.hash('123456', 10);
                const userEmail = member.email || `member${member.id}@system.com`;
                const newUser = await prisma.user.create({
                    data: {
                        name: member.name || 'Unknown Member',
                        email: userEmail,
                        password: hashedPassword,
                        role: 'MEMBER',
                        tenantId: member.tenantId,
                        phone: member.phone || ''
                    }
                });
                targetUserId = newUser.id;
                await prisma.member.update({
                    where: { id: member.id },
                    data: { userId: targetUserId }
                });
            }
        }

        const attendance = await prisma.attendance.create({
            data: {
                userId: targetUserId,
                tenantId: tenantId || req.user.tenantId,
                type: checkInType,
                checkIn: new Date(),
                date: new Date()
            }
        });

        res.json({ ...attendance, name });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const checkOut = async (req, res) => {
    try {
        const { memberId, isStaffUser } = req.body;
        let targetUserId;

        if (isStaffUser) {
            targetUserId = parseInt(memberId);
        } else {
            const member = await prisma.member.findUnique({ where: { id: parseInt(memberId) } });
            if (!member) return res.status(404).json({ message: 'Member not found' });
            targetUserId = member.userId;
        }

        if (!targetUserId) return res.status(400).json({ message: 'No active session found' });

        const activeAttendance = await prisma.attendance.findFirst({
            where: { userId: targetUserId, checkOut: null },
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

        const where = {
            checkIn: { gte: today, lt: tomorrow }
        };

        if (req.user.role !== 'SUPER_ADMIN') {
            where.tenantId = req.user.tenantId;
        }

        const checkIns = await prisma.attendance.findMany({
            where,
            include: { user: true },
            orderBy: { checkIn: 'desc' }
        });

        // Format for frontend and manually attach member details
        const formatted = await Promise.all(checkIns.map(async c => {
            // Find the member record linked to this user
            const member = await prisma.member.findUnique({
                where: { userId: c.userId }
            });

            const isStaff = c.type === 'Staff' || c.type === 'Trainer';

            return {
                id: c.id,
                name: member?.name || c.user?.name || 'Unknown',
                in: new Date(c.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                out: c.checkOut ? new Date(c.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-',
                status: c.checkOut ? 'Checked-Out' : 'Inside',
                memberId: isStaff ? c.userId : member?.id,
                memId: isStaff ? `STAFF-${c.userId}` : (member?.memberId || 'ADMIN-ID'),
                isStaffUser: isStaff
            };
        }));

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
        } else if (req.user.role !== 'SUPER_ADMIN') {
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
        const where = {};
        if (req.user.role !== 'SUPER_ADMIN') {
            where.tenantId = req.user.tenantId;
        }

        const lockersRaw = await prisma.locker.findMany({
            where: where
        });

        const memIds = lockersRaw.filter(l => l.assignedToId).map(l => l.assignedToId);
        let membersMap = {};
        if (memIds.length > 0) {
            const members = await prisma.member.findMany({
                where: { id: { in: memIds } },
                select: { id: true, name: true, memberId: true }
            });
            members.forEach(m => {
                membersMap[m.id] = m;
            });
        }

        const lockers = lockersRaw.map(l => ({
            ...l,
            assigneeName: l.assignedToId && membersMap[l.assignedToId] ? membersMap[l.assignedToId].name : null,
            assigneeMemberId: l.assignedToId && membersMap[l.assignedToId] ? membersMap[l.assignedToId].memberId : null,
        }));

        res.json(lockers);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const assignLocker = async (req, res) => {
    try {
        const { id } = req.params;
        const { memberId, memberName, expiryDate, notes } = req.body;

        const updated = await prisma.locker.update({
            where: { id: parseInt(id) },
            data: {
                status: 'Occupied',
                assignedToId: parseInt(memberId),
                expiryDate: expiryDate ? new Date(expiryDate) : null,
                notes: notes || null
            }
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
            data: {
                status: 'Available',
                assignedToId: null,
                expiryDate: null,
                notes: null
            }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const addLocker = async (req, res) => {
    try {
        const { number, tenantId } = req.body;
        const newLocker = await prisma.locker.create({
            data: {
                number,
                status: 'Available',
                tenantId: req.user.role === 'SUPER_ADMIN' ? (parseInt(tenantId) || null) : req.user.tenantId
            }
        });
        res.json(newLocker);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getEarnings = async (req, res) => {
    try {
        const staffId = req.user.id;
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

        const payrollHistory = await prisma.payroll.findMany({
            where: { staffId },
            orderBy: [{ year: 'desc' }, { month: 'desc' }]
        });

        const history = payrollHistory.map(record => ({
            id: record.id,
            year: record.year.toString(),
            month: `${monthNames[record.month - 1]} ${record.year}`,
            baseSalary: Number(record.amount) - Number(record.incentives || 0) + Number(record.deductions || 0),
            incentives: Number(record.incentives || 0),
            deductions: Number(record.deductions || 0),
            total: Number(record.amount),
            status: record.status
        }));

        res.json(history);
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
    getTodaysCheckIns,
    getEarnings
};
