const User = require('../models/User');
const Product = require('../models/Product');

exports.getSuppliers = async (req, res) => {
  try {
    const suppliers = await User.find({ type: 'supplier' }).select('-password');
    res.json(suppliers);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getSupplierDetails = async (req, res) => {
  try {
    const supplier = await User.findById(req.params.id).select('-password').populate('products');
    if (!supplier || supplier.type !== 'supplier') {
      return res.status(404).json({ message: 'Supplier not found' });
    }
    res.json(supplier);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};