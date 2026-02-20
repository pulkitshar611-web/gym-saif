const express = require('express');
const {
    getDashboardStats,
    getRecentActivities,
    getTrainerAvailability,
    getFinancialStats
} = require('../controllers/branchAdmin.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);
router.use(authorize('BRANCH_ADMIN'));

router.get('/dashboard/stats', getDashboardStats);
router.get('/dashboard/activities', getRecentActivities);
router.get('/dashboard/trainers', getTrainerAvailability);
router.get('/dashboard/financials', getFinancialStats);

module.exports = router;
