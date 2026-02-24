// gym_backend/src/routes/member.routes.js
const express = require('express');
const {
    upgradePlan,
    cancelMembership,
    getWalletTransactions,
    addWalletCredit,
    getMyBookings,
    createBooking,
    cancelBooking,
    rescheduleBooking,
    freezeMembership,
    unfreezeMembership,
    getInvoices,
    payInvoice,
    getWalletBalance,
    getSavedCards,
    addSavedCard,
    getMembershipDetails,
    getServiceRequests,
    addServiceRequest,
    getMemberProfile,
    getAvailableClasses,
    getWorkoutPlans,
    getDietPlans,
    deleteSavedCard,
    getRewardCatalog,
    redeemReward
} = require('../controllers/member.controller');
const {
    getProgress,
    logProgress
} = require('../controllers/progress.controller');
const { protect, authorize } = require('../middleware/auth.middleware');


const router = express.Router();

router.use(protect);
// Most member routes are only for members, but some are shared
const memberOnly = authorize('MEMBER');
const memberOrTrainer = authorize('MEMBER', 'TRAINER');

// Membership
router.post('/plan/upgrade', memberOnly, upgradePlan);
router.post('/plan/cancel', memberOnly, cancelMembership);
router.post('/membership/freeze', memberOnly, freezeMembership);
router.post('/membership/unfreeze', memberOnly, unfreezeMembership);
router.get('/membership-details', memberOnly, getMembershipDetails);
router.get('/service-requests', memberOnly, getServiceRequests);
router.post('/service-requests', memberOnly, addServiceRequest);
router.get('/profile', memberOnly, getMemberProfile);
router.get('/classes', memberOnly, getAvailableClasses);

// Progress
router.get('/progress', memberOrTrainer, getProgress);
router.post('/progress', memberOrTrainer, logProgress);

// Wallet & Payments
router.get('/wallet/transactions', memberOnly, getWalletTransactions);
router.post('/wallet/add', memberOnly, addWalletCredit);
router.get('/wallet/balance', memberOnly, getWalletBalance);
router.get('/invoices', memberOnly, getInvoices);
router.post('/invoices/:id/pay', memberOnly, payInvoice);
router.get('/cards', memberOnly, getSavedCards);
router.post('/cards', memberOnly, addSavedCard);
router.delete('/cards/:id', memberOnly, deleteSavedCard);

// Rewards
router.get('/rewards/catalog', memberOnly, getRewardCatalog);
router.post('/rewards/redeem', memberOnly, redeemReward);

// Bookings
router.get('/bookings', memberOnly, getMyBookings);
router.post('/bookings', memberOnly, createBooking);
router.patch('/bookings/:id/reschedule', memberOnly, rescheduleBooking);
router.delete('/bookings/:id', memberOnly, cancelBooking);

// Workout Plans
router.get('/workout-plans', memberOnly, getWorkoutPlans);

// Diet Plans
router.get('/diet-plans', memberOnly, getDietPlans);

module.exports = router;
