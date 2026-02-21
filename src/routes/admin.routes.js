// gym_backend/src/routes/admin.routes.js
const express = require('express');
const {
    getAllMembers,
    addMember,
    getMemberById,
    updateMember,
    deleteMember,
    toggleMemberStatus,
    freezeMember,
    unfreezeMember,
    giftDays,
    getAllStaff,
    createStaff,
    fetchBranchDashboardCards,
    getBookings,
    getBookingStats,
    getBookingsByDateRange,
    getBookingById,
    updateBookingStatus,
    createBooking,
    deleteBooking,
    getTodaysBookings,
    getBookingCalendar,
    getCheckIns,
    deleteCheckIn,
    getAttendanceStats,
    getLiveCheckIn,
    getTasks,
    getTaskStats,
    updateTaskStatus,
    updateTask,
    createTask,
    deleteTask,
    assignTask,
    getBookingReport,
    getAttendanceReport,
    getAllPlans,
    createPlan,
    updatePlan,
    deletePlan,
    getAllClasses,
    getClassById,
    createClass,
    updateClass,
    deleteClass
} = require('../controllers/admin.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);
router.use(authorize('BRANCH_ADMIN', 'MANAGER'));

// Members
router.get('/members', getAllMembers);
router.post('/members', addMember);
router.get('/members/:id', getMemberById);
router.patch('/members/:id', updateMember);
router.delete('/members/:id', deleteMember);
router.patch('/members/:id/toggle-status', toggleMemberStatus);
router.patch('/members/:id/freeze', freezeMember);
router.patch('/members/:id/unfreeze', unfreezeMember);
router.patch('/members/:id/gift', giftDays);

// Bookings
router.get('/bookings', getBookings);
router.get('/bookings/stats', getBookingStats);
router.get('/bookings/range', getBookingsByDateRange);
router.get('/bookings/today', getTodaysBookings);
router.get('/bookings/calendar', getBookingCalendar);
router.get('/bookings/:id', getBookingById);
router.patch('/bookings/:id/status', updateBookingStatus);
router.post('/bookings', createBooking);
router.delete('/bookings/:id', deleteBooking);

// Attendance
router.get('/attendance', getCheckIns);
router.get('/attendance/stats', getAttendanceStats);
router.get('/attendance/live', getLiveCheckIn);
router.delete('/attendance/:id', deleteCheckIn);

// Tasks
router.get('/tasks', getTasks);
router.get('/tasks/stats', getTaskStats);
router.patch('/tasks/:id/status', updateTaskStatus);
router.patch('/tasks/:id', updateTask);
router.post('/tasks', createTask);
router.delete('/tasks/:id', deleteTask);
router.post('/tasks/assign', assignTask);

// Reports & Staff
router.get('/reports/bookings', getBookingReport);
router.get('/reports/attendance', getAttendanceReport);
router.get('/dashboard-cards', fetchBranchDashboardCards);
router.get('/staff', getAllStaff);
router.post('/staff', createStaff);

// Membership Plans
router.get('/plans', getAllPlans);
router.post('/plans', createPlan);
router.patch('/plans/:id', updatePlan);
router.delete('/plans/:id', deletePlan);

// Classes
router.get('/classes', getAllClasses);
router.get('/classes/:id', getClassById);
router.post('/classes', createClass);
router.patch('/classes/:id', updateClass);
router.delete('/classes/:id', deleteClass);

module.exports = router;
