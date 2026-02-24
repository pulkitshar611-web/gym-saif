// gym_backend/src/controllers/progress.controller.js
const prisma = require('../config/prisma');

const getProgress = async (req, res) => {
    try {
        let member;

        if (req.user.role === 'TRAINER') {
            const memberId = req.query.memberId || req.body.memberId;
            if (!memberId) {
                return res.status(400).json({ message: 'memberId is required for trainers' });
            }
            member = await prisma.member.findUnique({
                where: { id: parseInt(memberId) }
            });
        } else {
            member = await prisma.member.findUnique({
                where: { userId: req.user.id }
            });
        }

        if (!member) {
            return res.status(404).json({ message: 'Member profile not found' });
        }

        // Check authorization: if trainer, must be the assigned trainer
        if (req.user.role === 'TRAINER' && member.trainerId !== req.user.id) {
            return res.status(403).json({ message: 'You are not authorized to view progress for this member' });
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

        // Check authorization: trainer must be assigned
        if (req.user.role === 'TRAINER' && member.trainerId !== req.user.id) {
            return res.status(403).json({ message: 'You are not assigned to this member' });
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
        const { weight, bodyFat, measurements, photos, notes, date, memberId: providedMemberId } = req.body;
        let member;

        if (req.user.role === 'TRAINER') {
            if (!providedMemberId) {
                return res.status(400).json({ message: 'memberId is required for trainers' });
            }
            member = await prisma.member.findUnique({
                where: { id: parseInt(providedMemberId) }
            });
        } else {
            member = await prisma.member.findUnique({
                where: { userId: req.user.id }
            });
        }

        if (!member) {
            return res.status(404).json({ message: 'Member profile not found' });
        }

        // Check authorization: if trainer, must be the assigned trainer
        if (req.user.role === 'TRAINER' && member.trainerId !== req.user.id) {
            return res.status(403).json({ message: 'You are not authorized to log progress for this member' });
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
