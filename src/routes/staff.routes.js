// gym_backend/src/routes/staff.routes.js
const express = require('express');
const {
    searchMembers,
    checkIn,
    checkOut,
    getTasks,
    updateTaskStatus,
    getLockers,
    assignLocker,
    releaseLocker,
    addLocker,
    getPaymentHistory,
    collectPayment,
    getMembers,
    getMemberById,
    getAttendanceReport,
    getBookingReport,
    getTodaysCheckIns
} = require('../controllers/staff.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);
router.use(authorize('STAFF'));

// Members read-only
router.get('/members', getMembers);
router.get('/members/search', searchMembers);
router.get('/members/:id', getMemberById);

// Attendance
router.get('/attendance/today', getTodaysCheckIns);
router.post('/attendance/check-in', checkIn);
router.post('/attendance/check-out', checkOut);

// Tasks
router.get('/tasks', getTasks);
router.patch('/tasks/:id/status', updateTaskStatus);

// Lockers
router.get('/lockers', getLockers);
router.post('/lockers', addLocker);
router.post('/lockers/:id/assign', assignLocker);
router.post('/lockers/:id/release', releaseLocker);

// Payments
router.get('/payments', getPaymentHistory);
router.post('/payments', collectPayment);

// Reports
router.get('/reports/attendance', getAttendanceReport);
router.get('/reports/bookings', getBookingReport);

module.exports = router;
