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
            time: c.schedule?.time || 'TBD',
            date: c.schedule?.date || new Date().toISOString().split('T')[0],
            type: c.description || 'Group Class',
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
        const { id, joinedDate, baseSalary, name } = req.user;
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth(); // 0-indexed

        // Use trainer's base salary or default
        const salary = baseSalary ? parseFloat(baseSalary) : 45000;
        const commissionRate = 15; // Could be from user.config

        // Generate history for last 2 years
        const history = [];
        const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

        for (let year of [currentYear, currentYear - 1]) {
            const startMonth = (year === currentYear) ? currentMonth : 11;
            for (let m = startMonth; m >= 0; m--) {
                // For demo/simulated data, we create some values
                const monthName = months[m];
                const isCurrentMonth = (year === currentYear && m === currentMonth);

                // Deterministic pseudo-random values based on user ID and date
                const seed = (id * 10000) + (year * 100) + m;
                const commission = Math.floor((Math.sin(seed) * 5000) + 10000);
                const bonus = Math.floor(Math.sin(seed + 1) * 2000);
                const total = salary + commission + (bonus > 0 ? bonus : 0);

                history.push({
                    id: `${year}-${m}`,
                    year: year.toString(),
                    month: `${monthName} ${year}`,
                    baseSalary: salary,
                    commission: commission,
                    bonus: bonus > 0 ? bonus : 0,
                    total: total,
                    status: isCurrentMonth ? 'Pending' : 'Paid',
                    details: [
                        { id: 101, member: 'Rahul Sharma', type: 'Personal Training', amount: Math.floor(commission * 0.6), date: `${monthName} 12, ${year}` },
                        { id: 102, member: 'Priya Singh', type: 'Diet Plan', amount: Math.floor(commission * 0.4), date: `${monthName} 15, ${year}` },
                    ]
                });
            }
        }

        const currentMonthData = history.find(h => h.id === `${currentYear}-${currentMonth}`) || history[0];

        const earningsData = {
            summary: {
                baseSalary: salary,
                commissionRate: commissionRate,
                currentMonthCommission: currentMonthData.commission,
                currentMonthTotal: currentMonthData.total,
                currency: '₹',
                currentMonthName: months[currentMonth]
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

        // Find today's date safely
        const targetDateStr = new Date().toLocaleDateString('en-CA'); // 'YYYY-MM-DD'

        // Fetch logs
        const logs = await prisma.attendance.findMany({
            where: { userId: id, tenantId },
            orderBy: { date: 'desc' },
            take: 30
        });

        // Find today's record
        const todayRecord = logs.find(log => new Date(log.date).toLocaleDateString('en-CA') === targetDateStr);

        // Leave Requests
        const leaveRequests = await prisma.leaveRequest.findMany({
            where: { userId: id, tenantId },
            orderBy: { createdAt: 'desc' }
        });

        const attendanceData = {
            summary: {
                todayCheckIn: todayRecord?.checkIn ? new Date(todayRecord.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Not yet',
                todayCheckOut: todayRecord?.checkOut ? new Date(todayRecord.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Not yet',
                totalHoursToday: todayRecord?.checkOut ? ((new Date(todayRecord.checkOut) - new Date(todayRecord.checkIn)) / 3600000).toFixed(1) + 'h' : '0.0h',
                daysPresentMonth: logs.filter(l => l.status === 'Present').length,
                totalWorkDays: 22
            },
            logs: logs.map(l => ({
                id: l.id,
                date: new Date(l.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                checkIn: l.checkIn ? new Date(l.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-',
                checkOut: l.checkOut ? new Date(l.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-',
                hours: l.checkOut ? ((new Date(l.checkOut) - new Date(l.checkIn)) / 3600000).toFixed(1) + 'h' : '-',
                status: l.status
            })),
            leaveRequests: leaveRequests.map(l => ({
                id: l.id,
                type: l.type,
                start: new Date(l.startDate).toLocaleDateString(),
                end: new Date(l.endDate).toLocaleDateString(),
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
        const targetDateStr = new Date().toLocaleDateString('en-CA'); // 'YYYY-MM-DD'

        const recentLogs = await prisma.attendance.findMany({
            where: { userId: id, tenantId },
            orderBy: { date: 'desc' },
            take: 5
        });

        let record = recentLogs.find(log => new Date(log.date).toLocaleDateString('en-CA') === targetDateStr);

        if (!record) {
            // Remove time info to store clean date
            const cleanDate = new Date();
            cleanDate.setHours(0, 0, 0, 0);

            record = await prisma.attendance.create({
                data: {
                    userId: id,
                    tenantId,
                    type: role,
                    date: cleanDate,
                    checkIn: new Date(),
                    status: 'Present'
                }
            });
        } else if (!record.checkOut) {
            record = await prisma.attendance.update({
                where: { id: record.id },
                data: { checkOut: new Date() }
            });
        }
        res.json({ success: true, message: 'Check-in/out successful', data: record });
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
                startDate: new Date(start),
                endDate: new Date(end),
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
            where: { userId: id, status: 'Approved' }
        });

        res.json({
            weekly: typeof availability.weeklySchedule === 'string' ? JSON.parse(availability.weeklySchedule) : availability.weeklySchedule,
            timeOff: timeOffRequests.map(l => ({
                id: l.id,
                start: new Date(l.startDate).toISOString().split('T')[0],
                end: new Date(l.endDate).toISOString().split('T')[0],
                reason: l.reason
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
            if (c.schedule && Array.isArray(c.schedule) && c.schedule.length > 0) {
                scheduleStr = c.schedule.map(s => `${s.day} ${s.startTime}-${s.endTime}`).join(', ');
            } else if (typeof c.schedule === 'string') {
                scheduleStr = c.schedule;
            } else if (typeof c.schedule === 'object' && c.schedule.days) {
                scheduleStr = `${c.schedule.days.join(', ')} @ ${c.schedule.time}`;
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
        const plan = await prisma.dietPlan.findUnique({ where: { id } });
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
    getDietPlans,
    createDietPlan,
    updateDietPlan,
    toggleDietPlanStatus,
    getWorkoutPlans,
    createWorkoutPlan,
    updateWorkoutPlan,
    toggleWorkoutPlanStatus
};
