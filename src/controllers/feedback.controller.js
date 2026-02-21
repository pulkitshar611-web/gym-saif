const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getAllFeedback = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const where = {};
        if (role !== 'SUPER_ADMIN') {
            where.tenantId = tenantId;
        }

        const feedbacks = await prisma.feedback.findMany({
            where,
            orderBy: { date: 'desc' },
            include: {
                member: true
            }
        });

        const formatted = feedbacks.map(f => ({
            id: f.id,
            member: f.member ? `${f.member.firstName} ${f.member.lastName}` : 'Anonymous',
            rating: f.rating,
            comment: f.comment,
            status: f.status,
            date: new Date(f.date).toLocaleDateString()
        }));

        res.json(formatted);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.addFeedback = async (req, res) => {
    try {
        const { tenantId, role } = req.user;
        const { memberId, rating, comment } = req.body;

        const newFeedback = await prisma.feedback.create({
            data: {
                tenantId: role === 'SUPER_ADMIN' ? null : tenantId,
                memberId: parseInt(memberId) || 1, // mock fallback
                rating: parseInt(rating) || 5,
                comment,
                status: 'Pending'
            }
        });

        res.status(201).json(newFeedback);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateFeedbackStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const { tenantId, role } = req.user;

        const where = { id: parseInt(id) };
        if (role !== 'SUPER_ADMIN') {
            where.tenantId = tenantId;
        }

        const updated = await prisma.feedback.updateMany({
            where,
            data: { status }
        });

        res.json({ message: 'Feedback status updated' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
