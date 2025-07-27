// productController.js
const Product = require('../models/Product');
const User = require('../models/User'); // Import User model to get socketId for targeted emissions

// Helper function to emit to all vendors
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

exports.addProduct = async (req, res, io) => { // Added io parameter
  try {
    const { name, price, available, minBulk, discount, description, category, image } = req.body;

    // Validation
    if (!name || !price || available === undefined || !category) { // Added category to required fields
      return res.status(400).json({
        message: 'Name, price, available quantity, and category are required'
      });
    }
    if (price <= 0 || available < 0) {
      return res.status(400).json({
        message: 'Price must be positive and available quantity cannot be negative'
      });
    }

    const product = new Product({
      name,
      price: parseFloat(price), // Ensure price is a number
      available: parseInt(available), // Ensure available is an integer
      minBulk: minBulk ? parseInt(minBulk) : 1, // Default to 1 if not provided
      discount: discount ? parseFloat(discount) : 0, // Default to 0 if not provided
      description: description || '',
      category: category || 'general',
      image: image || '',
      supplier: req.user.id, // Corrected from supplierId to supplier
    });

    await product.save();

    // Populate supplier name for the emitted product data
    const populatedProduct = await Product.findById(product._id).populate('supplier', 'name'); // Corrected from supplierId to supplier

    // Emit real-time event to all vendors
    // Ensure the emitted data directly contains the product name for the notification
    emitToVendors(io, 'product_added', {
      _id: populatedProduct._id,
      name: populatedProduct.name, // Explicitly pass the name
      price: populatedProduct.price,
      available: populatedProduct.available,
      category: populatedProduct.category,
      supplier: populatedProduct.supplier // The populated supplier object
    });

    // Send the response back to the client that initiated the request
    res.status(201).json({ message: 'Product added successfully', product: populatedProduct });
  } catch (error) {
    console.error('Error adding product:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getProducts = async (req, res) => {
  try {
    const { category, supplier, minPrice, maxPrice, available, search } = req.query;
    let query = { isActive: true }; // Only fetch active products by default

    if (category && category !== 'All') {
      query.category = category;
    }
    if (supplier) {
      query.supplier = supplier; // Corrected from supplierId to supplier
    }
    if (minPrice) {
      query.price = { ...query.price, $gte: parseFloat(minPrice) };
    }
    if (maxPrice) {
      query.price = { ...query.price, $lte: parseFloat(maxPrice) };
    }
    if (available === 'true') {
      query.available = { $gt: 0 };
    }
    if (search) {
      query.name = { $regex: search, $options: 'i' }; // Case-insensitive search
    }

    const products = await Product.find(query).populate('supplier', 'name').sort({ createdAt: -1 }); // Corrected from supplierId to supplier
    res.json(products);
  } catch (error) {
    console.error('Error getting products:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.updateProduct = async (req, res, io) => { // Added io parameter
  try {
    const { id } = req.params;
    const { name, price, available, minBulk, discount, description, category, image, isActive } = req.body; // Changed status to isActive

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Ensure only the supplier of the product can update it
    if (product.supplier.toString() !== req.user.id) { // Corrected from supplierId to supplier
      return res.status(403).json({ message: 'Not authorized to update this product' });
    }

    // Update fields if provided
    if (name !== undefined) product.name = name;
    if (price !== undefined) product.price = parseFloat(price);
    if (available !== undefined) product.available = parseInt(available);
    if (minBulk !== undefined) product.minBulk = parseInt(minBulk);
    if (discount !== undefined) product.discount = parseFloat(discount);
    if (description !== undefined) product.description = description;
    if (category !== undefined) product.category = category;
    if (image !== undefined) product.image = image;
    if (isActive !== undefined) product.isActive = isActive; // Changed status to isActive

    await product.save(); // This will trigger the post('save') hook if defined in the model

    // Populate supplier name for the emitted product data
    const populatedProduct = await Product.findById(product._id).populate('supplier', 'name'); // Corrected from supplierId to supplier

    // Emit real-time event to all vendors
    emitToVendors(io, 'product_updated', populatedProduct); // Use 'product_updated' as per frontend context

    res.json({ message: 'Product updated successfully', product: populatedProduct });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.deleteProduct = async (req, res, io) => { // Added io parameter
  try {
    const { id: productId } = req.params;
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Ensure only the supplier of the product can delete it
    if (product.supplier.toString() !== req.user.id) { // Corrected from supplierId to supplier
      return res.status(403).json({ message: 'Not authorized to delete this product' });
    }

    await Product.findByIdAndDelete(productId);

    // Emit real-time event to all vendors
    emitToVendors(io, 'product_deleted', productId); // Emit the ID of the deleted product

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getSupplierProducts = async (req, res) => {
  try {
    const products = await Product.find({ supplier: req.params.supplierId }) // Corrected from supplierId to supplier
      .sort({ createdAt: -1 })
      .populate('supplier', 'name'); // Corrected from supplierId to supplier

    res.json(products);
  } catch (error) {
    console.error('Error getting supplier products:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.updateProductStock = async (req, res, io) => { // Added io parameter
  try {
    const { productId } = req.params;
    const { quantity } = req.body;

    if (quantity === undefined || quantity < 0) { // Changed !quantity to quantity === undefined
      return res.status(400).json({
        message: 'Quantity must be a non-negative number'
      });
    }

    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Check if user is the supplier of this product
    if (product.supplier.toString() !== req.user.id) { // Corrected from supplierId to supplier
      return res.status(403).json({
        message: 'Not authorized to update stock for this product'
      });
    }

    product.available = parseInt(quantity); // Update the available quantity and ensure it's an integer
    await product.save();

    // Emit real-time event for stock update
    emitToVendors(io, 'product_stock_updated', {
      productId: product._id,
      newStock: product.available,
      productName: product.name
    });

    res.json({ message: 'Product stock updated successfully', product });
  } catch (error) {
    console.error('Error updating product stock:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
