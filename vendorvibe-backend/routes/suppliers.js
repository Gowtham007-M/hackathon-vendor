const express = require('express');
const router = express.Router();
const supplierController = require('../controllers/supplierController');
const authMiddleware = require('../middleware/auth');

// Export a function that accepts 'io'
module.exports = (io) => {
  router.get('/', authMiddleware, supplierController.getSuppliers); // getSuppliers doesn't need io directly unless it emits
  router.get('/:id', authMiddleware, supplierController.getSupplierDetails); // getSupplierDetails doesn't need io directly unless it emits

  // If you add any routes that modify supplier data and need real-time updates,
  // you would pass 'io' to those controller functions here.
  // Example: router.put('/:id', authMiddleware, (req, res) => supplierController.updateSupplier(req, res, io));

  return router;
};
