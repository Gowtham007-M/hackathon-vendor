const express = require('express');
const router = express.Router();
const { addProduct, updateProduct, deleteProduct, getProducts } = require('../controllers/productController');
const authMiddleware = require('../middleware/auth');

router.get('/', getProducts);
router.post('/', authMiddleware, addProduct);
router.put('/:id', authMiddleware, updateProduct);
router.delete('/:id', authMiddleware, deleteProduct);

module.exports = router;