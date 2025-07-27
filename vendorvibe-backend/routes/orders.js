const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const authMiddleware = require('../middleware/auth');

// Export a function that accepts 'io'
module.exports = (io) => {
  router.post('/', authMiddleware, (req, res) => orderController.placeOrder(req, res, io));
  router.get('/', authMiddleware, orderController.getOrders); // getOrders doesn't need io directly unless it emits
  router.put('/:orderId/status', authMiddleware, (req, res) => orderController.updateOrderStatus(req, res, io));
  router.get('/:orderId', authMiddleware, orderController.getOrderById); // getOrderById doesn't need io directly unless it emits

  return router;
};
