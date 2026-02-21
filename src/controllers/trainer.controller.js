// gym_backend/src/controllers/trainer.controller.js
const prisma = require('../config/prisma');

const getProfile = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { id: true, name: true, email: true, phone: true, role: true, avatar: true, joinedDate: true, status: true, address: true }
        });
        res.json({ ...user, id: `TRN-${user.id}` }); // Mapping to frontend format slightly
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateProfile = async (req, res) => {
    try {
        const { phone, address } = req.body;
        const user = await prisma.user.update({
            where: { id: req.user.id },
            data: { phone, address },
            select: { id: true, name: true, email: true, phone: true, role: true, avatar: true, joinedDate: true, status: true, address: true }
        });
        res.json({ ...user, id: `TRN-${user.id}` });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getAssignedMembers = async (req, res) => {
    try {
        const members = await prisma.member.findMany({
            where: { trainerId: req.user.id, tenantId: req.user.tenantId },
            include: { plan: true, bookings: true, progress: { orderBy: { date: 'desc' }, take: 1 } }
        });

        // The frontend expects specific data maps (attendance, sessionsDone). 
        // We will send standard db models and let the front-end format or map them here.
        const mapped = members.map(m => ({
            id: m.id,
            memberId: m.memberId,
            name: m.name,
            plan: m.plan?.name || 'N/A',
            status: m.status,
            attendance: 'N/A', // Real impl requires attendance joins
            lastSession: 'N/A', // Setup based on bookings later
            joined: m.joinDate,
            expiry: m.expiryDate,
            email: m.email,
            phone: m.phone,
            goal: m.fitnessGoal || 'General Fitness',
            isFlagged: false, // Feature config
            recentWorkouts: [
                { date: '2024-05-10', time: '09:00 AM', status: 'Present', type: 'Weights' },
                { date: '2024-05-08', time: '08:30 AM', status: 'Present', type: 'Cardio' }
            ] // Mocked for UI functionality
        }));

        res.json(mapped);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getMemberById = async (req, res) => {
    try {
        const { id } = req.params;
        const member = await prisma.member.findUnique({
            where: { id: parseInt(id) },
            include: { plan: true }
        });
        if (!member || member.trainerId !== req.user.id) {
            return res.status(403).json({ message: 'Unauthorized or not found' });
        }
        res.json(member);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const flagMember = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        // Mock DB implementation since flag is not in schema explicitly yet, just returning success for frontend state
        res.json({ success: true, message: 'Member flagged successfully', reason });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getSessions = async (req, res) => {
    try {
        // Find classes and bookings taught by this trainer
        const classes = await prisma.class.findMany({
            where: { trainerId: req.user.id, tenantId: req.user.tenantId }
        });

        const mappedSessions = classes.map(c => ({
            id: c.id,
            title: c.name,
            time: typeof c.schedule === 'object' ? Object.values(c.schedule)[0] || 'TBD' : 'TBD',
            date: new Date().toISOString().split('T')[0], // Needs real schedule expansion
            type: 'Group Class',
            location: c.location || 'Studio',
            members: 0, // Need to count active bookings
            maxMembers: c.maxCapacity,
            status: c.status
        }));

        res.json(mappedSessions);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateSessionStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const updated = await prisma.class.update({
            where: { id: parseInt(id) },
            data: { status }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getTasks = async (req, res) => {
    try {
        const tasks = await prisma.task.findMany({
            where: { assignedToId: req.user.id },
            include: { creator: true },
            orderBy: { dueDate: 'asc' }
        });

        const mapped = tasks.map(t => ({
            id: t.id,
            title: t.title,
            assignedBy: t.creator?.name || 'Admin',
            priority: t.priority,
            due: t.dueDate,
            status: t.status
        }));
        res.json(mapped);
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

const saveAttendance = async (req, res) => {
    try {
        const { id } = req.params; // Session ID
        const attendanceData = req.body;
        // Mock save for now since complex session attendance schemas are custom
        res.json({ success: true, message: 'Attendance saved' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getSessionHistory = async (req, res) => {
    try {
        // Returning empty array for history until DB structure handles historic group sessions cleanly
        res.json([]);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getMemberPayments = async (req, res) => {
    try {
        const { id } = req.params; // Member ID
        const invoices = await prisma.invoice.findMany({
            where: { memberId: parseInt(id) },
            orderBy: { paidDate: 'desc' }
        });
        const mapped = invoices.map(i => ({
            id: i.id,
            date: i.paidDate || i.dueDate,
            amount: i.amount,
            status: i.status === 'Paid' ? 'Paid' : 'Pending',
            method: i.paymentMode
        }));
        res.json(mapped);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getEarnings = async (req, res) => {
    try {
        const earningsData = {
            summary: {
                baseSalary: 45000,
                commissionRate: 15,
                currentMonthCommission: 12500,
                currentMonthTotal: 57500,
                currency: '₹'
            },
            history: [
                {
                    id: 1,
                    month: 'May 2024',
                    baseSalary: 45000,
                    commission: 12500,
                    bonus: 2000,
                    total: 59500,
                    status: 'Pending',
                    details: [
                        { id: 101, member: 'Rahul Sharma', type: 'Personal Training', amount: 4500, date: 'May 12, 2024' },
                        { id: 102, member: 'Priya Singh', type: 'Diet Plan', amount: 1500, date: 'May 15, 2024' },
                    ]
                },
                {
                    id: 2,
                    month: 'April 2024',
                    baseSalary: 45000,
                    commission: 9800,
                    bonus: 0,
                    total: 54800,
                    status: 'Paid',
                    details: []
                }
            ]
        };
        res.json(earningsData);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getAttendance = async (req, res) => {
    try {
        const attendanceData = {
            summary: {
                todayCheckIn: '06:00 AM',
                todayCheckOut: '02:00 PM',
                totalHoursToday: '8.0h',
                daysPresentMonth: 12,
                totalWorkDays: 22
            },
            logs: [
                { id: 1, date: 'May 13, 2024', checkIn: '06:02 AM', checkOut: '02:05 PM', hours: '8.0h', status: 'Present' },
                { id: 2, date: 'May 12, 2024', checkIn: '06:15 AM', checkOut: '02:10 PM', hours: '7.9h', status: 'Late' }
            ],
            leaveRequests: [
                { id: 1, type: 'Vacation', start: 'Mar 10, 2026', end: 'Mar 12, 2026', status: 'Pending', reason: 'Family vacation' }
            ]
        };
        res.json(attendanceData);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const checkInTrainer = async (req, res) => {
    try {
        res.json({ success: true, message: 'Check-in/out successful' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const requestLeave = async (req, res) => {
    try {
        res.json({ success: true, message: 'Leave request submitted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getAvailability = async (req, res) => {
    try {
        const availabilityData = {
            weekly: [
                { day: 'Monday', slots: [{ start: '09:00 AM', end: '12:00 PM' }, { start: '04:00 PM', end: '07:00 PM' }] },
                { day: 'Tuesday', slots: [{ start: '10:00 AM', end: '01:00 PM' }] },
                { day: 'Wednesday', slots: [{ start: '09:00 AM', end: '12:00 PM' }] },
                { day: 'Thursday', slots: [{ start: '02:00 PM', end: '06:00 PM' }] },
                { day: 'Friday', slots: [{ start: '09:00 AM', end: '12:00 PM' }] },
                { day: 'Saturday', slots: [] },
                { day: 'Sunday', slots: [] },
            ],
            timeOff: [
                { id: 1, start: '2026-03-10', end: '2026-03-12', reason: 'Vacation' }
            ],
            preferences: {
                instantBooking: true,
                requireApproval: false,
                autoAcceptReturning: true
            }
        };
        res.json(availabilityData);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateAvailability = async (req, res) => {
    try {
        // Mock successful save
        res.json({ success: true, message: 'Availability preferences updated' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getProfile,
    updateProfile,
    getAssignedMembers,
    getMemberById,
    flagMember,
    getSessions,
    updateSessionStatus,
    getTasks,
    updateTaskStatus,
    saveAttendance,
    getSessionHistory,
    getMemberPayments,
    getEarnings,
    getAttendance,
    checkInTrainer,
    requestLeave,
    getAvailability,
    updateAvailability
};
