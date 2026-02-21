const express = require('express');
const {
    getAllFeedback,
    addFeedback,
    updateFeedbackStatus
} = require('../controllers/feedback.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);
router.use(authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER', 'STAFF'));

router.get('/', getAllFeedback);
router.post('/', addFeedback);
router.patch('/:id/status', updateFeedbackStatus);

module.exports = router;
