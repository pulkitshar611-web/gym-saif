// gym_backend/src/controllers/admin.controller.js
const prisma = require('../config/prisma');
const bcrypt = require('bcryptjs');

// --- MEMBER MANAGEMENT ---

const getAllMembers = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const { search, status } = req.query;

        const where = role === 'SUPER_ADMIN' ? {} : { tenantId };

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

        // Create User account for the member first to ensure consistency
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash('123456', 10);
        const userEmail = email || `member${Date.now()}@system.com`;

        const newUser = await prisma.user.create({
            data: {
                name,
                email: userEmail,
                password: hashedPassword,
                phone: phone || '',
                role: 'MEMBER',
                tenantId,
                status: 'Active'
            }
        });

        let expiryDate = undefined;
        let plan = null;
        if (planId) {
            plan = await prisma.membershipPlan.findUnique({
                where: { id: parseInt(planId) }
            });
            if (plan) {
                const finalStartDate = req.body.startDate || req.body.joinDate;
                const start = finalStartDate ? new Date(finalStartDate) : new Date();
                expiryDate = new Date(start);
                if (plan.durationType === 'Months') {
                    expiryDate.setMonth(expiryDate.getMonth() + plan.duration);
                } else if (plan.durationType === 'Days') {
                    expiryDate.setDate(expiryDate.getDate() + plan.duration);
                } else if (plan.durationType === 'Years') {
                    expiryDate.setFullYear(expiryDate.getFullYear() + plan.duration);
                }
            }
        }

        const newMember = await prisma.member.create({
            data: {
                userId: newUser.id,
                memberId: `MEM-${Date.now()}`,
                tenantId,
                name,
                email,
                phone,
                planId: planId ? parseInt(planId) : null,
                status: 'Active',
                avatar: avatarUrl,
                gender: req.body.gender,
                joinDate: (req.body.startDate || req.body.joinDate) ? new Date(req.body.startDate || req.body.joinDate) : undefined,
                expiryDate: expiryDate,
                medicalHistory: req.body.medicalHistory,
                fitnessGoal: req.body.fitnessGoal,
                emergencyName: req.body.emergencyName,
                emergencyPhone: req.body.emergencyPhone,
                benefits: benefits || []
            }
        });

        // Auto-generate invoice if a plan is selected
        if (plan) {
            await prisma.invoice.create({
                data: {
                    tenantId,
                    invoiceNumber: `INV-${Date.now()}`,
                    memberId: newMember.id,
                    amount: plan.price,
                    paymentMode: 'Cash',
                    status: 'Unpaid',
                    dueDate: new Date()
                }
            });
        }

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
            include: { trainer: true, tenant: true, plan: true }
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

        const existingMember = await prisma.member.findUnique({ where: { id: parseInt(id) } });

        let expiryDate = undefined;
        if (planId) {
            const plan = await prisma.membershipPlan.findUnique({
                where: { id: parseInt(planId) }
            });
            if (plan && existingMember) {
                updateData.planId = parseInt(planId);
                const start = startDate ? new Date(startDate) : existingMember.joinDate;
                expiryDate = new Date(start);
                if (plan.durationType === 'Months') {
                    expiryDate.setMonth(expiryDate.getMonth() + plan.duration);
                } else if (plan.durationType === 'Days') {
                    expiryDate.setDate(expiryDate.getDate() + plan.duration);
                } else if (plan.durationType === 'Years') {
                    expiryDate.setFullYear(expiryDate.getFullYear() + plan.duration);
                }
                updateData.expiryDate = expiryDate;
            }
        }
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
        const memberId = parseInt(id);

        // Pre-fetch wallet and store orders to delete their nested relations first
        const wallet = await prisma.wallet.findUnique({ where: { memberId } });
        const orders = await prisma.storeOrder.findMany({ where: { memberId }, select: { id: true } });
        const orderIds = orders.map(o => o.id);

        const transactionOperations = [];

        // 1. Delete deeply nested items
        if (wallet) {
            transactionOperations.push(prisma.transaction.deleteMany({ where: { walletId: wallet.id } }));
        }
        if (orderIds.length > 0) {
            transactionOperations.push(prisma.storeOrderItem.deleteMany({ where: { orderId: { in: orderIds } } }));
        }

        // 2. Delete direct member relations
        transactionOperations.push(
            prisma.booking.deleteMany({ where: { memberId } }),
            prisma.memberProgress.deleteMany({ where: { memberId } }),
            prisma.reward.deleteMany({ where: { memberId } }),
            prisma.feedback.deleteMany({ where: { memberId } }),
            prisma.dietPlan.deleteMany({ where: { clientId: memberId } }), // uses clientId
            prisma.workoutPlan.deleteMany({ where: { clientId: memberId } }), // uses clientId
            prisma.serviceRequest.deleteMany({ where: { memberId } }),
            prisma.message.deleteMany({ where: { memberId } }), // uses memberId
            prisma.storeOrder.deleteMany({ where: { memberId } }),
            prisma.invoice.deleteMany({ where: { memberId } }),
            prisma.wallet.deleteMany({ where: { memberId } }),
            
            // 3. Delete the member
            prisma.member.delete({ where: { id: memberId } })
        );

        // Execute all operations in a single transaction
        await prisma.$transaction(transactionOperations);

        res.json({ message: 'Member and all related records deleted successfully' });
    } catch (error) {
        console.error('Delete member error:', error);
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
                tenantId: req.user.role === 'SUPER_ADMIN' ? undefined : req.user.tenantId,
                role: { in: ['STAFF', 'TRAINER', 'MANAGER'] }
            }
        });
        res.json(staff);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getStaffById = async (req, res) => {
    try {
        const { id } = req.params;
        const staff = await prisma.user.findUnique({
            where: { id: parseInt(id) }
        });
        if (!staff) return res.status(404).json({ message: 'Staff not found' });
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
        const where = req.user.role === 'SUPER_ADMIN' ? {} : { member: { tenantId: req.user.tenantId } };
        const bookings = await prisma.booking.findMany({
            where,
            include: { member: true, class: true }
        });
        res.json({ data: bookings, total: bookings.length });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getBookingStats = async (req, res) => {
    try {
        const where = req.user.role === 'SUPER_ADMIN' ? {} : { member: { tenantId: req.user.tenantId } };
        const total = await prisma.booking.count({ where });
        const upcoming = await prisma.booking.count({ where: { ...where, status: 'Upcoming' } });
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
        const { tenantId, role } = req.user;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const where = {
            date: { gte: today, lt: tomorrow }
        };
        if (role !== 'SUPER_ADMIN') {
            where.member = { tenantId };
        }

        const bookings = await prisma.booking.findMany({
            where,
            include: { member: true, class: true }
        });
        res.json(bookings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getBookingCalendar = async (req, res) => {
    try {
        const where = req.user.role === 'SUPER_ADMIN' ? {} : { member: { tenantId: req.user.tenantId } };
        const bookings = await prisma.booking.findMany({
            where,
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
        const { tenantId, role } = req.user;
        const { type, search, date, page = 1, limit = 50, status } = req.query;

        const where = role === 'SUPER_ADMIN' ? {} : { tenantId };

        if (type && type !== 'All') {
            if (type === 'Staff') {
                where.type = { in: ['Staff', 'Trainer', 'Manager'] };
            } else if (type === 'Member' || type === 'MEMBER') {
                where.type = 'Member';
            } else {
                where.type = type;
            }
        }

        if (date) {
            const startOfDay = new Date(`${date}T00:00:00`);
            const endOfDay = new Date(`${date}T23:59:59.999`);
            where.checkIn = { gte: startOfDay, lte: endOfDay };
        }

        if (search) {
            where.user = {
                ...where.user,
                name: { contains: search, mode: 'insensitive' }
            };
        }

        if (status) {
            if (status === 'checked-in') {
                where.checkOut = null;
            } else if (status === 'checked-out') {
                where.checkOut = { not: null };
            } else if (status === 'Absent' || status === 'Late') {
                where.status = status;
            }
        }

        const [attendance, total] = await Promise.all([
            prisma.attendance.findMany({
                where,
                include: {
                    user: {
                        include: {
                            // If we want plan details, we need to fetch them. 
                            // Since Member is not directly related in Prisma schema snippet I saw,
                            // we'll handle it in the mapping if needed or fetch members separately.
                        }
                    }
                },
                orderBy: { checkIn: 'desc' },
                skip: (parseInt(page) - 1) * parseInt(limit),
                take: parseInt(limit)
            }),
            prisma.attendance.count({ where })
        ]);

        // Fetch member details for those records that are members to get Plan name
        const memberUserIds = attendance.filter(a => a.type === 'Member').map(a => a.userId);
        const members = await prisma.member.findMany({
            where: { userId: { in: memberUserIds }, tenantId },
            include: { plan: true }
        });

        const mapped = attendance.map(a => {
            const memberData = a.type === 'Member' ? members.find(m => m.userId === a.userId) : null;
            return {
                ...a,
                name: a.user?.name || 'Unknown',
                membershipId: memberData?.memberId || '-',
                plan: memberData?.plan?.name || (a.type === 'Member' ? 'Standard' : '-'),
                shiftTime: a.user?.shift || 'Flexible',
                role: a.user?.role || a.type,
                time: a.checkIn ? new Date(a.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-',
                checkOut: a.checkOut ? new Date(a.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-',
                status: a.checkOut ? 'Checked Out' : 'checked-in',
                avatar: a.user?.avatar,
                photo: a.user?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(a.user?.name || 'U')}&background=6d28d9&color=fff&size=48`
            };
        });

        res.json({ data: mapped, total });
    } catch (error) {
        console.error("getCheckIns Error:", error);
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
        const { tenantId, role } = req.user;
        const where = role === 'SUPER_ADMIN' ? {} : { user: { tenantId } };

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const [currentlyIn, totalToday, membersToday, staffToday] = await Promise.all([
            prisma.attendance.count({
                where: { ...where, checkOut: null }
            }),
            prisma.attendance.count({
                where: { ...where, checkIn: { gte: startOfDay } }
            }),
            prisma.attendance.count({
                where: { ...where, user: { ...where.user, role: 'MEMBER' }, checkIn: { gte: startOfDay } }
            }),
            prisma.attendance.count({
                where: { ...where, user: { ...where.user, role: { in: ['STAFF', 'TRAINER', 'MANAGER'] } }, checkIn: { gte: startOfDay } }
            })
        ]);

        res.json({ currentlyIn, totalToday, membersToday, staffToday });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getLiveCheckIn = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const where = role === 'SUPER_ADMIN' ? { checkOut: null } : { user: { tenantId }, checkOut: null };

        const live = await prisma.attendance.findMany({
            where,
            include: { user: true },
            orderBy: { checkIn: 'desc' }
        });

        // Fetch member details for those records that are members to get Plan name, dues etc.
        const memberUserIds = live.filter(a => a.type === 'Member').map(a => a.userId);
        const members = await prisma.member.findMany({
            where: { userId: { in: memberUserIds }, user: { tenantId } },
            include: { plan: true }
        });

        const mapped = await Promise.all(live.map(async a => {
            const memberData = a.type === 'Member' ? members.find(m => m.userId === a.userId) : null;

            // For dues, we need to sum unpaid invoices for this member
            let duesAmount = 0;
            if (memberData) {
                const dues = await prisma.invoice.aggregate({
                    where: { memberId: memberData.id, status: { in: ['Unpaid', 'Partial'] } },
                    _sum: { amount: true }
                });
                duesAmount = parseFloat(dues._sum.amount || 0);
            }

            return {
                id: a.id,
                member: a.user?.name || 'Unknown',
                name: a.user?.name || 'Unknown', // Support both field names
                type: a.type,
                plan: memberData?.plan?.name || (a.type === 'Member' ? 'Standard' : a.type),
                time: a.checkIn ? new Date(a.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-',
                expiry: memberData?.expiryDate ? memberData.expiryDate.toISOString().split('T')[0] : null,
                balance: duesAmount,
                photo: a.user?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(a.user?.name || 'U')}&background=6d28d9&color=fff&size=48`,
                status: a.checkOut ? 'Checked Out' : 'checked-in'
            };
        }));

        res.json(mapped);
    } catch (error) {
        console.error("getLiveCheckIn Error:", error);
        res.status(500).json({ message: error.message });
    }
};

// --- TASKS ---

const getTasks = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const where = role === 'SUPER_ADMIN' ? {} : { creator: { tenantId } };
        const tasks = await prisma.task.findMany({
            where,
            include: {
                assignedTo: { select: { id: true, name: true } },
                creator: { select: { id: true, name: true } }
            },
            orderBy: { dueDate: 'asc' }
        });

        const formatted = tasks.map(t => ({
            id: t.id,
            title: t.title,
            assignedTo: t.assignedTo?.name || 'Unknown',
            assignedToId: t.assignedToId,
            priority: t.priority,
            dueDate: t.dueDate.toISOString().split('T')[0],
            status: t.status,
            creator: t.creator?.name || 'Admin'
        }));

        res.json({ data: formatted, total: formatted.length });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getTaskStats = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const where = role === 'SUPER_ADMIN' ? {} : { creator: { tenantId } };
        const total = await prisma.task.count({ where });
        const pending = await prisma.task.count({ where: { ...where, status: 'Pending' } });
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
        const data = { ...req.body };

        if (data.dueDate) data.dueDate = new Date(data.dueDate);
        if (data.assignedToId) data.assignedToId = parseInt(data.assignedToId);

        const updated = await prisma.task.update({
            where: { id: parseInt(id) },
            data
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createTask = async (req, res) => {
    try {
        const { title, assignedToId, priority, dueDate, status } = req.body;
        const { id: creatorId } = req.user;

        const newTask = await prisma.task.create({
            data: {
                title,
                priority: priority || 'Medium',
                dueDate: new Date(dueDate),
                assignedToId: parseInt(assignedToId),
                creatorId,
                status: status || 'Pending'
            },
            include: { assignedTo: true }
        });

        res.status(201).json(newTask);
    } catch (error) {
        console.error("Task Creation Error:", error);
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
        const { tenantId, role } = req.user;
        const where = role === 'SUPER_ADMIN' ? {} : { member: { tenantId } };
        const bookings = await prisma.booking.findMany({
            where,
            include: { member: true, class: true }
        });
        res.json(bookings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getAttendanceReport = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const where = role === 'SUPER_ADMIN' ? {} : { user: { tenantId } };
        const attendance = await prisma.attendance.findMany({
            where,
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
        const { tenantId, role } = req.user;
        const where = role === 'SUPER_ADMIN' ? {} : { tenantId };
        const totalMembers = await prisma.member.count({ where });
        const activePlans = await prisma.member.count({ where: { ...where, status: 'Active' } });

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
        const where = req.user.role === 'SUPER_ADMIN' ? {} : { tenantId: req.user.tenantId };
        const plans = await prisma.membershipPlan.findMany({
            where
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
        const where = req.user.role === 'SUPER_ADMIN' ? {} : { tenantId: req.user.tenantId };
        const classes = await prisma.class.findMany({
            where,
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
const { getIO } = require('../utils/socket');

const getAnnouncements = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const where = role === 'SUPER_ADMIN' ? {} : { tenantId };
        const announcements = await prisma.announcement.findMany({
            where,
            include: { author: { select: { name: true } } },
            orderBy: { createdAt: 'desc' }
        });
        res.json(announcements);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createAnnouncement = async (req, res) => {
    try {
        const { tenantId, id: authorId } = req.user;
        const { title, content, priority, targetRole } = req.body;
        const newAnnouncement = await prisma.announcement.create({
            data: {
                tenantId,
                authorId,
                title,
                content,
                priority: priority || 'medium',
                targetRole: targetRole || 'all'
            }
        });
        res.json({ message: 'Announcement created successfully', announcement: newAnnouncement });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getChats = async (req, res) => {
    try {
        const { id: userId } = req.user;
        const conversations = await prisma.conversation.findMany({
            where: {
                participants: { some: { id: userId } }
            },
            include: {
                participants: {
                    where: { id: { not: userId } },
                    select: { id: true, name: true, role: true, avatar: true }
                }
            },
            orderBy: { updatedAt: 'desc' }
        });

        // Format for frontend
        const formatted = conversations.map(c => ({
            id: c.id,
            name: c.participants[0]?.name || 'Unknown',
            role: c.participants[0]?.role || 'N/A',
            lastMsg: c.lastMessage || 'Start a conversation...',
            time: c.updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            unread: 0, // In real world, we would track unread count
            status: 'offline', // Placeholder
            avatar: c.participants[0]?.avatar || (c.participants[0]?.name || 'U').charAt(0),
            receiverId: c.participants[0]?.id
        }));

        res.json(formatted);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getMessages = async (req, res) => {
    try {
        const { id: conversationId } = req.params;
        const messages = await prisma.chatMessage.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'asc' }
        });

        const formatted = messages.map(m => ({
            id: m.id,
            text: m.content,
            time: m.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            senderId: m.senderId,
            sentBy: m.senderId === req.user.id ? 'staff' : 'member' // staff = me, member = them in frontend context
        }));

        res.json(formatted);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const sendMessage = async (req, res) => {
    try {
        const { id: userId, tenantId } = req.user;
        const { id: routeId } = req.params;
        const { receiverId, text, conversationId: bodyId } = req.body;

        // If the route passes 'new', it means we don't have a conversation ID yet
        let conversationId = (routeId !== 'new' && routeId !== 'undefined' && routeId) ? routeId : bodyId;

        if (!conversationId && receiverId) {
            // Find or create conversation
            const existingConv = await prisma.conversation.findFirst({
                where: {
                    participants: {
                        every: { id: { in: [userId, parseInt(receiverId)] } }
                    }
                }
            });

            if (existingConv) {
                conversationId = existingConv.id;
            } else {
                const newConv = await prisma.conversation.create({
                    data: {
                        tenantId: tenantId || null,
                        participants: {
                            connect: [{ id: parseInt(userId) }, { id: parseInt(receiverId) }]
                        }
                    }
                });
                conversationId = newConv.id;
            }
        }

        if (!conversationId) {
            return res.status(400).json({ message: 'Conversation or Receiver ID required' });
        }

        const message = await prisma.chatMessage.create({
            data: {
                conversationId: conversationId,
                senderId: parseInt(userId),
                content: text
            }
        });

        await prisma.conversation.update({
            where: { id: conversationId },
            data: { lastMessage: text }
        });

        // Emit Socket.io event
        const io = getIO();
        const receiver = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: { participants: { where: { id: { not: userId } } } }
        });

        const targetId = receiver.participants[0]?.id;
        if (targetId) {
            io.to(targetId.toString()).emit('new_message', {
                id: message.id,
                conversationId,
                text: text,
                senderId: userId,
                time: message.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                sentBy: 'member' // In receiver's perspective, it's 'them'
            });
        }

        res.json({ success: true, message: 'Message sent', data: message });
    } catch (error) {
        console.error("Chat Error:", error);
        res.status(500).json({ message: error.message });
    }
};

const getChatUsers = async (req, res) => {
    try {
        const { tenantId, role, id: userId } = req.user;
        let users = [];

        if (role === 'SUPER_ADMIN') {
            users = await prisma.user.findMany({
                where: {
                    role: { in: ['BRANCH_ADMIN', 'MANAGER'] },
                    id: { not: userId },
                    status: 'Active'
                },
                select: { id: true, name: true, role: true, avatar: true }
            });
        } else {
            const tenantUsers = await prisma.user.findMany({
                where: {
                    tenantId,
                    id: { not: userId },
                    status: 'Active'
                },
                select: { id: true, name: true, role: true, avatar: true }
            });

            const superAdmins = await prisma.user.findMany({
                where: { role: 'SUPER_ADMIN', status: 'Active' },
                select: { id: true, name: true, role: true, avatar: true }
            });

            users = [...tenantUsers, ...superAdmins];
        }

        res.json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createPayroll = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { staffId, amount, month, year, status, incentives, deductions } = req.body;

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
                incentives: parseFloat(incentives || 0),
                deductions: parseFloat(deductions || 0),
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
        const { tenantId, role } = req.user;
        const where = role === 'SUPER_ADMIN' ? {} : { tenantId };
        const history = await prisma.payroll.findMany({
            where,
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

        res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- LEAVE MANAGEMENT ---
const getLeaveRequests = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const where = role === 'SUPER_ADMIN' ? {} : { tenantId };
        const requests = await prisma.leaveRequest.findMany({
            where,
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
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            include: { settings: true }
        });

        if (!tenant) {
            return res.status(404).json({ message: 'Branch not found' });
        }

        let settings = tenant.settings;
        if (!settings) {
            settings = await prisma.tenantSettings.create({
                data: { tenantId }
            });
        }

        res.json({
            id: settings.id,
            tenantId: tenant.id,
            name: tenant.name || '',
            address: tenant.location || '',
            phone: tenant.phone || '',
            email: tenant.email || '',
            logoUrl: settings.logo || '',
            timezone: settings.timezone || 'UTC',
            currency: settings.currency || 'USD',
            whatsappEnabled: settings.whatsappEnabled || false,
            openingHours: settings.openingHours || '',
            wifiPassword: settings.wifiPassword || '',
            ...settings
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateTenantSettings = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { name, address, phone, email, logoUrl, timezone, currency, openingHours, wifiPassword, whatsappEnabled, ...otherSettings } = req.body;

        // Update Tenant Table
        const updatedTenant = await prisma.tenant.update({
            where: { id: tenantId },
            data: {
                name: name,
                location: address,
                phone: phone,
                email: email
            }
        });

        // Update TenantSettings Table
        const updatedSettings = await prisma.tenantSettings.upsert({
            where: { tenantId },
            update: {
                logo: logoUrl,
                timezone,
                currency,
                openingHours,
                wifiPassword,
                whatsappEnabled
                // other settings can be added here if needed
            },
            create: {
                tenantId,
                logo: logoUrl,
                timezone,
                currency,
                openingHours,
                wifiPassword,
                whatsappEnabled
            }
        });

        res.json({
            message: 'Settings updated successfully',
            name: updatedTenant.name,
            address: updatedTenant.location,
            phone: updatedTenant.phone,
            email: updatedTenant.email,
            logoUrl: updatedSettings.logo,
            timezone: updatedSettings.timezone,
            currency: updatedSettings.currency,
            openingHours: updatedSettings.openingHours,
            wifiPassword: updatedSettings.wifiPassword
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getRenewalAlerts = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { type, search } = req.query; // type: 'expiring' or 'expired'

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let where = { tenantId };

        if (type === 'expiring') {
            const sevenDaysLater = new Date(today);
            sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

            where.expiryDate = {
                gte: today,
                lte: sevenDaysLater
            };
            where.status = { not: 'Expired' };
        } else if (type === 'expired') {
            const fifteenDaysAgo = new Date(today);
            fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

            where.expiryDate = {
                gte: fifteenDaysAgo,
                lt: today
            };
        }

        if (search) {
            where.OR = [
                { name: { contains: search } },
                { phone: { contains: search } }
            ];
        }

        const members = await prisma.member.findMany({
            where,
            include: {
                plan: { select: { name: true } }
            },
            orderBy: { expiryDate: 'asc' }
        });

        const formatted = members.map(m => ({
            id: m.id,
            memberName: m.name || 'N/A',
            phone: m.phone || 'N/A',
            planName: m.plan?.name || 'No Plan',
            joinDate: m.joinDate.toISOString().split('T')[0],
            endDate: m.expiryDate ? m.expiryDate.toISOString().split('T')[0] : 'N/A',
            status: m.status
        }));

        res.json(formatted);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const renewMembership = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { memberId, planId, duration } = req.body;

        const plan = await prisma.membershipPlan.findUnique({
            where: { id: parseInt(planId) }
        });

        if (!plan) return res.status(404).json({ message: 'Plan not found' });

        const today = new Date();
        const expiryDate = new Date(today);
        expiryDate.setMonth(expiryDate.getMonth() + parseInt(duration));

        const updatedMember = await prisma.member.update({
            where: { id: parseInt(memberId) },
            data: {
                planId: parseInt(planId),
                expiryDate,
                joinDate: today, // Reset start date for benefit cycle tracking
                status: 'Active'
            }
        });

        await prisma.invoice.create({
            data: {
                tenantId,
                invoiceNumber: `REN-${Date.now()}`,
                memberId: parseInt(memberId),
                amount: parseFloat(plan.price) * parseInt(duration),
                paymentMode: 'Cash',
                status: 'Unpaid',
                dueDate: new Date()
            }
        });

        res.json({ message: 'Membership renewed successfully', member: updatedMember });
    } catch (error) {
        console.error("Renewal Error:", error);
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
    getStaffById,
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
    getRenewalAlerts,
    renewMembership,
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
    getChatUsers,
    createPayroll,
    getPayrollHistory,
    updatePayrollStatus,
    getProfile,
    updateProfile,
    changePassword,
    getLeaveRequests,
    updateLeaveStatus,
    getTenantSettings,
    updateTenantSettings
};
