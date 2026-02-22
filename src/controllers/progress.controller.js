// gym_backend/src/controllers/progress.controller.js
const prisma = require('../config/prisma');

const getProgress = async (req, res) => {
    try {
        const member = await prisma.member.findUnique({
            where: { userId: req.user.id }
        });

        if (!member) {
            return res.status(404).json({ message: 'Member profile not found' });
        }

        const progressLogs = await prisma.memberProgress.findMany({
            where: { memberId: member.id },
            orderBy: { date: 'asc' }
        });

        res.json({
            logs: progressLogs,
            targets: {
                weight: member.targetWeight,
                bodyFat: member.targetBodyFat,
                goal: member.fitnessGoal
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getMemberProgressById = async (req, res) => {
    try {
        const { id } = req.params; // Member ID

        const member = await prisma.member.findUnique({
            where: { id: parseInt(id) }
        });

        if (!member) {
            return res.status(404).json({ message: 'Member not found' });
        }

        const progressLogs = await prisma.memberProgress.findMany({
            where: { memberId: member.id },
            orderBy: { date: 'asc' }
        });

        res.json({
            logs: progressLogs,
            targets: {
                weight: member.targetWeight,
                bodyFat: member.targetBodyFat,
                goal: member.fitnessGoal
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const logProgress = async (req, res) => {
    try {
        const { weight, bodyFat, measurements, photos, notes, date } = req.body;

        const member = await prisma.member.findUnique({
            where: { userId: req.user.id }
        });

        if (!member) {
            return res.status(404).json({ message: 'Member profile not found' });
        }

        const newProgress = await prisma.memberProgress.create({
            data: {
                memberId: member.id,
                weight: weight ? parseFloat(weight) : null,
                bodyFat: bodyFat ? parseFloat(bodyFat) : null,
                measurements: measurements || {},
                photos: photos || [],
                notes: notes || '',
                date: date ? new Date(date) : new Date()
            }
        });

        res.status(201).json(newProgress);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getProgress,
    logProgress,
    getMemberProgressById
};
