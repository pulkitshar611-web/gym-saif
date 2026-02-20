const express = require('express');
const {
    createLead,
    getLeads,
    updateLeadStatus,
    getTodayFollowUps,
    addFollowUp
} = require('../controllers/crm.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);
// Allow all roles except MEMBER to access CRM (or customize as needed)
router.use(authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER', 'STAFF', 'TRAINER'));

// Lead Routes
router.post('/leads', createLead);
router.get('/leads', getLeads);
router.patch('/leads/:id/status', updateLeadStatus);

// Follow-up Routes
router.get('/followups/today', getTodayFollowUps);
router.post('/leads/:leadId/followups', addFollowUp);

module.exports = router;
