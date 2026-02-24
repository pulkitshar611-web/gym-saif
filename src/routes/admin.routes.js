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
    deleteClass,
    getAnnouncements,
    createAnnouncement,
    getChats,
    getMessages,
    sendMessage,
    createPayroll,
    getPayrollHistory,
    updatePayrollStatus,
    getProfile,
    updateProfile,
    getLeaveRequests,
    updateLeaveStatus,
    getTenantSettings,
    updateTenantSettings
} = require('../controllers/admin.controller');
const { getTrainerRequests, updateTrainerRequest, updateStaffMember, deleteStaffMember } = require('../controllers/superadmin.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();


router.use(protect);
// Default: BRANCH_ADMIN and MANAGER can access everything
// STAFF gets read-only access to specific routes defined below with inline authorize
router.use(authorize('BRANCH_ADMIN', 'MANAGER', 'STAFF'));

// Settings
router.get('/settings/tenant', authorize('BRANCH_ADMIN', 'MANAGER'), getTenantSettings);
router.patch('/settings/tenant', authorize('BRANCH_ADMIN', 'MANAGER'), updateTenantSettings);

// Members — STAFF can view only, cannot create/edit/delete
router.get('/members', getAllMembers);
router.post('/members', authorize('BRANCH_ADMIN', 'MANAGER'), addMember);
router.get('/members/:id', getMemberById);
router.patch('/members/:id', authorize('BRANCH_ADMIN', 'MANAGER'), updateMember);
router.delete('/members/:id', authorize('BRANCH_ADMIN', 'MANAGER'), deleteMember);
router.patch('/members/:id/toggle-status', authorize('BRANCH_ADMIN', 'MANAGER'), toggleMemberStatus);
router.patch('/members/:id/freeze', authorize('BRANCH_ADMIN', 'MANAGER'), freezeMember);
router.patch('/members/:id/unfreeze', authorize('BRANCH_ADMIN', 'MANAGER'), unfreezeMember);
router.patch('/members/:id/gift', authorize('BRANCH_ADMIN', 'MANAGER'), giftDays);

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
router.get('/reports/bookings', authorize('BRANCH_ADMIN', 'MANAGER'), getBookingReport);
router.get('/reports/attendance', authorize('BRANCH_ADMIN', 'MANAGER'), getAttendanceReport);
router.get('/dashboard-cards', fetchBranchDashboardCards);
router.get('/staff', getAllStaff);
router.post('/staff', authorize('BRANCH_ADMIN', 'MANAGER'), createStaff);
router.get('/requests/trainers', authorize('BRANCH_ADMIN', 'MANAGER'), getTrainerRequests);
router.patch('/requests/trainers/:id', authorize('BRANCH_ADMIN', 'MANAGER'), updateTrainerRequest);
router.patch('/staff/:id', authorize('BRANCH_ADMIN', 'MANAGER'), updateStaffMember);
router.delete('/staff/:id', authorize('BRANCH_ADMIN', 'MANAGER'), deleteStaffMember);


// Leave Requests (Staff/HR)
router.get('/leave-requests', authorize('BRANCH_ADMIN', 'MANAGER'), getLeaveRequests);
router.patch('/leave-requests/:id/status', authorize('BRANCH_ADMIN', 'MANAGER'), updateLeaveStatus);

// Membership Plans
router.get('/plans', getAllPlans);
router.post('/plans', authorize('BRANCH_ADMIN', 'MANAGER'), createPlan);
router.patch('/plans/:id', updatePlan);
router.delete('/plans/:id', deletePlan);

// Classes
router.get('/classes', getAllClasses);
router.get('/classes/:id', getClassById);
router.post('/classes', createClass);
router.patch('/classes/:id', updateClass);
router.delete('/classes/:id', deleteClass);

// Communication
router.get('/communication/announcements', getAnnouncements);
router.post('/communication/announcements', createAnnouncement);
router.get('/communication/chats', getChats);
router.get('/communication/chats/:id/messages', getMessages);
router.post('/communication/chats/:id/send', sendMessage);

// Payroll
router.get('/payroll/staff', getAllStaff);
router.post('/payroll', createPayroll);
router.get('/payroll/history', getPayrollHistory);
router.patch('/payroll/:id/status', updatePayrollStatus);

// Profile
router.get('/profile', getProfile);
router.patch('/profile', updateProfile);

module.exports = router;
