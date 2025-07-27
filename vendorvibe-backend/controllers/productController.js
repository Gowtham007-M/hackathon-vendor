const Product = require('../models/Product');

exports.addProduct = async (req, res) => {
  try {
    const { name, price, available, minBulk, discount, description, category, image } = req.body;
    
    // Validation
    if (!name || !price || available === undefined) {
      return res.status(400).json({ 
        message: 'Name, price, and available quantity are required' 
      });
    }

    if (price <= 0 || available < 0) {
      return res.status(400).json({ 
        message: 'Price must be positive and available quantity cannot be negative' 
      });
    }

    const product = new Product({
      name,
      price,
      available,
      minBulk: minBulk || 1,
      discount: discount || 0,
      description: description || '',
      category: category || 'general',
      image: image || '',
      supplier: req.user.id,
    });
    
    await product.save();
    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getProducts = async (req, res) => {
  try {
    const { category, supplier, minPrice, maxPrice, available, search } = req.query;
    let query = {};

    // Build filter query
    if (category) query.category = category;
    if (supplier) query.supplier = supplier;
    if (available === 'true') query.available = { $gt: 0 };
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const products = await Product.find(query)
      .populate('supplier', 'name email')
      .sort({ createdAt: -1 });
    
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getProductById = async (req, res) => {
  try {
    const { productId } = req.params;
    const product = await Product.findById(productId).populate('supplier', 'name email');
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const updates = req.body;
    
    const product = await Product.findById(productId);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Check if user is the supplier of this product
    if (product.supplier.toString() !== req.user.id) {
      return res.status(403).json({ 
        message: 'Not authorized to update this product' 
      });
    }

    // Validation for updates
    if (updates.price !== undefined && updates.price <= 0) {
      return res.status(400).json({ 
        message: 'Price must be positive' 
      });
    }

    if (updates.available !== undefined && updates.available < 0) {
      return res.status(400).json({ 
        message: 'Available quantity cannot be negative' 
      });
    }

    if (updates.minBulk !== undefined && updates.minBulk < 1) {
      return res.status(400).json({ 
        message: 'Minimum bulk quantity must be at least 1' 
      });
    }

    if (updates.discount !== undefined && (updates.discount < 0 || updates.discount > 100)) {
      return res.status(400).json({ 
        message: 'Discount must be between 0 and 100' 
      });
    }

    // Remove fields that shouldn't be updated
    delete updates.supplier;
    delete updates._id;
    delete updates.createdAt;
    
    updates.updatedAt = new Date();

    const updatedProduct = await Product.findByIdAndUpdate(
      productId, 
      updates, 
      { new: true, runValidators: true }
    ).populate('supplier', 'name email');
    
    res.json({ 
      message: 'Product updated successfully', 
      product: updatedProduct 
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    
    const product = await Product.findById(productId);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Check if user is the supplier of this product
    if (product.supplier.toString() !== req.user.id) {
      return res.status(403).json({ 
        message: 'Not authorized to delete this product' 
      });
    }

    // Check if product is in any pending orders
    const Order = require('../models/Order');
    const pendingOrders = await Order.find({
      'items.product': productId,
      status: { $in: ['pending', 'confirmed', 'preparing'] }
    });

    if (pendingOrders.length > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete product with pending orders' 
      });
    }

    await Product.findByIdAndDelete(productId);
    
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getSupplierProducts = async (req, res) => {
  try {
    const products = await Product.find({ supplier: req.user.id })
      .sort({ createdAt: -1 });
    
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.updateProductStock = async (req, res) => {
  try {
    const { productId } = req.params;
    const { quantity } = req.body;
    
    if (!quantity || quantity < 0) {
      return res.status(400).json({ 
        message: 'Quantity must be a positive number' 
      });
    }

    const product = await Product.findById(productId);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Check if user is the supplier of this product
    if (product.supplier.toString() !== req.user.id) {
      return res.status(403).json({ 
        message: 'Not authorized to update this product stock' 
      });
    }

    product.available = quantity;
    product.updatedAt = new Date();
    await product.save();
    
    res.json({ 
      message: 'Stock updated successfully', 
      product 
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};