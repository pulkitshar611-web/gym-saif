const express = require('express');
const { getAllPromos, createPromo, updatePromo, deletePromo, validatePromo } = require('../controllers/promo.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);

router.get('/validate/:code', validatePromo);

// Admin / Super Admin routes
router.use(authorize('SUPER_ADMIN', 'BRANCH_ADMIN', 'MANAGER'));
router.get('/', getAllPromos);
router.post('/', createPromo);
router.put('/:id', updatePromo);
router.delete('/:id', deletePromo);

module.exports = router;
