const express = require('express');
const { getProducts, checkout, getOrders, updateStock, addProduct, updateProduct, deleteProduct } = require('../controllers/store.controller');
const { protect, authorize } = require('../middleware/auth.middleware');

const router = express.Router();

router.use(protect);

// Products
router.get('/products', getProducts);
router.post('/products', addProduct);
router.patch('/products/:id/stock', updateStock);
router.put('/products/:id', updateProduct);
router.delete('/products/:id', deleteProduct);

// Orders
router.get('/orders', getOrders);
router.post('/checkout', checkout);

module.exports = router;
