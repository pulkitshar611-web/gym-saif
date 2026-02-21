const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getAllAnnouncements = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const where = {};
        if (role !== 'SUPER_ADMIN') {
            where.tenantId = tenantId;
        }

        const announcements = await prisma.announcement.findMany({
            where,
            orderBy: { createdAt: 'desc' }
        });

        // Format for frontend
        const formatted = announcements.map(a => ({
            id: a.id,
            title: a.title,
            message: a.content,
            date: new Date(a.createdAt).toLocaleDateString(),
            priority: a.priority,
            targetAudience: a.targetRole
        }));

        res.json(formatted);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.addAnnouncement = async (req, res) => {
    try {
        const { tenantId, role, id } = req.user;
        const { title, message, priority, targetAudience } = req.body;

        const newAnnouncement = await prisma.announcement.create({
            data: {
                tenantId: role === 'SUPER_ADMIN' ? null : tenantId,
                title,
                content: message,
                priority: priority || 'medium',
                targetRole: targetAudience || 'all',
                authorId: id
            }
        });

        res.status(201).json(newAnnouncement);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
