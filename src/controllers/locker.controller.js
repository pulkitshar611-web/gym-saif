const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get all lockers for a tenant
const getAllLockers = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const { branchId, search, status } = req.query;

        const where = {};
        if (role !== 'SUPER_ADMIN') {
            where.tenantId = tenantId;
        } else if (branchId && branchId !== 'all') {
            where.tenantId = parseInt(branchId);
        }

        if (status && status !== 'All') {
            where.status = status;
        }

        if (search) {
            where.OR = [
                { number: { contains: search } },
                { area: { contains: search } },
                { assignedTo: { name: { contains: search } } }
            ];
        }

        const lockers = await prisma.locker.findMany({
            where,
            include: {
                assignedTo: {
                    select: {
                        id: true,
                        name: true,
                        memberId: true,
                        phone: true,
                        expiryDate: true,
                        status: true
                    }
                }
            },
            orderBy: { number: 'asc' }
        });

        res.json(lockers);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get Locker Stats
const getLockerStats = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const { branchId } = req.query;

        const where = {};
        if (role !== 'SUPER_ADMIN') {
            where.tenantId = tenantId;
        } else if (branchId && branchId !== 'all') {
            where.tenantId = parseInt(branchId);
        }

        const stats = await prisma.locker.groupBy({
            by: ['status'],
            where,
            _count: {
                id: true
            }
        });

        const total = await prisma.locker.count({ where });

        const formattedStats = {
            total,
            available: stats.find(s => s.status === 'Available')?._count.id || 0,
            assigned: stats.find(s => s.status === 'Assigned')?._count.id || 0,
            maintenance: stats.find(s => s.status === 'Maintenance')?._count.id || 0,
            reserved: stats.find(s => s.status === 'Reserved')?._count.id || 0,
            occupancyRate: total > 0 ? Math.round(((stats.find(s => s.status === 'Assigned')?._count.id || 0) / total) * 100) : 0
        };

        res.json(formattedStats);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Add new locker
const addLocker = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const { number, size, area, notes, isChargeable, status } = req.body;

        const locker = await prisma.locker.create({
            data: {
                tenantId: role === 'SUPER_ADMIN' ? (req.body.tenantId ? parseInt(req.body.tenantId) : null) : tenantId,
                number,
                size: size || 'Medium',
                area,
                notes,
                isChargeable: isChargeable || false,
                status: status || 'Available'
            }
        });

        res.status(201).json(locker);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Bulk Create Lockers
const bulkCreateLockers = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const { prefix, startNumber, endNumber, size, isChargeable, area } = req.body;

        const currentTenantId = role === 'SUPER_ADMIN' ? (req.body.tenantId ? parseInt(req.body.tenantId) : null) : tenantId;

        const lockersData = [];
        for (let i = parseInt(startNumber); i <= parseInt(endNumber); i++) {
            const num = i.toString().padStart(3, '0');
            lockersData.push({
                number: `${prefix}${num}`,
                size: size || 'Medium',
                isChargeable: isChargeable || false,
                area: area || '',
                status: 'Available',
                tenantId: currentTenantId
            });
        }

        await prisma.locker.createMany({
            data: lockersData
        });

        res.status(201).json({ message: `${lockersData.length} lockers created successfully` });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Assign locker to member
const assignLocker = async (req, res) => {
    try {
        const { id } = req.params; // locker db id
        const { memberId } = req.body;
        const { tenantId, role } = req.user;

        const updateData = {
            status: 'Assigned',
            assignedToId: parseInt(memberId)
        };

        const locker = await prisma.locker.update({
            where: { id: parseInt(id) },
            data: updateData
        });

        res.json(locker);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Release locker
const releaseLocker = async (req, res) => {
    try {
        const { id } = req.params;
        const { tenantId, role } = req.user;

        const locker = await prisma.locker.update({
            where: { id: parseInt(id) },
            data: {
                status: 'Available',
                assignedToId: null
            }
        });

        res.json(locker);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Maintenance mode
const toggleMaintenance = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // 'Maintenance' or 'Available'

        const locker = await prisma.locker.update({
            where: { id: parseInt(id) },
            data: {
                status: status === 'Maintenance' ? 'Maintenance' : 'Available'
            }
        });

        res.json(locker);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Delete locker
const deleteLocker = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.locker.delete({
            where: { id: parseInt(id) }
        });
        res.json({ message: 'Locker deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getAllLockers,
    getLockerStats,
    addLocker,
    bulkCreateLockers,
    assignLocker,
    releaseLocker,
    toggleMaintenance,
    deleteLocker
};
