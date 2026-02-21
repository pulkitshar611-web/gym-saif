const express = require('express');
const {
    getAllLockers,
    addLocker,
    assignLocker,
    releaseLocker,
    deleteLocker
} = require('../controllers/locker.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);
router.use(authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER', 'STAFF'));

router.get('/', getAllLockers);
router.post('/', addLocker);
router.patch('/:id/assign', assignLocker);
router.patch('/:id/release', releaseLocker);
router.delete('/:id', deleteLocker);

module.exports = router;
