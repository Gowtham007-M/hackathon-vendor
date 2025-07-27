const express = require('express');
const router = express.Router();
const { getSuppliers, getSupplierDetails } = require('../controllers/supplierController');
const authMiddleware = require('../middleware/auth');

router.get('/', authMiddleware, getSuppliers);
router.get('/:id', authMiddleware, getSupplierDetails);

module.exports = router;