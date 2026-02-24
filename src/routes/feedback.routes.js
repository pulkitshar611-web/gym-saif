const express = require('express');
const {
    getAllFeedback,
    addFeedback,
    updateFeedbackStatus
} = require('../controllers/feedback.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);

router.get('/', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER', 'STAFF'), getAllFeedback);
router.post('/', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER', 'STAFF', 'MEMBER'), addFeedback);
router.patch('/:id/status', authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER', 'STAFF'), updateFeedbackStatus);

module.exports = router;
