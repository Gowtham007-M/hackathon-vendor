// products.js
const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const authMiddleware = require('../middleware/auth');

// Export a function that accepts 'io'
module.exports = (io) => {
  // Pass 'io' to the controller functions
  router.get('/', productController.getProducts); // No auth for public product listing
  router.post('/', authMiddleware, (req, res) => productController.addProduct(req, res, io));
  router.put('/:id', authMiddleware, (req, res) => productController.updateProduct(req, res, io));
  router.delete('/:id', authMiddleware, (req, res) => productController.deleteProduct(req, res, io));
  router.get('/supplier/:supplierId', productController.getSupplierProducts); // No auth for public supplier products
  router.put('/:productId/stock', authMiddleware, (req, res) => productController.updateProductStock(req, res, io));

  return router;
};
