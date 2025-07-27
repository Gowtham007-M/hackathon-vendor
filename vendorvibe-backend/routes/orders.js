const express = require('express');
const router = express.Router();
const { placeOrder, getOrders, updateOrderStatus } = require('../controllers/orderController');
const authMiddleware = require('../middleware/auth');

router.post('/', authMiddleware, placeOrder);
router.get('/', authMiddleware, getOrders);
router.put('/:id/status', authMiddleware, updateOrderStatus);

module.exports = router;