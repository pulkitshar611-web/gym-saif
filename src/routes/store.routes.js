const express = require('express');
const { getProducts, checkout, getOrders } = require('../controllers/store.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);

// Products
router.get('/products', getProducts);

// Orders
router.get('/orders', getOrders);
router.post('/checkout', checkout);

module.exports = router;
