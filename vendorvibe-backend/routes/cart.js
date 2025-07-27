const express = require('express');
const router = express.Router();
const { addToCart, getCart, removeFromCart, updateQuantity } = require('../controllers/cartController');
const authMiddleware = require('../middleware/auth');

router.get('/', authMiddleware, getCart);
router.post('/', authMiddleware, addToCart);
router.delete('/:productId', authMiddleware, removeFromCart);
router.put('/:productId', authMiddleware, updateQuantity);

module.exports = router;