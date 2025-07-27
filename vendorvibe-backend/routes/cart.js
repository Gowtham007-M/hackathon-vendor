const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController'); // Renamed from destructuring to allow passing io
const authMiddleware = require('../middleware/auth');

// Export a function that accepts 'io'
module.exports = (io) => {
  router.get('/', authMiddleware, cartController.getCart);
  router.post('/', authMiddleware, (req, res) => cartController.addToCart(req, res, io)); // Pass io
  router.delete('/:productId', authMiddleware, (req, res) => cartController.removeFromCart(req, res, io)); // Pass io
  router.put('/:productId', authMiddleware, (req, res) => cartController.updateCartItemQuantity(req, res, io)); // Pass io, renamed from updateQuantity
  router.delete('/clear', authMiddleware, (req, res) => cartController.clearCart(req, res, io)); // Pass io

  return router;
};
