// gym_backend/src/routes/trainer.routes.js
const express = require('express');
const {
    getProfile,
    updateProfile,
    getAssignedMembers,
    getMemberById,
    flagMember,
    getSessions,
    updateSessionStatus,
    getTasks,
    updateTaskStatus,
    saveAttendance,
    getSessionHistory,
    getMemberPayments,
    getEarnings,
    getAttendance,
    checkInTrainer,
    requestLeave,
    getAvailability,
    updateAvailability
} = require('../controllers/trainer.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);
router.use(authorize('TRAINER')); // Only Trainers can access these routes

// Profile
router.get('/profile', getProfile);
router.patch('/profile', updateProfile);

// Assigned Members
router.get('/members', getAssignedMembers);
router.get('/members/:id', getMemberById);
router.patch('/members/:id/flag', flagMember);
router.get('/members/:id/payments', getMemberPayments);

// Sessions
router.get('/sessions', getSessions);
router.patch('/sessions/:id/status', updateSessionStatus);
router.post('/sessions/:id/attendance', saveAttendance);
router.get('/session-history', getSessionHistory);

// Tasks
router.get('/tasks', getTasks);
router.patch('/tasks/:id/status', updateTaskStatus);

// Earnings
router.get('/earnings', getEarnings);

// Attendance
router.get('/attendance', getAttendance);
router.post('/attendance/check-in', checkInTrainer);
router.post('/attendance/leave', requestLeave);

// Availability
router.get('/availability', getAvailability);
router.patch('/availability', updateAvailability);

module.exports = router;
