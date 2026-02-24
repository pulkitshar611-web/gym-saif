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
            member: f.member ? f.member.name : 'Anonymous',
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
        let tenantId = req.user.tenantId;
        const role = req.user.role;
        const { rating, comment } = req.body;
        let finalMemberId = null;

        if (role === 'MEMBER') {
            const memberRaw = await prisma.$queryRaw`SELECT * FROM member WHERE userId = ${req.user.id}`;
            const member = memberRaw[0];
            if (!member) return res.status(404).json({ message: 'Member profile not found' });

            finalMemberId = member.id;
            tenantId = member.tenantId;
        } else {
            finalMemberId = parseInt(req.body.memberId) || 1;
        }

        const newFeedback = await prisma.feedback.create({
            data: {
                tenantId: role === 'SUPER_ADMIN' ? null : tenantId,
                memberId: finalMemberId,
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
