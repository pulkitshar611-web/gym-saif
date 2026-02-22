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
    getMemberProfile
} = require('../controllers/member.controller');
const {
    getProgress,
    logProgress
} = require('../controllers/progress.controller');
const { protect, authorize } = require('../middleware/auth.middleware');


const router = express.Router();

router.use(protect);
router.use(authorize('MEMBER'));

// Membership
router.post('/plan/upgrade', upgradePlan);
router.post('/plan/cancel', cancelMembership);
router.post('/membership/freeze', freezeMembership);
router.post('/membership/unfreeze', unfreezeMembership);
router.get('/membership-details', getMembershipDetails);
router.get('/service-requests', getServiceRequests);
router.post('/service-requests', addServiceRequest);
router.get('/profile', getMemberProfile);

// Progress
router.get('/progress', getProgress);
router.post('/progress', logProgress);

// Wallet & Payments
router.get('/wallet/transactions', getWalletTransactions);
router.post('/wallet/add', addWalletCredit);
router.get('/wallet/balance', getWalletBalance);
router.get('/invoices', getInvoices);
router.post('/invoices/:id/pay', payInvoice);
router.get('/cards', getSavedCards);
router.post('/cards', addSavedCard);

// Bookings
router.get('/bookings', getMyBookings);
router.post('/bookings', createBooking);
router.patch('/bookings/:id/reschedule', rescheduleBooking);
router.delete('/bookings/:id', cancelBooking);

module.exports = router;
