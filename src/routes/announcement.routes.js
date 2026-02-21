const express = require('express');
const {
    getAllAnnouncements,
    addAnnouncement,
} = require('../controllers/announcement.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);
router.use(authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER', 'STAFF'));

router.get('/', getAllAnnouncements);
router.post('/', addAnnouncement);

module.exports = router;
