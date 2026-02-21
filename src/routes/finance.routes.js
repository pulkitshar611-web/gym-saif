const express = require('express');
const { getExpenses, createExpense } = require('../controllers/finance.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);
router.use(authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'));

router.get('/expenses', getExpenses);
router.post('/expenses', createExpense);

module.exports = router;
