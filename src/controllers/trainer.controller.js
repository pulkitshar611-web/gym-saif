const prisma = require('../config/prisma');
const bcrypt = require('bcryptjs');
const cloudinary = require('../utils/cloudinary');

const getProfile = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id }
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({
            id: `TRN-${user.id}`,
            name: user.name,
            email: user.email,
            phone: user.phone || '',
            address: user.address || '',
            role: user.role,
            avatar: user.avatar,
            status: user.status,
            joinedDate: new Date(user.joinedDate).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            })
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateProfile = async (req, res) => {
    try {
        const { name, email, phone, address, avatar } = req.body;

        let avatarUrl = avatar;
        if (avatar && avatar.startsWith('data:image')) {
            const uploadRes = await cloudinary.uploader.upload(avatar, {
                folder: 'gym/trainers/avatars'
            });
            avatarUrl = uploadRes.secure_url;
        }

        const user = await prisma.user.update({
            where: { id: req.user.id },
            data: {
                name,
                email,
                phone,
                address,
                avatar: avatarUrl
            }
        });

        res.json({
            id: `TRN-${user.id}`,
            name: user.name,
            email: user.email,
            phone: user.phone || '',
            address: user.address || '',
            role: user.role,
            avatar: user.avatar,
            status: user.status,
            joinedDate: new Date(user.joinedDate).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            })
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await prisma.user.findUnique({
            where: { id: req.user.id }
        });

        if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
            return res.status(401).json({ message: 'Invalid current password' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: req.user.id },
            data: { password: hashedPassword }
        });

        res.json({ message: 'Password changed successfully' });
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

        const mapped = {
            id: member.id,
            memberId: member.memberId,
            name: member.name,
            plan: member.plan?.name || 'N/A',
            status: member.status,
            attendance: 'N/A',
            sessionsDone: 0,
            totalSessions: 0,
            lastSession: 'N/A',
            joined: member.joinDate,
            expiry: member.expiryDate ? new Date(member.expiryDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) : 'N/A',
            email: member.email,
            phone: member.phone,
            goal: member.fitnessGoal || 'General Fitness',
            isFlagged: false,
            recentWorkouts: [
                { id: 1, name: 'Upper Body Power', date: 'Today', duration: '1h 15m' },
                { id: 2, name: 'Leg Day', date: 'Yesterday', duration: '1h' }
            ]
        };

        res.json(mapped);
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
            where: { trainerId: req.user.id, tenantId: req.user.tenantId },
            include: { bookings: true }
        });

        const localNow = new Date();
        const localTodayStr = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}-${String(localNow.getDate()).padStart(2, '0')}`;

        const mappedSessions = classes.map(c => ({
            id: c.id,
            title: c.name,
            time: c.schedule?.time || 'TBD',
            date: c.schedule?.date || localTodayStr,
            type: c.description || 'Group Class',
            location: c.location || 'Studio',
            members: c.bookings?.length || 0,
            maxMembers: c.maxCapacity,
            duration: c.duration || '60 min',
            status: c.status
        }));

        res.json(mappedSessions);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createSession = async (req, res) => {
    try {
        const { title, date, time, duration, location, maxMembers, type } = req.body;
        const tenantId = req.user.tenantId || 1; // Fallback for dev safety

        // Schedule format: storing date and time
        const schedule = { date, time };

        const newClass = await prisma.class.create({
            data: {
                tenantId: tenantId,
                name: title,
                trainerId: req.user.id,
                schedule,
                duration: duration || '60 min',
                location: location || 'Main Studio',
                maxCapacity: maxMembers ? parseInt(maxMembers) : 20,
                status: 'Scheduled',
                description: type
            }
        });

        res.status(201).json(newClass);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateSession = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, date, time, duration, location, maxMembers, type } = req.body;
        const trainerId = req.user.id;
        const tenantId = req.user.tenantId;

        const session = await prisma.class.findFirst({
            where: { id: parseInt(id), trainerId, tenantId }
        });

        if (!session) {
            return res.status(403).json({ message: 'Unauthorized or session not found' });
        }

        const schedule = { date, time };

        const updated = await prisma.class.update({
            where: { id: parseInt(id) },
            data: {
                name: title,
                schedule,
                duration,
                location,
                maxCapacity: parseInt(maxMembers),
                description: type
            }
        });

        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const deleteSession = async (req, res) => {
    try {
        const { id } = req.params;
        const trainerId = req.user.id;
        const tenantId = req.user.tenantId;

        const session = await prisma.class.findFirst({
            where: { id: parseInt(id), trainerId, tenantId }
        });

        if (!session) {
            return res.status(403).json({ message: 'Unauthorized or session not found' });
        }

        // Delete associated bookings first to maintain integrity
        await prisma.booking.deleteMany({
            where: { classId: parseInt(id) }
        });

        await prisma.class.delete({
            where: { id: parseInt(id) }
        });

        res.json({ success: true, message: 'Session deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getSessionRoster = async (req, res) => {
    try {
        const { id } = req.params;
        const trainerId = req.user.id;
        const tenantId = req.user.tenantId;

        const session = await prisma.class.findFirst({
            where: { id: parseInt(id), trainerId, tenantId },
            include: {
                bookings: {
                    include: {
                        member: {
                            select: {
                                name: true,
                                email: true,
                                phone: true,
                                plan: { select: { name: true } }
                            }
                        }
                    }
                }
            }
        });

        if (!session) {
            return res.status(403).json({ message: 'Unauthorized or session not found' });
        }

        const roster = session.bookings.map(b => ({
            name: b.member?.name || 'Unknown',
            email: b.member?.email || 'N/A',
            phone: b.member?.phone || 'N/A',
            plan: b.member?.plan?.name || 'N/A',
            bookingDate: b.date
        }));

        res.json(roster);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateSessionStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const trainerId = req.user.id;
        const tenantId = req.user.tenantId;

        // Ensure owner
        const session = await prisma.class.findFirst({
            where: { id: parseInt(id), trainerId, tenantId }
        });

        if (!session) {
            return res.status(403).json({ message: 'Unauthorized or session not found' });
        }

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
        const trainerId = req.user.id;
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1; // 1-indexed for DB

        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

        // 1. Fetch real payroll history from DB
        const payrollHistory = await prisma.payroll.findMany({
            where: { staffId: trainerId },
            orderBy: [{ year: 'desc' }, { month: 'desc' }]
        });

        // 2. Format history for frontend
        const history = payrollHistory.map(record => ({
            id: record.id,
            year: record.year.toString(),
            month: `${monthNames[record.month - 1]} ${record.year}`,
            baseSalary: Number(record.amount) - Number(record.incentives || 0) + Number(record.deductions || 0),
            commission: Number(record.incentives || 0),
            bonus: 0,
            incentives: Number(record.incentives || 0),
            deductions: Number(record.deductions || 0),
            total: Number(record.amount),
            status: record.status,
            details: []
        }));

        // 3. Fallback: If no history exists for current month, show base salary from user profile
        const currentMonthData = history.find(h =>
            h.month.startsWith(monthNames[currentMonth - 1]) && h.year === currentYear.toString()
        );

        const salary = req.user.baseSalary ? parseFloat(req.user.baseSalary) : 0;

        const earningsData = {
            summary: {
                baseSalary: currentMonthData ? currentMonthData.baseSalary : salary,
                commissionRate: 0,
                currentMonthCommission: currentMonthData ? currentMonthData.commission : 0,
                currentMonthTotal: currentMonthData ? currentMonthData.total : salary,
                currency: '₹',
                currentMonthName: monthNames[currentMonth - 1]
            },
            history: history
        };

        res.json(earningsData);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getAttendance = async (req, res) => {
    try {
        const { id, tenantId } = req.user;
        const { date: localDate } = req.query; // YYYY-MM-DD from client

        // Normalize target date to UTC Midnight
        let targetDate;
        if (localDate) {
            targetDate = new Date(localDate + "T00:00:00.000Z");
        } else {
            targetDate = new Date();
            targetDate.setUTCHours(0, 0, 0, 0);
        }

        // Fetch logs
        const logs = await prisma.attendance.findMany({
            where: { userId: id, tenantId },
            orderBy: { date: 'desc' },
            take: 100 // Ensure we cover at least 1 month
        });

        // Find today's record correctly using the normalized date
        const todayRecord = await prisma.attendance.findFirst({
            where: {
                userId: id,
                tenantId,
                date: targetDate
            }
        });

        // Leave Requests
        const leaveRequests = await prisma.leaveRequest.findMany({
            where: { userId: id, tenantId },
            orderBy: { createdAt: 'desc' }
        });

        // Helper for unique day counting (Month-specific)
        const currentUTCMonth = localDate ? new Date(localDate).getUTCMonth() : new Date().getUTCMonth();
        const currentUTCYear = localDate ? new Date(localDate).getUTCFullYear() : new Date().getUTCFullYear();

        const uniqueDays = new Set(logs
            .filter(l => {
                const d = new Date(l.date);
                return (l.status === 'Present' || l.status === 'Late') &&
                    d.getUTCMonth() === currentUTCMonth &&
                    d.getUTCFullYear() === currentUTCYear;
            })
            .map(l => new Date(l.date).toISOString().split('T')[0])
        );

        const attendanceData = {
            summary: {
                todayCheckIn: todayRecord?.checkIn || null,
                todayCheckOut: todayRecord?.checkOut || null,
                totalHoursToday: todayRecord?.checkOut ? ((new Date(todayRecord.checkOut) - new Date(todayRecord.checkIn)) / 3600000).toFixed(1) + 'h' : '0.0h',
                daysPresentMonth: uniqueDays.size,
                totalWorkDays: new Date(currentUTCYear, currentUTCMonth + 1, 0).getDate()
            },
            logs: logs.map(l => ({
                id: l.id,
                date: l.date, // Raw date ISO
                checkIn: l.checkIn,
                checkOut: l.checkOut,
                hours: l.checkOut ? ((new Date(l.checkOut) - new Date(l.checkIn)) / 3600000).toFixed(1) + 'h' : '-',
                status: l.status
            })),
            leaveRequests: leaveRequests.map(l => ({
                id: l.id,
                type: l.type,
                start: l.startDate,
                end: l.endDate,
                reason: l.reason,
                status: l.status
            }))
        };
        res.json(attendanceData);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const checkInTrainer = async (req, res) => {
    try {
        const { id, tenantId, role } = req.user;
        const { localDate } = req.body; // Expecting YYYY-MM-DD

        let targetDate;
        if (localDate) {
            targetDate = new Date(localDate + "T00:00:00.000Z");
        } else {
            targetDate = new Date();
            targetDate.setUTCHours(0, 0, 0, 0);
        }

        let record = await prisma.attendance.findFirst({
            where: {
                userId: id,
                tenantId,
                date: targetDate
            }
        });

        if (!record) {
            record = await prisma.attendance.create({
                data: {
                    userId: id,
                    tenantId,
                    type: role,
                    date: targetDate, // Normalized to UTC Midnight
                    checkIn: new Date(),
                    status: 'Present'
                }
            });
            return res.json({ success: true, message: 'Checked in successfully', data: record });
        } else if (!record.checkOut) {
            record = await prisma.attendance.update({
                where: { id: record.id },
                data: { checkOut: new Date() }
            });
            return res.json({ success: true, message: 'Checked out successfully', data: record });
        } else {
            return res.status(400).json({ message: 'You have already completed your attendance for today' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const requestLeave = async (req, res) => {
    try {
        const { type, start, end, reason } = req.body; // frontend sends start, end
        const { id, tenantId } = req.user;

        const leave = await prisma.leaveRequest.create({
            data: {
                userId: id,
                tenantId: tenantId || 1,
                type: type || 'Vacation',
                startDate: new Date(start + "T00:00:00.000Z"),
                endDate: new Date(end + "T00:00:00.000Z"),
                reason: reason || ''
            }
        });
        res.json({ success: true, message: 'Leave request submitted successfully', data: leave });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
};

const getAvailability = async (req, res) => {
    try {
        const { id, tenantId } = req.user;
        let availability = await prisma.trainerAvailability.findUnique({
            where: { trainerId: id }
        });

        if (!availability) {
            availability = await prisma.trainerAvailability.create({
                data: {
                    trainerId: id,
                    tenantId: tenantId || 1,
                    weeklySchedule: [
                        { day: 'Monday', slots: [{ start: '09:00 AM', end: '12:00 PM' }, { start: '04:00 PM', end: '07:00 PM' }] },
                        { day: 'Tuesday', slots: [{ start: '10:00 AM', end: '01:00 PM' }] },
                        { day: 'Wednesday', slots: [{ start: '09:00 AM', end: '12:00 PM' }] },
                        { day: 'Thursday', slots: [{ start: '02:00 PM', end: '06:00 PM' }] },
                        { day: 'Friday', slots: [{ start: '09:00 AM', end: '12:00 PM' }] },
                        { day: 'Saturday', slots: [] },
                        { day: 'Sunday', slots: [] },
                    ],
                    preferences: {
                        instantBooking: true,
                        requireApproval: false,
                        autoAcceptReturning: true
                    }
                }
            });
        }

        const timeOffRequests = await prisma.leaveRequest.findMany({
            where: { userId: id }
        });

        res.json({
            weekly: typeof availability.weeklySchedule === 'string' ? JSON.parse(availability.weeklySchedule) : availability.weeklySchedule,
            timeOff: timeOffRequests.map(l => ({
                id: l.id,
                start: new Date(l.startDate).toISOString().split('T')[0],
                end: new Date(l.endDate).toISOString().split('T')[0],
                reason: l.reason,
                status: l.status
            })),
            preferences: typeof availability.preferences === 'string' ? JSON.parse(availability.preferences) : availability.preferences
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
};

const updateAvailability = async (req, res) => {
    try {
        const { id, tenantId } = req.user;
        const { schedule, preferences, newTimeOff } = req.body;

        if (newTimeOff) {
            await prisma.leaveRequest.create({
                data: {
                    userId: id,
                    tenantId: tenantId || 1,
                    type: 'Vacation',
                    startDate: new Date(newTimeOff.start),
                    endDate: new Date(newTimeOff.end),
                    reason: newTimeOff.reason || '',
                    status: 'Pending'
                }
            });
            return res.json({ success: true, message: 'Time-off requested successfully. Waiting for manager approval.' });
        }

        const updateData = {};
        if (schedule) updateData.weeklySchedule = schedule;
        if (preferences) updateData.preferences = preferences;

        const updated = await prisma.trainerAvailability.upsert({
            where: { trainerId: id },
            update: updateData,
            create: {
                trainerId: id,
                tenantId: tenantId || 1,
                weeklySchedule: schedule || [],
                preferences: preferences || {}
            }
        });

        res.json({ success: true, message: 'Availability preferences updated', data: updated });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
};

const deleteTimeOff = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        await prisma.leaveRequest.deleteMany({
            where: {
                id: parseInt(id),
                userId: userId // ensure they can only delete their own
            }
        });

        res.json({ success: true, message: 'Time off removed successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
};

const getClassesForTrainer = async (req, res) => {
    try {
        const { id, tenantId } = req.user;
        const classes = await prisma.class.findMany({
            where: {
                tenantId: tenantId || 1,
                trainerId: id
            },
            include: {
                trainer: { select: { name: true } },
                bookings: true
            },
            orderBy: { id: 'desc' }
        });

        const formatted = classes.map(c => {
            let scheduleStr = 'Not set';
            const sched = typeof c.schedule === 'string' ? JSON.parse(c.schedule) : c.schedule;

            if (sched && Array.isArray(sched) && sched.length > 0) {
                scheduleStr = sched.map(s => `${s.day || s.date} ${s.startTime || s.time}-${s.endTime || ''}`).join(', ');
            } else if (typeof sched === 'object' && sched !== null) {
                if (sched.date) {
                    const [y, m, d] = sched.date.split('-').map(Number);
                    const dObj = new Date(y, m - 1, d);
                    scheduleStr = `${dObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} @ ${sched.time || 'TBD'}`;
                } else if (sched.days) {
                    scheduleStr = `${Array.isArray(sched.days) ? sched.days.join(', ') : sched.days} @ ${sched.time || 'TBD'}`;
                } else {
                    scheduleStr = JSON.stringify(sched);
                }
            } else if (typeof sched === 'string') {
                scheduleStr = sched;
            }

            return {
                id: c.id,
                name: c.name,
                trainerName: c.trainer?.name || 'Unassigned',
                schedule: scheduleStr,
                duration: c.duration || '60 mins',
                capacity: c.maxCapacity,
                enrolled: c.bookings?.length || 0,
                status: c.status,
                location: c.location || 'Main Studio'
            };
        });

        res.json(formatted);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
};

const getClassByIdForTrainer = async (req, res) => {
    try {
        const { id } = req.params;
        const tenantId = req.user.tenantId || 1;

        const c = await prisma.class.findFirst({
            where: {
                id: parseInt(id),
                tenantId,
                trainerId: req.user.id
            },
            include: {
                trainer: { select: { id: true, name: true, phone: true } },
                bookings: {
                    include: {
                        member: { select: { id: true, memberId: true, name: true, phone: true, email: true } }
                    }
                }
            }
        });

        if (!c) {
            return res.status(404).json({ message: 'Class not found or not assigned to you' });
        }

        const enrolledMembers = c.bookings.map(b => ({
            id: b.member.id,
            memberId: b.member.memberId,
            name: b.member.name,
            phone: b.member.phone,
            email: b.member.email,
            bookingId: b.id,
            status: b.status
        }));

        res.json({
            id: c.id,
            name: c.name,
            description: c.description || '',
            trainerId: c.trainerId,
            trainerName: c.trainer?.name,
            trainerPhone: c.trainer?.phone,
            schedule: c.schedule,
            duration: c.duration,
            capacity: c.maxCapacity,
            status: c.status,
            location: c.location,
            requiredBenefit: c.requiredBenefit,
            enrolledMembers
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
};

// --- DIET PLANS ---
const getDietPlans = async (req, res) => {
    try {
        const plans = await prisma.dietPlan.findMany({
            where: { trainerId: req.user.id, tenantId: req.user.tenantId || 1 },
            orderBy: { createdAt: 'desc' }
        });
        res.json(plans);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createDietPlan = async (req, res) => {
    try {
        const { clientId, name, target, duration, calories, macros, meals, notes, status } = req.body;
        const plan = await prisma.dietPlan.create({
            data: {
                tenantId: req.user.tenantId || 1,
                trainerId: req.user.id,
                clientId: parseInt(clientId),
                name, target, duration: String(duration), calories: parseInt(calories) || 0,
                macros: macros || {}, meals: meals || [], notes, status: status || 'Active'
            }
        });
        res.status(201).json(plan);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateDietPlan = async (req, res) => {
    try {
        const { id } = req.params;
        const { clientId, name, target, duration, calories, macros, meals, notes, status } = req.body;

        // Ensure ownership
        const existingPlan = await prisma.dietPlan.findFirst({
            where: { id, trainerId: req.user.id }
        });

        if (!existingPlan) {
            return res.status(403).json({ message: 'Unauthorized to update this plan' });
        }

        const plan = await prisma.dietPlan.update({
            where: { id },
            data: {
                clientId: parseInt(clientId),
                name, target, duration: String(duration), calories: parseInt(calories) || 0,
                macros: macros || {}, meals: meals || [], notes, status
            }
        });
        res.json(plan);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const toggleDietPlanStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const plan = await prisma.dietPlan.findFirst({
            where: { id, trainerId: req.user.id }
        });

        if (!plan) {
            return res.status(403).json({ message: 'Unauthorized to modify this plan' });
        }

        const updated = await prisma.dietPlan.update({
            where: { id },
            data: { status: plan.status === 'Active' ? 'Inactive' : 'Active' }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- WORKOUT PLANS ---
const getWorkoutPlans = async (req, res) => {
    try {
        const plans = await prisma.workoutPlan.findMany({
            where: { trainerId: req.user.id, tenantId: req.user.tenantId || 1 },
            orderBy: { createdAt: 'desc' }
        });
        res.json(plans);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createWorkoutPlan = async (req, res) => {
    try {
        const { clientId, name, level, duration, goal, volume, timePerSession, intensity, status, days } = req.body;
        const plan = await prisma.workoutPlan.create({
            data: {
                tenantId: req.user.tenantId || 1,
                trainerId: req.user.id,
                clientId: parseInt(clientId),
                name, level: level || 'Beginner', duration: String(duration), goal: goal || '',
                volume: volume || '', timePerSession: timePerSession || '', intensity: intensity || '',
                status: status || 'Active', days: days || {}
            }
        });
        res.status(201).json(plan);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateWorkoutPlan = async (req, res) => {
    try {
        const { id } = req.params;
        const { clientId, name, level, duration, goal, volume, timePerSession, intensity, status, days } = req.body;

        // Ensure ownership
        const existingPlan = await prisma.workoutPlan.findFirst({
            where: { id, trainerId: req.user.id }
        });

        if (!existingPlan) {
            return res.status(403).json({ message: 'Unauthorized to update this plan' });
        }

        const plan = await prisma.workoutPlan.update({
            where: { id },
            data: {
                clientId: parseInt(clientId),
                name, level, duration: String(duration), goal, volume, timePerSession, intensity, status, days
            }
        });
        res.json(plan);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const toggleWorkoutPlanStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const plan = await prisma.workoutPlan.findUnique({ where: { id } });
        const updated = await prisma.workoutPlan.update({
            where: { id },
            data: { status: plan.status === 'Active' ? 'Inactive' : 'Active' }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const assignPlanToMember = async (req, res) => {
    try {
        const { id: memberId } = req.params;
        const { planId, type, startDate, endDate, notes } = req.body;
        const parsedMemberId = parseInt(memberId);

        const member = await prisma.member.findUnique({ where: { id: parsedMemberId } });
        if (!member || member.trainerId !== req.user.id) {
            return res.status(403).json({ message: 'Unauthorized or member not found' });
        }

        if (type === 'Diet') {
            const template = await prisma.dietPlan.findUnique({ where: { id: planId } });
            if (!template) return res.status(404).json({ message: 'Plan not found' });
            const newPlan = await prisma.dietPlan.create({
                data: {
                    tenantId: template.tenantId,
                    trainerId: req.user.id,
                    clientId: parsedMemberId,
                    name: template.name,
                    target: template.target,
                    duration: `${startDate} to ${endDate}`, // Store in duration or ignore
                    calories: template.calories,
                    macros: template.macros,
                    meals: template.meals,
                    notes: notes || template.notes,
                    status: 'Active'
                }
            });
            return res.status(201).json(newPlan);
        } else if (type === 'Workout') {
            const template = await prisma.workoutPlan.findUnique({ where: { id: planId } });
            if (!template) return res.status(404).json({ message: 'Plan not found' });
            const newPlan = await prisma.workoutPlan.create({
                data: {
                    tenantId: template.tenantId,
                    trainerId: req.user.id,
                    clientId: parsedMemberId,
                    name: template.name,
                    level: template.level,
                    duration: `${startDate} to ${endDate}`, // Store date range
                    goal: template.goal,
                    volume: template.volume,
                    timePerSession: template.timePerSession,
                    intensity: template.intensity,
                    days: template.days,
                    status: 'Active'
                }
            });
            return res.status(201).json(newPlan);
        }

        res.status(400).json({ message: 'Invalid plan type' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getProfile,
    updateProfile,
    changePassword,
    getAssignedMembers,
    getMemberById,
    flagMember,
    getSessions,
    createSession,
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
    updateAvailability,
    deleteTimeOff,
    getClassesForTrainer,
    getClassByIdForTrainer,
    updateSession,
    deleteSession,
    getSessionRoster,
    getDietPlans,
    createDietPlan,
    updateDietPlan,
    toggleDietPlanStatus,
    getWorkoutPlans,
    createWorkoutPlan,
    updateWorkoutPlan,
    toggleWorkoutPlanStatus,
    assignPlanToMember
};
