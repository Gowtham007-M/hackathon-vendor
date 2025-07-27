// supplierController.js
const User = require('../models/User');
const Product = require('../models/Product');

// Helper function to emit to all vendors (if needed for supplier updates)
const emitToVendors = async (io, event, data) => {
  try {
    const vendors = await User.find({ userType: 'vendor', isOnline: true });
    vendors.forEach(vendor => {
      if (vendor.socketId) {
        io.to(vendor.socketId).emit(event, data);
      }
    });
  } catch (error) {
    console.error('Error emitting to vendors:', error);
  }
};

exports.getSuppliers = async (req, res) => { // io parameter not strictly needed here unless emitting
  try {
    const suppliers = await User.find({ userType: 'supplier' }).select('-password'); // Corrected to userType
    res.json(suppliers);
  } catch (error) {
    console.error('Error getting suppliers:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getSupplierDetails = async (req, res) => { // io parameter not strictly needed here unless emitting
  try {
    const supplier = await User.findById(req.params.id).select('-password');
    if (!supplier || supplier.userType !== 'supplier') { // Corrected to userType
      return res.status(404).json({ message: 'Supplier not found' });
    }

    // Fetch products associated with this supplier
    const products = await Product.find({ supplierId: req.params.id, isActive: true }).sort({ name: 1 }); // Corrected to supplierId and isActive

    // Attach products to supplier object (or return separately based on frontend needs)
    const supplierDetails = {
      ...supplier.toObject(),
      products: products
    };

    res.json(supplierDetails);
  } catch (error) {
    console.error('Error getting supplier details:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Example of a new function that would use io if you add it later
/*
exports.updateSupplier = async (req, res, io) => {
  try {
    const { id } = req.params;
    const { name, phone, location } = req.body; // Example fields to update

    const supplier = await User.findById(id);
    if (!supplier || supplier.userType !== 'supplier') {
      return res.status(404).json({ message: 'Supplier not found or not authorized' });
    }

    // Ensure only the authenticated user can update their own profile
    if (req.user.id !== id) { // Corrected from req.user.userId to req.user.id
      return res.status(403).json({ message: 'Unauthorized to update this supplier profile' });
    }

    if (name) supplier.name = name;
    if (phone) supplier.phone = phone;
    if (location) supplier.location = location;

    await supplier.save();

    // Emit real-time event if a supplier's details are updated
    emitToVendors(io, 'supplier_updated', {
      _id: supplier._id,
      name: supplier.name,
      phone: supplier.phone,
      location: supplier.location,
      verified: supplier.verified
    });

    res.json({ message: 'Supplier profile updated successfully', supplier });
  } catch (error) {
    console.error('Error updating supplier profile:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
*/
