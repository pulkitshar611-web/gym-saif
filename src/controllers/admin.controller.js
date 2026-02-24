// gym_backend/src/controllers/admin.controller.js
const prisma = require('../config/prisma');

// --- MEMBER MANAGEMENT ---

const getAllMembers = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { search, status } = req.query;

        const where = { tenantId };

        if (status && status !== 'All') {
            where.status = status;
        }

        if (search) {
            where.OR = [
                { name: { contains: search } }, // Case insensitive usually requires mode: 'insensitive' in Postgres, but MySQL default collation is often CI. Prisma client handles this? 
                // For safety in Prisma with SQLite/Postgres we use mode: 'insensitive', but here likely MySQL. 
                // Let's assume generic 'contains'.
                { memberId: { contains: search } }
            ];
        }

        const members = await prisma.member.findMany({
            where,
            include: {
                trainer: { select: { name: true } },
                plan: { select: { name: true } },
            },
            orderBy: { joinDate: 'desc' }
        });

        const formattedMembers = members.map(m => ({
            id: m.id,
            memberId: m.memberId,
            name: m.name || 'N/A',
            phone: m.phone || 'N/A',
            plan: m.plan?.name || 'No Plan',
            planId: m.planId,
            status: m.status,
            joinDate: m.joinDate,
            expiryDate: m.expiryDate,
            trainer: m.trainer?.name || 'Unassigned'
        }));

        res.json(formattedMembers);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const cloudinary = require('../utils/cloudinary');

const addMember = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { name, email, phone, planId, avatar, benefits } = req.body; // avatar is base64 string, benefits is array

        let avatarUrl = null;

        if (avatar && avatar.startsWith('data:image')) {
            try {
                const uploadResponse = await cloudinary.uploader.upload(avatar, {
                    folder: 'gym/biometrics',
                    resource_type: 'image'
                });
                avatarUrl = uploadResponse.secure_url;
            } catch (uploadError) {
                console.error('Cloudinary upload failure:', uploadError);
                // We might want to continue creating member even if image fails, or throw error
                // For now logging it.
            }
        }

        const newMember = await prisma.member.create({
            data: {
                memberId: `MEM-${Date.now()}`,
                tenantId,
                name,
                email,
                phone,
                planId: planId ? parseInt(planId) : null,
                status: 'Active',
                avatar: avatarUrl,
                // Add other fields from body if necessary (gender, etc)
                // Assuming schema supports them or will ignore if not mapped
                // Let's add common fields if passed
                gender: req.body.gender,
                joinDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
                medicalHistory: req.body.medicalHistory,
                fitnessGoal: req.body.fitnessGoal,
                emergencyName: req.body.emergencyName,
                emergencyPhone: req.body.emergencyPhone,
                benefits: benefits || []
            }
        });
        res.status(201).json(newMember);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getMemberById = async (req, res) => {
    try {
        const { id } = req.params;
        const member = await prisma.member.findUnique({
            where: { id: parseInt(id) },
            include: { trainer: true, tenant: true }
        });
        res.json(member);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateMember = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name, email, phone, gender, avatar, planId,
            startDate, status, benefits, medicalHistory,
            fitnessGoal, emergencyName, emergencyPhone
        } = req.body;

        const updateData = {
            name,
            email,
            phone,
            gender,
            status,
            medicalHistory,
            fitnessGoal,
            emergencyName,
            emergencyPhone,
            benefits: benefits || []
        };

        if (planId) updateData.planId = parseInt(planId);
        if (startDate) updateData.joinDate = new Date(startDate);

        if (avatar && avatar.startsWith('data:image')) {
            try {
                const uploadResponse = await cloudinary.uploader.upload(avatar, {
                    folder: 'gym/biometrics',
                    resource_type: 'image'
                });
                updateData.avatar = uploadResponse.secure_url;
            } catch (uploadError) {
                console.error('Cloudinary upload failure:', uploadError);
            }
        }

        const updated = await prisma.member.update({
            where: { id: parseInt(id) },
            data: updateData
        });
        res.json(updated);
    } catch (error) {
        console.error('Update member error:', error);
        res.status(500).json({ message: error.message });
    }
};

const deleteMember = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.member.delete({ where: { id: parseInt(id) } });
        res.json({ message: 'Member deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const toggleMemberStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const member = await prisma.member.findUnique({ where: { id: parseInt(id) } });
        const updated = await prisma.member.update({
            where: { id: parseInt(id) },
            data: { status: member.status === 'Active' ? 'Inactive' : 'Active' }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- STAFF MANAGEMENT ---

const getAllStaff = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const staff = await prisma.user.findMany({
            where: {
                tenantId,
                role: { in: ['STAFF', 'TRAINER', 'MANAGER'] }
            }
        });
        res.json(staff);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createStaff = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const {
            name, email, phone, dob, department, role,
            joiningDate, status, baseSalary, commission, accountNumber, ifsc,
            trainerConfig, salesConfig, managerConfig, documents
        } = req.body;

        // Combine role configs into one config object based on the role
        let config = null;
        if (role === 'Trainer') config = trainerConfig;
        if (role === 'Sales') config = salesConfig;
        if (role === 'Manager') config = managerConfig;

        // Hash default password for staff (e.g. 123456)
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash('123456', 10);

        // Handle exact role value
        let mappedRole = role.toUpperCase();
        if (role === 'Admin') mappedRole = 'BRANCH_ADMIN';
        if (role === 'Sales') mappedRole = 'STAFF';
        if (role === 'Sales Professional') mappedRole = 'STAFF';
        if (role === 'Receptionist') mappedRole = 'STAFF';

        const newStaff = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                phone,
                role: mappedRole,
                tenantId,
                status: status || 'Active',
                department,
                joinedDate: joiningDate ? new Date(joiningDate) : new Date(),
                baseSalary: baseSalary ? parseFloat(baseSalary) : null,
                commission: commission ? parseFloat(commission) : 0,
                accountNumber,
                ifsc,
                config: config || {},
                documents: documents || {}
            }
        });

        res.status(201).json(newStaff);
    } catch (error) {
        console.error('Error creating staff:', error);
        res.status(500).json({ message: error.message });
    }
};

// --- BOOKINGS ---

const getBookings = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const bookings = await prisma.booking.findMany({
            where: { member: { tenantId } },
            include: { member: true, class: true }
        });
        res.json({ data: bookings, total: bookings.length });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getBookingStats = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const total = await prisma.booking.count({ where: { member: { tenantId } } });
        const upcoming = await prisma.booking.count({ where: { member: { tenantId }, status: 'Upcoming' } });
        res.json({ total, upcoming, completed: 0, cancelled: 0 });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getBookingsByDateRange = async (req, res) => {
    try {
        const { start, end } = req.query;
        const { tenantId } = req.user;
        const bookings = await prisma.booking.findMany({
            where: {
                member: { tenantId },
                date: { gte: new Date(start), lte: new Date(end) }
            },
            include: { member: true, class: true }
        });
        res.json(bookings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getBookingById = async (req, res) => {
    try {
        const { id } = req.params;
        const booking = await prisma.booking.findUnique({
            where: { id: parseInt(id) },
            include: { member: true, class: true }
        });
        res.json(booking);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateBookingStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const updated = await prisma.booking.update({
            where: { id: parseInt(id) },
            data: { status }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createBooking = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { memberId, classId, date, status } = req.body;

        if (!memberId || !classId || !date) {
            return res.status(400).json({ message: 'Member, Class, and Date are required' });
        }

        // Verify member belongs to tenant
        const member = await prisma.member.findUnique({
            where: { id: parseInt(memberId) }
        });

        if (!member || member.tenantId !== tenantId) {
            return res.status(403).json({ message: 'Invalid member or access denied' });
        }

        // Verify class belongs to tenant
        const gymClass = await prisma.class.findUnique({
            where: { id: parseInt(classId) }
        });

        if (!gymClass || gymClass.tenantId !== tenantId) {
            return res.status(403).json({ message: 'Invalid class or access denied' });
        }

        const newBooking = await prisma.booking.create({
            data: {
                memberId: parseInt(memberId),
                classId: parseInt(classId),
                date: new Date(date),
                status: status || 'Upcoming'
            }
        });
        res.status(201).json(newBooking);
    } catch (error) {
        console.error('Create booking error:', error);
        res.status(500).json({ message: error.message });
    }
};

const deleteBooking = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.booking.delete({ where: { id: parseInt(id) } });
        res.json({ message: 'Booking deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getTodaysBookings = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const bookings = await prisma.booking.findMany({
            where: {
                member: { tenantId },
                date: { gte: today, lt: tomorrow }
            },
            include: { member: true, class: true }
        });
        res.json(bookings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getBookingCalendar = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const bookings = await prisma.booking.findMany({
            where: { member: { tenantId } },
            include: { member: true, class: true }
        });
        res.json(bookings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- ATTENDANCE ---

const getCheckIns = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const attendance = await prisma.attendance.findMany({
            where: { user: { tenantId } },
            include: { user: true }
        });
        res.json({ data: attendance, total: attendance.length });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const deleteCheckIn = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.attendance.delete({ where: { id: parseInt(id) } });
        res.json({ message: 'Attendance record deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getAttendanceStats = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const currentlyIn = await prisma.attendance.count({
            where: { user: { tenantId }, checkOut: null }
        });
        res.json({ currentlyIn, totalToday: 0, membersToday: 0, staffToday: 0 });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getLiveCheckIn = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const live = await prisma.attendance.findMany({
            where: { user: { tenantId }, checkOut: null },
            include: { user: true }
        });
        res.json(live);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- TASKS ---

const getTasks = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const tasks = await prisma.task.findMany({
            where: { creator: { tenantId } },
            include: { assignedTo: true, creator: true }
        });
        res.json({ data: tasks, total: tasks.length });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getTaskStats = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const total = await prisma.task.count({ where: { creator: { tenantId } } });
        const pending = await prisma.task.count({ where: { creator: { tenantId }, status: 'Pending' } });
        res.json({ total, pending, inProgress: 0, completed: 0 });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateTaskStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const updated = await prisma.task.update({
            where: { id: parseInt(id) },
            data: { status }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateTask = async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await prisma.task.update({
            where: { id: parseInt(id) },
            data: req.body
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createTask = async (req, res) => {
    try {
        const newTask = await prisma.task.create({ data: req.body });
        res.status(201).json(newTask);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const deleteTask = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.task.delete({ where: { id: parseInt(id) } });
        res.json({ message: 'Task deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const assignTask = async (req, res) => {
    try {
        const { assignedToId, title, priority, dueDate } = req.body;
        const { id: creatorId } = req.user;
        const newTask = await prisma.task.create({
            data: {
                title,
                priority,
                dueDate: new Date(dueDate),
                assignedToId: parseInt(assignedToId),
                creatorId,
                status: 'Pending'
            }
        });
        res.status(201).json(newTask);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- REPORTS ---

const getBookingReport = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const bookings = await prisma.booking.findMany({
            where: { member: { tenantId } },
            include: { member: true, class: true }
        });
        res.json(bookings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getAttendanceReport = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const attendance = await prisma.attendance.findMany({
            where: { user: { tenantId } },
            include: { user: true }
        });
        res.json(attendance);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- DASHBOARD ---

const fetchBranchDashboardCards = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const totalMembers = await prisma.member.count({ where: { tenantId } });
        const activePlans = await prisma.member.count({ where: { tenantId, status: 'Active' } });

        res.json([
            { title: 'Total Members', value: totalMembers, change: '+0%', icon: 'users', color: 'blue' },
            { title: 'Active Plans', value: activePlans, change: '+0%', icon: 'file-text', color: 'green' },
            { title: 'Revenue (M)', value: '₹0', change: '+0%', icon: 'dollar-sign', color: 'purple' },
            { title: 'Check-ins', value: '0', change: '+0%', icon: 'activity', color: 'orange' },
        ]);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const freezeMember = async (req, res) => {
    try {
        const { id } = req.params;
        const { duration, reason, isChargeable } = req.body;

        const member = await prisma.member.findUnique({ where: { id: parseInt(id) } });
        if (!member) return res.status(404).json({ message: 'Member not found' });

        // Calculate new expiry date by adding duration months
        const currentExpiry = member.expiryDate || new Date();
        const newExpiry = new Date(currentExpiry);
        newExpiry.setMonth(newExpiry.getMonth() + parseInt(duration));

        const updated = await prisma.member.update({
            where: { id: parseInt(id) },
            data: {
                status: 'Frozen',
                expiryDate: newExpiry,
                medicalHistory: member.medicalHistory ? `${member.medicalHistory}\n[Freeze: ${reason}]` : `[Freeze: ${reason}]`
            }
        });

        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const unfreezeMember = async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await prisma.member.update({
            where: { id: parseInt(id) },
            data: { status: 'Active' }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const giftDays = async (req, res) => {
    try {
        const { id } = req.params;
        const { days, note } = req.body;

        const member = await prisma.member.findUnique({ where: { id: parseInt(id) } });
        if (!member) return res.status(404).json({ message: 'Member not found' });

        const currentExpiry = member.expiryDate || new Date();
        const newExpiry = new Date(currentExpiry);
        newExpiry.setDate(newExpiry.getDate() + parseInt(days));

        const updated = await prisma.member.update({
            where: { id: parseInt(id) },
            data: {
                expiryDate: newExpiry,
                medicalHistory: member.medicalHistory ? `${member.medicalHistory}\n[Gift: ${days} days - ${note}]` : `[Gift: ${days} days - ${note}]`
            }
        });

        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- Membership Plans ---

const getAllPlans = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const plans = await prisma.membershipPlan.findMany({
            where: { tenantId }
        });
        res.json(plans);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createPlan = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const planData = req.body;

        const newPlan = await prisma.membershipPlan.create({
            data: {
                ...planData,
                tenantId,
                price: parseFloat(planData.price),
                duration: parseInt(planData.duration),
                creditsPerBooking: planData.creditsPerBooking ? parseInt(planData.creditsPerBooking) : undefined,
                maxBookingsPerDay: planData.maxBookingsPerDay ? parseInt(planData.maxBookingsPerDay) : undefined,
                maxBookingsPerWeek: planData.maxBookingsPerWeek ? parseInt(planData.maxBookingsPerWeek) : undefined,
                cancellationWindow: planData.cancellationWindow ? parseInt(planData.cancellationWindow) : undefined
            }
        });
        res.status(201).json(newPlan);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updatePlan = async (req, res) => {
    try {
        const { id } = req.params;
        const planData = req.body;

        const updated = await prisma.membershipPlan.update({
            where: { id: parseInt(id) },
            data: {
                ...planData,
                price: planData.price ? parseFloat(planData.price) : undefined,
                duration: planData.duration ? parseInt(planData.duration) : undefined,
                creditsPerBooking: planData.creditsPerBooking ? parseInt(planData.creditsPerBooking) : undefined,
                maxBookingsPerDay: planData.maxBookingsPerDay ? parseInt(planData.maxBookingsPerDay) : undefined,
                maxBookingsPerWeek: planData.maxBookingsPerWeek ? parseInt(planData.maxBookingsPerWeek) : undefined,
                cancellationWindow: planData.cancellationWindow ? parseInt(planData.cancellationWindow) : undefined
            }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const deletePlan = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.membershipPlan.delete({
            where: { id: parseInt(id) }
        });
        res.json({ message: 'Plan deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- CLASSES MANAGEMENT ---

const getAllClasses = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const classes = await prisma.class.findMany({
            where: { tenantId },
            include: {
                bookings: true,
                trainer: true
            }
        });

        // Format for frontend
        const formatted = classes.map(cls => ({
            id: cls.id,
            name: cls.name,
            description: cls.description,
            trainerName: cls.trainer?.name || 'Unassigned',
            trainerId: cls.trainerId,
            schedule: cls.schedule && cls.schedule.date
                ? `${cls.schedule.date} at ${cls.schedule.time}`
                : (typeof cls.schedule === 'string' ? cls.schedule : 'TBA'),
            duration: cls.duration || '60 mins',
            capacity: cls.maxCapacity,
            enrolled: cls.bookings.length,
            status: cls.status,
            location: cls.location || 'N/A',
            requiredBenefit: cls.requiredBenefit
        }));

        res.json(formatted);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createClass = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { name, description, trainerId, schedule, maxCapacity, status, location, duration, requiredBenefit } = req.body;

        const newClass = await prisma.class.create({
            data: {
                tenantId,
                name,
                description,
                trainerId: trainerId ? parseInt(trainerId) : null,
                schedule: schedule || {},
                maxCapacity: parseInt(maxCapacity),
                status: status || 'Scheduled',
                location,
                duration,
                requiredBenefit
            }
        });
        res.status(201).json(newClass);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateClass = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, trainerId, schedule, maxCapacity, status, location, duration, requiredBenefit } = req.body;

        const updated = await prisma.class.update({
            where: { id: parseInt(id) },
            data: {
                name,
                description,
                trainerId: trainerId ? parseInt(trainerId) : null,
                schedule,
                maxCapacity: maxCapacity ? parseInt(maxCapacity) : undefined,
                status,
                location,
                duration,
                requiredBenefit
            }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getClassById = async (req, res) => {
    try {
        const { id } = req.params;
        const cls = await prisma.class.findUnique({
            where: { id: parseInt(id) },
            include: {
                bookings: {
                    include: { member: true }
                },
                trainer: true
            }
        });

        if (!cls) return res.status(404).json({ message: 'Class not found' });

        const formatted = {
            id: cls.id,
            name: cls.name,
            description: cls.description,
            trainerName: cls.trainer?.name || 'Unassigned',
            trainerId: cls.trainerId,
            schedule: cls.schedule,
            duration: cls.duration || '60 mins',
            capacity: cls.maxCapacity,
            enrolled: cls.bookings.length,
            status: cls.status,
            location: cls.location || 'N/A',
            requiredBenefit: cls.requiredBenefit,
            enrolledMembers: cls.bookings.map(b => ({
                id: b.member.id,
                name: b.member.name,
                email: b.member.email
            }))
        };

        res.json(formatted);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const deleteClass = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.class.delete({ where: { id: parseInt(id) } });
        res.json({ message: 'Class deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- COMMUNICATION ---

const getAnnouncements = async (req, res) => {
    try {
        const announcements = [
            { id: 1, title: 'Gym Maintenance this Sunday', message: 'The gym will be closed for maintenance from 10 AM to 4 PM this Sunday. We apologize for the inconvenience.', audience: 'All Members', status: 'Scheduled', date: '2024-02-25 09:00 AM', author: 'Admin' },
            { id: 2, title: 'New Zumba Classes!', message: 'We are excited to announce new Zumba batches starting next week. Register now at the front desk!', audience: 'Active Members', status: 'Posted', date: '2024-02-20 10:30 AM', author: 'Sarah Manager' },
            { id: 3, title: 'Staff Meeting Reminder', message: 'Monthly staff meeting is scheduled for tomorrow at 2 PM in the conference room.', audience: 'Staff', status: 'Posted', date: '2024-02-18 05:00 PM', author: 'Admin' }
        ];
        res.json(announcements);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createAnnouncement = async (req, res) => {
    try {
        const newAnnouncement = { ...req.body, id: Date.now(), author: 'Current User' };
        res.json({ message: 'Announcement created successfully', announcement: newAnnouncement });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getChats = async (req, res) => {
    try {
        const chats = [
            { id: 1, name: 'Rahul Sharma', lastMsg: 'I will be there at 6 AM tomorrow.', time: '10:30 AM', unread: 2, status: 'online', avatar: 'R' },
            { id: 2, name: 'Vikram Singh', lastMsg: 'Can you freeze my membership?', time: '09:15 AM', unread: 0, status: 'away', avatar: 'V' }
        ];
        res.json(chats);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getMessages = async (req, res) => {
    try {
        const messages = [
            { id: 1, text: 'Hi, just a reminder about your session tomorrow.', time: '09:00 AM', sender: 'me', status: 'read' },
            { id: 2, text: 'I will be there at 6 AM tomorrow. Is that okay?', time: '10:30 AM', sender: 'them', status: 'received' },
            { id: 3, text: 'Perfect. See you at the gym!', time: '10:35 AM', sender: 'me', status: 'sent' }
        ];
        res.json(messages);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const sendMessage = async (req, res) => {
    try {
        res.json({ success: true, message: 'Message sent' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createPayroll = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { staffId, amount, month, year, status } = req.body;

        const monthMap = {
            'January': 1, 'February': 2, 'March': 3, 'April': 4, 'May': 5, 'June': 6,
            'July': 7, 'August': 8, 'September': 9, 'October': 10, 'November': 11, 'December': 12
        };

        const monthInt = typeof month === 'string' ? monthMap[month] : month;

        const payroll = await prisma.payroll.create({
            data: {
                tenantId,
                staffId: parseInt(staffId),
                amount: parseFloat(amount),
                month: monthInt,
                year: parseInt(year),
                status
            }
        });

        res.status(201).json(payroll);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getPayrollHistory = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const history = await prisma.payroll.findMany({
            where: { tenantId },
            include: {
                tenant: { select: { name: true, branchName: true } }
            },
            orderBy: { id: 'desc' }
        });

        // Fetch staff names separately as they are in the User model but not directly linked in current prisma schema relation for Payroll?
        // Actually wait, let's check schema for Payroll relations.
        // model Payroll {
        //   id       Int     @id @default(autoincrement())
        //   tenantId Int
        //   tenant   Tenant  @relation(fields: [tenantId], references: [id])
        //   staffId  Int
        //   amount   Decimal @db.Decimal(10, 2)
        //   month    Int
        //   year     Int
        //   status   String  @default("Pending") // Pending, Processed
        // }
        // No staff relation. I should fetch users.

        const staffIds = history.map(h => h.staffId);
        const staff = await prisma.user.findMany({
            where: { id: { in: staffIds } },
            select: { id: true, name: true }
        });

        const staffMap = staff.reduce((acc, s) => {
            acc[s.id] = s.name;
            return acc;
        }, {});

        const formattedHistory = history.map(h => ({
            ...h,
            staffName: staffMap[h.staffId] || 'Unknown Staff'
        }));

        res.json(formattedHistory);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updatePayrollStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const { tenantId } = req.user;

        const payroll = await prisma.payroll.updateMany({
            where: { id: parseInt(id), tenantId },
            data: { status }
        });

        if (payroll.count === 0) {
            return res.status(404).json({ message: 'Payroll record not found' });
        }

        res.json({ success: true, message: 'Status updated' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getProfile = async (req, res) => {
    console.log(`Profile fetch request for user: ${req.user.id}, role: ${req.user.role}`);
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                address: true,
                role: true,
                status: true,
                avatar: true,
                joinedDate: true
            }
        });

        // Format joinedDate to 'short' format like 'Feb 2024'
        const formattedUser = {
            ...user,
            avatar: user.avatar || user.name.charAt(0),
            joinedDate: new Date(user.joinedDate).toLocaleDateString('en-US', {
                month: 'short',
                year: 'numeric'
            })
        };

        res.json(formattedUser);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateProfile = async (req, res) => {
    try {
        const { name, email, phone, address } = req.body;
        const updated = await prisma.user.update({
            where: { id: req.user.id },
            data: { name, email, phone, address }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- LEAVE MANAGEMENT ---
const getLeaveRequests = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const requests = await prisma.leaveRequest.findMany({
            where: { tenantId },
            include: { user: { select: { id: true, name: true, role: true } } },
            orderBy: { createdAt: 'desc' }
        });
        res.json(requests);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateLeaveStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const leave = await prisma.leaveRequest.update({
            where: { id: parseInt(id) },
            data: { status }
        });

        // Optionally, if approved, create attendance records marking as "On Leave" for those dates
        if (status === 'Approved') {
            const start = new Date(leave.startDate);
            const end = new Date(leave.endDate);
            const dates = [];
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                dates.push(new Date(d));
            }

            for (const date of dates) {
                date.setHours(0, 0, 0, 0);
                await prisma.attendance.upsert({
                    where: { id: -1 }, // Force create, or better logic to find unique if needed via another query
                    update: {},
                    create: {
                        userId: leave.userId,
                        tenantId: leave.tenantId,
                        date: date,
                        status: 'On Leave',
                        type: 'Trainer' // Defaulting safely, could read from user.role
                    }
                });
            }
        }

        res.json({ success: true, message: 'Leave status updated', data: leave });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getTenantSettings = async (req, res) => {
    try {
        const { tenantId } = req.user;
        let settings = await prisma.tenantSettings.findUnique({
            where: { tenantId }
        });

        if (!settings) {
            settings = await prisma.tenantSettings.create({
                data: { tenantId }
            });
        }

        res.json(settings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateTenantSettings = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const updated = await prisma.tenantSettings.update({
            where: { tenantId },
            data: req.body
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getAllMembers,
    addMember,
    getMemberById,
    updateMember,
    deleteMember,
    toggleMemberStatus,
    freezeMember,
    unfreezeMember,
    giftDays,
    getAllPlans,
    createPlan,
    updatePlan,
    deletePlan,
    getAllStaff,
    createStaff,
    fetchBranchDashboardCards,
    getBookings,
    getBookingStats,
    getBookingsByDateRange,
    getBookingById,
    updateBookingStatus,
    createBooking,
    deleteBooking,
    getTodaysBookings,
    getBookingCalendar,
    getCheckIns,
    deleteCheckIn,
    getAttendanceStats,
    getLiveCheckIn,
    getTasks,
    getTaskStats,
    updateTaskStatus,
    updateTask,
    createTask,
    deleteTask,
    assignTask,
    getBookingReport,
    getAttendanceReport,
    getAllClasses,
    getClassById,
    createClass,
    updateClass,
    deleteClass,
    getAnnouncements,
    createAnnouncement,
    getChats,
    getMessages,
    sendMessage,
    createPayroll,
    getPayrollHistory,
    updatePayrollStatus,
    getProfile,
    updateProfile,
    getLeaveRequests,
    updateLeaveStatus,
    getTenantSettings,
    updateTenantSettings
};
