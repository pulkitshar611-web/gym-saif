const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getAllLockers = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const where = {};
        if (role !== 'SUPER_ADMIN') {
            where.tenantId = tenantId;
        }

        const lockers = await prisma.locker.findMany({
            where,
            orderBy: { id: 'asc' }
        });

        const formattedLockers = lockers.map(locker => ({
            id: locker.number,
            dbId: locker.id,
            status: locker.status,
            member: locker.assignedToId ? `Member ${locker.assignedToId}` : null // Ideally join to get member name
        }));

        res.json(formattedLockers);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.addLocker = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const { number, status } = req.body;

        const newLocker = await prisma.locker.create({
            data: {
                tenantId: role === 'SUPER_ADMIN' ? null : tenantId,
                number,
                status: status || 'Available'
            }
        });

        res.status(201).json(newLocker);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.assignLocker = async (req, res) => {
    try {
        const { id } = req.params;
        const { memberName } = req.body;
        const { tenantId, role } = req.user;

        const where = { number: id };
        if (role !== 'SUPER_ADMIN') {
            where.tenantId = tenantId;
        }

        // We use updateMany because number is not @unique but it is practically unique
        await prisma.locker.updateMany({
            where,
            data: {
                status: 'Occupied',
                assignedToId: parseInt(memberName) || 1 // simplified mock link for UI
            }
        });

        res.json({ message: 'Locker assigned successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.releaseLocker = async (req, res) => {
    try {
        const { id } = req.params;
        const { tenantId, role } = req.user;

        const where = { number: id };
        if (role !== 'SUPER_ADMIN') {
            where.tenantId = tenantId;
        }

        await prisma.locker.updateMany({
            where,
            data: {
                status: 'Available',
                assignedToId: null
            }
        });

        res.json({ message: 'Locker released successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.deleteLocker = async (req, res) => {
    try {
        const { id } = req.params;
        const { tenantId, role } = req.user;

        const where = { number: id };
        if (role !== 'SUPER_ADMIN') {
            where.tenantId = tenantId;
        }

        await prisma.locker.deleteMany({
            where
        });

        res.json({ message: 'Locker deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
