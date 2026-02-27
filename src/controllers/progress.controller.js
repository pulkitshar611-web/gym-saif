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

        // Fetch attendance for the last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const attendance = await prisma.attendance.findMany({
            where: {
                userId: member.userId,
                date: { gte: sevenDaysAgo }
            },
            orderBy: { date: 'asc' }
        });

        // Group attendance by day for the chart
        const attendanceStats = Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (6 - i));
            const dateStr = d.toISOString().split('T')[0];
            const present = attendance.some(a => a.date.toISOString().split('T')[0] === dateStr);
            return {
                day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()],
                value: present ? 100 : 0
            };
        });

        res.json({
            logs: progressLogs,
            targets: {
                weight: member.targetWeight,
                bodyFat: member.targetBodyFat,
                goal: member.fitnessGoal,
                height: member.height
            },
            attendanceStats
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

        // Fetch attendance for the last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const attendance = await prisma.attendance.findMany({
            where: {
                userId: member.userId,
                date: { gte: sevenDaysAgo }
            },
            orderBy: { date: 'asc' }
        });

        const attendanceStats = Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (6 - i));
            const dateStr = d.toISOString().split('T')[0];
            const present = attendance.some(a => a.date.toISOString().split('T')[0] === dateStr);
            return {
                day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()],
                value: present ? 100 : 0
            };
        });

        res.json({
            logs: progressLogs,
            targets: {
                weight: member.targetWeight,
                bodyFat: member.targetBodyFat,
                goal: member.fitnessGoal,
                height: member.height
            },
            attendanceStats
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const logProgress = async (req, res) => {
    try {
        const { weight, bodyFat, measurements, photos, notes, date, height, memberId: providedMemberId } = req.body;
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

        // Update member height if provided
        if (height) {
            await prisma.member.update({
                where: { id: member.id },
                data: { height: parseFloat(height) }
            });
        }

        const newProgress = await prisma.memberProgress.create({
            data: {
                memberId: member.id,
                weight: weight ? parseFloat(weight) : null,
                bodyFat: bodyFat ? parseFloat(bodyFat) : null,
                height: height ? parseFloat(height) : null,
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
