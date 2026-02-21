// gym_backend/src/routes/superadmin.routes.js
const express = require('express');
const {
    getAllGyms,
    addGym,
    updateGym,
    toggleGymStatus,
    deleteGym,
    getAllPlans,
    addPlan,
    updatePlan,
    deletePlan,
    fetchDashboardCards,
    getSubscriptions,
    toggleSubscriptionStatus,
    getPaymentsStats,
    getRevenueData,
    getPayments,
    updatePaymentStatus,
    getWebhookLogs,
    getAuditLogs,
    getActivityLogs,
    getErrorLogs,
    getHardwareLogs,
    getDevices,
    getGlobalSettings,
    updateGlobalSettings,
    getInvoiceSettings,
    updateInvoiceSettings,
    getBookingSettings,
    updateBookingSettings,
    getStaffMembers,
    addStaffMember,
    deleteStaffMember,
    getWalletStats,
    getTrainerRequests,
    getTrainerChangeRequests,
    getPayrollData,
    getStoreDashboardData,
    getProducts,
    getOrders,
    getStoreInventory,
    getInvoices,
    getGSTReports,
    getProfile,
    updateProfile,
    updateTrainerRequest,
    getMemberWallets,
    updateStaffMember,
    addDevice,
    updateDevice,
    deleteDevice
} = require('../controllers/superadmin.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);
router.use(authorize('SUPER_ADMIN', 'BRANCH_ADMIN'));

router.get('/profile', getProfile);
router.patch('/profile', updateProfile);

router.get('/gyms', getAllGyms);
router.post('/gyms', addGym);
router.patch('/gyms/:id', updateGym);
router.delete('/gyms/:id', deleteGym);
router.patch('/gyms/:id/toggle-status', toggleGymStatus);

router.get('/plans', getAllPlans);
router.post('/plans', addPlan);
router.patch('/plans/:id', updatePlan);
router.delete('/plans/:id', deletePlan);

router.get('/dashboard-cards', fetchDashboardCards);

// Subscriptions
router.get('/subscriptions', getSubscriptions);
router.patch('/subscriptions/:id/toggle-status', toggleSubscriptionStatus);

// Payments & Revenue
router.get('/payments/stats', getPaymentsStats);
router.get('/payments/revenue-chart', getRevenueData);
router.get('/payments', getPayments);
router.patch('/payments/:id/status', updatePaymentStatus);
router.get('/invoices', getInvoices);

// Logs & Reports
router.get('/webhook-logs', getWebhookLogs);
router.get('/audit-logs', getAuditLogs);
router.get('/logs/activity', getActivityLogs);
router.get('/logs/error', getErrorLogs);
router.get('/logs/hardware', getHardwareLogs);
router.get('/reports/gst', getGSTReports);

// Devices & Settings
router.get('/devices', getDevices);
router.post('/devices', addDevice);
router.patch('/devices/:id', updateDevice);
router.delete('/devices/:id', deleteDevice);
router.get('/settings/global', getGlobalSettings);
router.patch('/settings/global', updateGlobalSettings);
router.get('/settings/invoice', getInvoiceSettings);
router.patch('/settings/invoice', updateInvoiceSettings);
router.get('/settings/booking', getBookingSettings);
router.patch('/settings/booking', updateBookingSettings);

// Staff & Management
router.get('/staff', getStaffMembers);
router.post('/staff', addStaffMember);
router.delete('/staff/:id', deleteStaffMember);
router.patch('/staff/:id', updateStaffMember);
router.get('/wallet/stats', getWalletStats);
router.get('/wallet/members', getMemberWallets);
router.get('/requests/trainers', getTrainerRequests);
router.patch('/requests/trainers/:id', updateTrainerRequest);
router.get('/requests/trainer-changes', getTrainerChangeRequests);
router.get('/payroll', getPayrollData);

// Store
router.get('/store/dashboard', getStoreDashboardData);
router.get('/store/products', getProducts);
router.get('/store/orders', getOrders);
router.get('/store/inventory', getStoreInventory);

module.exports = router;
