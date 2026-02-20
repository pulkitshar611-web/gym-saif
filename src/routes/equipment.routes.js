const express = require('express');
const {
    getAllEquipment,
    addEquipment,
    updateEquipment,
    deleteEquipment,
    reportIssue,
    getMaintenanceRequests,
    updateMaintenanceStatus
} = require('../controllers/equipment.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);
router.use(authorize('BRANCH_ADMIN', 'MANAGER', 'STAFF'));

router.get('/', getAllEquipment);
router.post('/', addEquipment);
router.patch('/:id', updateEquipment);
router.delete('/:id', deleteEquipment);
router.post('/report-issue', reportIssue);
router.get('/requests', getMaintenanceRequests);
router.patch('/requests/:id', updateMaintenanceStatus);

module.exports = router;
