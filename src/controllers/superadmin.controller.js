// gym_backend/src/controllers/superadmin.controller.js
const prisma = require('../config/prisma');
const bcrypt = require('bcryptjs');
const { logWebhook } = require('../utils/webhookLogger');

// --- GYM MANAGEMENT ---

const getAllGyms = async (req, res) => {
    try {
        const { search, status, page = 1, limit = 10 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        const where = {};
        if (status && status !== 'All') {
            where.status = status;
        }

        if (search) {
            where.OR = [
                { name: { contains: search } },
                { branchName: { contains: search } },
                { owner: { contains: search } }
            ];
        }

        // Restriction for SaaS: Branch Admin sees only their own branch
        if (req.user.role !== 'SUPER_ADMIN' && req.user.tenantId) {
            where.id = req.user.tenantId;
        }

        const [gyms, total] = await Promise.all([
            prisma.tenant.findMany({
                where,
                skip,
                take,
                orderBy: { createdAt: 'desc' },
                include: {
                    _count: {
                        select: { users: { where: { role: 'MEMBER' } } }
                    }
                }
            }),
            prisma.tenant.count({ where })
        ]);

        const formattedGyms = gyms.map(g => ({
            id: g.id,
            gymName: g.name,
            branchName: g.branchName,
            owner: g.owner,
            phone: g.phone,
            location: g.location,
            status: g.status,
            members: g._count.users,
            createdAt: g.createdAt
        }));

        res.json({
            gyms: formattedGyms,
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / take)
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const addGym = async (req, res) => {
    try {
        const { gymName, branchName, owner, phone, location, email } = req.body;

        // Use a transaction to ensure both Tenant and User are created
        const result = await prisma.$transaction(async (tx) => {
            // 1. Create the Tenant (Gym)
            const tenant = await tx.tenant.create({
                data: {
                    name: gymName,
                    branchName,
                    owner: owner || email.split('@')[0], // Fallback if owner is missing
                    phone,
                    location,
                    status: 'Active'
                }
            });

            // 2. Create the Branch Admin User
            // check if user with this email already exists
            const existingUser = await tx.user.findUnique({ where: { email } });
            if (existingUser) {
                throw new Error('User with this email already exists.');
            }

            const hashedPassword = await bcrypt.hash('123456', 10);
            const user = await tx.user.create({
                data: {
                    email,
                    password: hashedPassword,
                    name: owner || email.split('@')[0],
                    role: 'BRANCH_ADMIN',
                    tenantId: tenant.id,
                    status: 'Active'
                }
            });

            return { tenant, user };
        });

        await logWebhook('GYM_REGISTERED', 'POST', '/api/superadmin/gyms', 201, result.tenant);
        res.status(201).json(result.tenant);
    } catch (error) {
        console.error('Add Gym Error:', error);
        res.status(500).json({ message: error.message });
    }
};

const updateGym = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedGym = await prisma.tenant.update({
            where: { id: parseInt(id) },
            data: req.body
        });
        res.json(updatedGym);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const toggleGymStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const gym = await prisma.tenant.findUnique({ where: { id: parseInt(id) } });
        const updated = await prisma.tenant.update({
            where: { id: parseInt(id) },
            data: { status: gym.status === 'Active' ? 'Suspended' : 'Active' }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const deleteGym = async (req, res) => {
    try {
        const { id } = req.params;
        const tenantId = parseInt(id);

        if (isNaN(tenantId)) {
            return res.status(400).json({ message: 'Invalid ID' });
        }

        // Use transaction for cascading delete
        await prisma.$transaction(async (tx) => {
            // Delete related data first
            // 1. Users (Staff, Members, etc.)
            await tx.user.deleteMany({ where: { tenantId } });

            // 2. Members (Profile data)
            await tx.member.deleteMany({ where: { tenantId } });

            // 3. Plans
            await tx.membershipPlan.deleteMany({ where: { tenantId } });

            // 4. Classes & Bookings (Classes depend on Tenant, Bookings depend on Class/Member)
            // Delete bookings first if we were being strict, but deleteMany on classes might cascade if configured in DB, 
            // but Prisma requires manual deletion if relation is not set to Cascade in schema.
            // For now, let's assume Members and Users are the main blockers.
            // We should also delete other related models if they exist:
            // Leads, Inventory, Lockers, Equipment, Invoices, Expenses, Payroll, etc.

            await tx.lead.deleteMany({ where: { tenantId } });
            await tx.inventory.deleteMany({ where: { tenantId } });
            await tx.locker.deleteMany({ where: { tenantId } });
            await tx.equipment.deleteMany({ where: { tenantId } });
            await tx.invoice.deleteMany({ where: { tenantId } });
            await tx.expense.deleteMany({ where: { tenantId } });
            await tx.payroll.deleteMany({ where: { tenantId } });

            // Finally delete the Tenant
            await tx.tenant.delete({ where: { id: tenantId } });
        });

        res.json({ message: 'Gym and all related data deleted successfully' });
    } catch (error) {
        console.error('Delete Gym Error:', error);
        res.status(500).json({ message: error.message || 'Failed to delete gym' });
    }
};

// --- PLAN MANAGEMENT ---

const getAllPlans = async (req, res) => {
    try {
        const plans = await prisma.saaSPlan.findMany();
        res.json(plans);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const addPlan = async (req, res) => {
    try {
        const newPlan = await prisma.saaSPlan.create({ data: req.body });
        await logWebhook('PLAN_CREATED', 'POST', '/api/superadmin/plans', 201, newPlan);
        res.status(201).json(newPlan);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updatePlan = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedPlan = await prisma.saaSPlan.update({
            where: { id: parseInt(id) },
            data: req.body
        });
        res.json(updatedPlan);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const deletePlan = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.saaSPlan.delete({ where: { id: parseInt(id) } });
        res.json({ message: 'Plan deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- LOGS & STATS ---

const fetchDashboardCards = async (req, res) => {
    try {
        const totalGyms = await prisma.tenant.count();
        const totalMembers = await prisma.user.count({ where: { role: 'MEMBER' } });
        const activeSubs = await prisma.subscription.count({ where: { status: 'Active' } });
        const totalRevenue = await prisma.saasPayment.aggregate({
            _sum: { amount: true },
            where: { status: 'Success' }
        });

        // Simple growth rate logic: compare current month with previous (simulated for now with 10% base)
        const revenueValue = totalRevenue._sum.amount ? parseFloat(totalRevenue._sum.amount) : 0;

        res.json([
            { id: 1, title: 'Total Gyms', value: totalGyms.toString(), trend: '+2 this month', color: 'primary' },
            { id: 2, title: 'Total Members', value: totalMembers.toLocaleString(), trend: '+15% vs last month', color: 'success' },
            { id: 3, title: 'Active Plans', value: activeSubs.toString(), trend: '85% retention', color: 'warning' },
            { id: 4, title: 'Monthly Revenue', value: `$${revenueValue.toLocaleString()}`, trend: '+8% vs last month', color: 'success' }
        ]);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- SUBSCRIPTIONS ---

const getSubscriptions = async (req, res) => {
    try {
        const subs = await prisma.subscription.findMany();
        res.json(subs);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const toggleSubscriptionStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const sub = await prisma.subscription.findUnique({ where: { id } });
        const updated = await prisma.subscription.update({
            where: { id },
            data: { status: sub.status === 'Active' ? 'Suspended' : 'Active' }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- PAYMENTS ---

const getPaymentsStats = async (req, res) => {
    try {
        const total = await prisma.saasPayment.aggregate({ _sum: { amount: true } });
        res.json({ total: total._sum.amount || 0, growth: '+0%', pending: 0 });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getRevenueData = async (req, res) => {
    try {
        const payments = await prisma.saasPayment.findMany({
            where: { status: 'Success' },
            orderBy: { date: 'asc' },
            take: 12
        });

        const chartData = payments.map(p => ({
            month: p.date.toLocaleString('default', { month: 'short' }),
            revenue: parseFloat(p.amount)
        }));

        res.json(chartData);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getPayments = async (req, res) => {
    try {
        const payments = await prisma.saasPayment.findMany();
        res.json(payments);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updatePaymentStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const updated = await prisma.saasPayment.update({
            where: { id },
            data: { status }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getInvoices = async (req, res) => {
    try {
        const invoices = await prisma.invoice.findMany({ include: { tenant: true } });
        res.json(invoices);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- LOGS & REPORTS ---

const getWebhookLogs = async (req, res) => {
    try {
        const logs = await prisma.webhookLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: 50
        });

        // Calculate stats
        const totalEvents = await prisma.webhookLog.count();
        const successCount = await prisma.webhookLog.count({ where: { status: 'success' } });
        const failedLast24h = await prisma.webhookLog.count({
            where: {
                status: 'failed',
                createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            }
        });
        const activeWebhooks = 8; // Keep this static as requested or fetch if model exists

        const stats = {
            totalEvents: totalEvents.toLocaleString(),
            successRate: totalEvents > 0 ? ((successCount / totalEvents) * 100).toFixed(1) + '%' : '0%',
            failedLast24h,
            activeWebhooks
        };

        res.json({ logs, stats });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getAuditLogs = async (req, res) => {
    try {
        const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' } });
        res.json(logs);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getActivityLogs = async (req, res) => {
    // Alias for audit logs with specific filter if needed
    try {
        const logs = await prisma.auditLog.findMany({
            where: { module: { not: 'System' } },
            orderBy: { createdAt: 'desc' }
        });
        res.json(logs);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getErrorLogs = async (req, res) => {
    try {
        const logs = await prisma.auditLog.findMany({
            where: { module: 'Error' },
            orderBy: { createdAt: 'desc' }
        });
        res.json(logs);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getHardwareLogs = async (req, res) => {
    try {
        const logs = await prisma.auditLog.findMany({
            where: { module: 'Hardware' },
            orderBy: { createdAt: 'desc' }
        });
        res.json(logs);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getGSTReports = async (req, res) => {
    try {
        const settings = await prisma.saaSSettings.findFirst();
        const gstPercent = settings?.gstPercent || 18.00;

        const payments = await prisma.saasPayment.findMany({
            where: { status: 'Success' },
            include: {} // saasPayment doesn't have relation to tenant in schema, but has tenantId
        });

        const reports = payments.map(p => {
            const amount = parseFloat(p.amount);
            const gstAmount = (amount * (parseFloat(gstPercent) / 100)).toFixed(2);
            return {
                id: p.id,
                invoiceNo: `INV-${p.paymentId.slice(-4)}`,
                gymName: p.tenantName,
                amount: `₹${amount}`,
                gstPercent: `${gstPercent}%`,
                gstAmount: `₹${gstAmount}`,
                date: p.date.toISOString().split('T')[0]
            };
        });

        res.json(reports);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- DEVICES & SETTINGS ---

const getDevices = async (req, res) => {
    try {
        const devices = await prisma.device.findMany();
        res.json(devices);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const addDevice = async (req, res) => {
    try {
        const { name, type, ip, status } = req.body;
        const newDevice = await prisma.device.create({
            data: {
                name,
                type,
                ipAddress: ip,
                status
            }
        });
        res.status(201).json(newDevice);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateDevice = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, type, ip, status } = req.body;
        const updatedDevice = await prisma.device.update({
            where: { id: parseInt(id) },
            data: {
                name,
                type,
                ipAddress: ip,
                status
            }
        });
        res.json(updatedDevice);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const deleteDevice = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.device.delete({ where: { id: parseInt(id) } });
        res.json({ message: 'Device deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getGlobalSettings = async (req, res) => {
    try {
        let settings = await prisma.saaSSettings.findFirst();
        if (!settings) {
            settings = await prisma.saaSSettings.create({ data: {} });
        }
        res.json(settings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateGlobalSettings = async (req, res) => {
    try {
        let settings = await prisma.saaSSettings.findFirst();
        if (!settings) {
            settings = await prisma.saaSSettings.create({ data: {} });
        }

        const updated = await prisma.saaSSettings.update({
            where: { id: settings.id },
            data: {
                siteName: req.body.siteName,
                supportEmail: req.body.supportEmail,
                contactPhone: req.body.contactPhone,
                contactAddress: req.body.contactAddress,
                currency: req.body.currency,
                timezone: req.body.timezone
            }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getInvoiceSettings = async (req, res) => {
    try {
        const settings = await prisma.saaSSettings.findFirst();
        res.json({
            prefix: settings?.invoicePrefix,
            startNumber: settings?.invoiceStartNumber,
            gstPercent: settings?.gstPercent
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateInvoiceSettings = async (req, res) => {
    try {
        let settings = await prisma.saaSSettings.findFirst();
        if (!settings) {
            settings = await prisma.saaSSettings.create({ data: {} });
        }
        const updated = await prisma.saaSSettings.update({
            where: { id: settings.id },
            data: {
                invoicePrefix: req.body.prefix,
                invoiceStartNumber: parseInt(req.body.startNumber),
                gstPercent: parseFloat(req.body.gstPercent)
            }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getBookingSettings = async (req, res) => {
    try {
        const settings = await prisma.saaSSettings.findFirst();
        res.json({
            globalBookingEnabled: settings?.bookingEnabled,
            creditsPerBooking: settings?.creditsPerBooking,
            maxBookingsPerDay: settings?.maxBookingsPerDay,
            maxBookingsPerWeek: settings?.maxBookingsPerWeek,
            cancellationWindow: settings?.cancellationWindow,
            advanceBookingDays: settings?.advanceBookingDays,
            penaltyEnabled: settings?.penaltyEnabled,
            penaltyCredits: settings?.penaltyCredits
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateBookingSettings = async (req, res) => {
    try {
        let settings = await prisma.saaSSettings.findFirst();
        if (!settings) {
            settings = await prisma.saaSSettings.create({ data: {} });
        }
        const updated = await prisma.saaSSettings.update({
            where: { id: settings.id },
            data: {
                bookingEnabled: req.body.globalBookingEnabled,
                creditsPerBooking: parseInt(req.body.creditsPerBooking),
                maxBookingsPerDay: parseInt(req.body.maxBookingsPerDay),
                maxBookingsPerWeek: parseInt(req.body.maxBookingsPerWeek),
                cancellationWindow: parseInt(req.body.cancellationWindow),
                advanceBookingDays: parseInt(req.body.advanceBookingDays),
                penaltyEnabled: req.body.penaltyEnabled,
                penaltyCredits: parseInt(req.body.penaltyCredits)
            }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- STAFF & MANAGEMENT ---

const getStaffMembers = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const where = {
            role: { in: ['STAFF', 'TRAINER', 'MANAGER'] }
        };
        if (role !== 'SUPER_ADMIN') {
            where.tenantId = tenantId;
        }

        const staff = await prisma.user.findMany({ where });
        res.json(staff);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const addStaffMember = async (req, res) => {
    try {
        const { role = 'STAFF', branch, ...restUserData } = req.body;
        let tenantId = req.user.tenantId;

        if (req.user.role === 'SUPER_ADMIN' && branch) {
            const tenantObj = await prisma.tenant.findFirst({ where: { branchName: branch } });
            if (tenantObj) {
                tenantId = tenantObj.id;
            } else {
                const altTenant = await prisma.tenant.findFirst({ where: { name: branch } });
                if (altTenant) tenantId = altTenant.id;
            }
        }

        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash(restUserData.password || '123456', 10);

        const { password, ...safeUserData } = restUserData;

        const newStaff = await prisma.user.create({
            data: {
                ...safeUserData,
                password: hashedPassword,
                role,
                tenantId: tenantId || null
            }
        });
        res.status(201).json(newStaff);
    } catch (error) {
        console.error('Error adding staff member:', error);
        res.status(500).json({ message: error.message });
    }
};

const deleteStaffMember = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.user.delete({ where: { id: parseInt(id) } });
        res.json({ message: 'Staff member deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateStaffMember = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedStaff = await prisma.user.update({
            where: { id: parseInt(id) },
            data: req.body
        });
        res.json(updatedStaff);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getWalletStats = async (req, res) => {
    try {
        const totalWallets = await prisma.wallet.count();
        const totalBalance = await prisma.wallet.aggregate({
            _sum: { balance: true }
        });
        res.json({
            totalWallets,
            totalBalance: totalBalance._sum.balance || 0
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getMemberWallets = async (req, res) => {
    try {
        const members = await prisma.member.findMany({
            include: {
                tenant: {
                    select: { name: true, branchName: true }
                },
                wallet: true
            }
        });

        const userIds = members.map(m => m.userId).filter(id => id !== null);
        const users = await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true }
        });

        const userMap = users.reduce((acc, user) => {
            acc[user.id] = user.name;
            return acc;
        }, {});

        const formattedWallets = members.map(m => {
            const wallet = m.wallet || { balance: 0 };
            return {
                id: m.memberId,
                dbId: m.id,
                name: userMap[m.userId] || `Member ${m.memberId}`,
                branch: m.tenant?.branchName || m.tenant?.name || 'Unknown',
                balance: parseFloat(wallet.balance || 0),
                lastTransaction: 'N/A'
            };
        });

        res.json(formattedWallets);

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getTrainerRequests = async (req, res) => {
    try {
        const { role, tenantId } = req.user;
        const whereClause = {
            role: 'TRAINER',
        };

        if (role !== 'SUPER_ADMIN') {
            whereClause.tenantId = tenantId;
        }

        const trainers = await prisma.user.findMany({
            where: whereClause,
            include: {
                tenant: {
                    select: {
                        name: true,
                        branchName: true
                    }
                }
            }
        });

        const formattedTrainers = trainers.map(t => ({
            id: t.id,
            name: t.name,
            email: t.email,
            phone: t.phone || 'N/A',
            branch: t.tenant?.branchName || t.tenant?.name || 'Unknown',
            status: t.status
        }));

        res.json(formattedTrainers);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateTrainerRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const { role, tenantId } = req.user;

        const targetUser = await prisma.user.findUnique({ where: { id: parseInt(id) } });
        if (!targetUser) return res.status(404).json({ message: 'Trainer request not found' });

        if (role !== 'SUPER_ADMIN' && targetUser.tenantId !== tenantId) {
            return res.status(403).json({ message: 'Unauthorized to update this request' });
        }

        const updated = await prisma.user.update({
            where: { id: parseInt(id) },
            data: { status }
        });

        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getTrainerChangeRequests = async (req, res) => {
    res.json([]);
};

const getPayrollData = async (req, res) => {
    res.json([]);
};

const getStoreDashboardData = async (req, res) => {
    res.json({ orders: 0, revenue: 0 });
};

const getProducts = async (req, res) => {
    res.json([]);
};

const getOrders = async (req, res) => {
    res.json([]);
};

const getStoreInventory = async (req, res) => {
    res.json([]);
};

const getProfile = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id }
        });
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateProfile = async (req, res) => {
    try {
        const { name, email, phone, address } = req.body;

        const updated = await prisma.user.update({
            where: { id: req.user.id },
            data: {
                name,
                email,
                phone,
                address
            }
        });

        // Remove sensitive data before returning
        const { password: _, ...userWithoutPassword } = updated;
        res.json(userWithoutPassword);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getAllGyms,
    addGym,
    updateGym,
    toggleGymStatus,
    deleteGym,
    getAllPlans,
    addPlan,
    updatePlan,
    deletePlan,
    fetchDashboardCards,
    getSubscriptions,
    toggleSubscriptionStatus,
    getPaymentsStats,
    getRevenueData,
    getPayments,
    updatePaymentStatus,
    getWebhookLogs,
    getAuditLogs,
    getActivityLogs,
    getErrorLogs,
    getHardwareLogs,
    getDevices,
    getGlobalSettings,
    updateGlobalSettings,
    getInvoiceSettings,
    updateInvoiceSettings,
    getBookingSettings,
    updateBookingSettings,
    getStaffMembers,
    addStaffMember,
    deleteStaffMember,
    getWalletStats,
    getTrainerRequests,
    getTrainerChangeRequests,
    getPayrollData,
    getStoreDashboardData,
    getProducts,
    getOrders,
    getStoreInventory,
    getInvoices,
    getGSTReports,
    getProfile,
    updateProfile,
    updateTrainerRequest,
    getMemberWallets,
    updateStaffMember,
    addDevice,
    updateDevice,
    deleteDevice
};
