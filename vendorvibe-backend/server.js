// server.js - Main backend server
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/vendorvibe', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only images (jpg, jpeg, png) and PDF files are allowed'));
    }
  }
});

// Database Models
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  phone: { type: String, required: true },
  userType: { type: String, enum: ['vendor', 'supplier'], required: true },
  gstin: { type: String, required: function() { return this.userType === 'supplier'; } },
  verified: { type: Boolean, default: false },
  kycDocuments: [{ type: String }], // File paths
  rating: { type: Number, default: 0 },
  totalRatings: { type: Number, default: 0 },
  address: {
    street: String,
    city: String,
    state: String,
    pincode: String,
    country: { type: String, default: 'India' }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  available: { type: Number, required: true },
  minBulk: { type: Number, default: 10 },
  discount: { type: Number, default: 0 },
  category: { type: String, required: true },
  description: String,
  image: String,
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const OrderSchema = new mongoose.Schema({
  orderId: { type: String, unique: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: String,
    price: Number,
    quantity: Number,
    subtotal: Number
  }],
  subtotal: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  deliveryFee: { type: Number, default: 0 },
  total: { type: Number, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  },
  deliveryOption: { type: String, enum: ['standard', 'express'], default: 'standard' },
  couponCode: String,
  paymentMethod: String,
  paymentStatus: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
  deliveryAddress: {
    street: String,
    city: String,
    state: String,
    pincode: String,
    country: String
  },
  trackingInfo: {
    estimatedDelivery: Date,
    actualDelivery: Date,
    trackingNumber: String
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const CouponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  discount: { type: Number, required: true },
  description: String,
  minOrderValue: { type: Number, default: 0 },
  maxDiscount: Number,
  validFrom: { type: Date, default: Date.now },
  validUntil: Date,
  usageLimit: Number,
  usedCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
});

// Models
const User = mongoose.model('User', UserSchema);
const Product = mongoose.model('Product', ProductSchema);
const Order = mongoose.model('Order', OrderSchema);
const Coupon = mongoose.model('Coupon', CouponSchema);

// JWT Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Helper function to generate order ID
const generateOrderId = () => {
  return 'ORD' + Date.now() + Math.floor(Math.random() * 1000);
};

// Auth Routes
app.post('/api/auth/register', upload.single('kycDocument'), async (req, res) => {
  try {
    const { username, password, name, phone, userType, gstin } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const userData = {
      username,
      password: hashedPassword,
      name,
      phone,
      userType
    };

    if (userType === 'supplier' && gstin) {
      userData.gstin = gstin;
    }

    if (req.file) {
      userData.kycDocuments = [req.file.path];
    }

    const user = new User(userData);
    await user.save();

    res.status(201).json({ 
      message: 'User registered successfully', 
      userId: user._id 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, userType } = req.body;

    // Find user
    const user = await User.findOne({ username, userType });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, username: user.username, userType: user.userType },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        userType: user.userType,
        verified: user.verified,
        rating: user.rating
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Supplier Routes
app.get('/api/suppliers', authenticateToken, async (req, res) => {
  try {
    if (req.user.userType !== 'vendor') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const suppliers = await User.find({ userType: 'supplier' })
      .select('-password')
      .populate('products');

    // Get products for each supplier
    const suppliersWithProducts = await Promise.all(
      suppliers.map(async (supplier) => {
        const products = await Product.find({ 
          supplierId: supplier._id, 
          isActive: true 
        });

        return {
          id: supplier._id,
          name: supplier.name,
          location: `${supplier.address?.city || 'Unknown'}, ${supplier.address?.state || 'India'}`,
          contact: supplier.phone,
          rating: supplier.rating || 4.0,
          verified: supplier.verified,
          products: products.map(product => ({
            id: product._id,
            name: product.name,
            price: product.price,
            available: product.available,
            minBulk: product.minBulk,
            discount: product.discount,
            category: product.category,
            description: product.description
          }))
        };
      })
    );

    res.json(suppliersWithProducts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/suppliers/:id', authenticateToken, async (req, res) => {
  try {
    const supplier = await User.findById(req.params.id).select('-password');
    if (!supplier || supplier.userType !== 'supplier') {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    const products = await Product.find({ 
      supplierId: supplier._id, 
      isActive: true 
    });

    const supplierData = {
      id: supplier._id,
      name: supplier.name,
      location: `${supplier.address?.city || 'Unknown'}, ${supplier.address?.state || 'India'}`,
      contact: supplier.phone,
      rating: supplier.rating || 4.0,
      verified: supplier.verified,
      products: products.map(product => ({
        id: product._id,
        name: product.name,
        price: product.price,
        available: product.available,
        minBulk: product.minBulk,
        discount: product.discount,
        category: product.category,
        description: product.description
      }))
    };

    res.json(supplierData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Product Routes
app.get('/api/products', authenticateToken, async (req, res) => {
  try {
    const { supplierId, category, search } = req.query;
    let query = { isActive: true };

    if (supplierId) query.supplierId = supplierId;
    if (category) query.category = category;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const products = await Product.find(query)
      .populate('supplierId', 'name phone verified');

    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/products', authenticateToken, async (req, res) => {
  try {
    if (req.user.userType !== 'supplier') {
      return res.status(403).json({ error: 'Only suppliers can add products' });
    }

    const productData = {
      ...req.body,
      supplierId: req.user.userId
    };

    const product = new Product(productData);
    await product.save();

    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/products/:id', authenticateToken, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (product.supplierId.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );

    res.json(updatedProduct);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Order Routes
app.post('/api/orders', authenticateToken, async (req, res) => {
  try {
    if (req.user.userType !== 'vendor') {
      return res.status(403).json({ error: 'Only vendors can place orders' });
    }

    const { items, deliveryOption, couponCode, deliveryAddress } = req.body;

    // Calculate totals
    let subtotal = 0;
    let discount = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(400).json({ error: `Product ${item.productId} not found` });
      }

      if (item.quantity > product.available) {
        return res.status(400).json({ 
          error: `Insufficient stock for ${product.name}. Available: ${product.available}` 
        });
      }

      const itemSubtotal = product.price * item.quantity;
      const itemDiscount = item.quantity >= product.minBulk ? 
        (itemSubtotal * product.discount / 100) : 0;

      subtotal += itemSubtotal;
      discount += itemDiscount;

      orderItems.push({
        productId: product._id,
        name: product.name,
        price: product.price,
        quantity: item.quantity,
        subtotal: itemSubtotal - itemDiscount
      });

      // Update product stock
      product.available -= item.quantity;
      await product.save();
    }

    // Apply coupon if provided
    let couponDiscount = 0;
    if (couponCode) {
      const coupon = await Coupon.findOne({ 
        code: couponCode.toUpperCase(), 
        isActive: true 
      });
      
      if (coupon && coupon.validUntil > new Date()) {
        couponDiscount = Math.min(
          subtotal * coupon.discount / 100,
          coupon.maxDiscount || subtotal
        );
        
        coupon.usedCount += 1;
        await coupon.save();
      }
    }

    const deliveryFee = subtotal > 50 ? 0 : (deliveryOption === 'express' ? 15 : 8);
    const total = subtotal - discount - couponDiscount + deliveryFee;

    // Get supplier ID from first item
    const firstProduct = await Product.findById(items[0].productId);
    const supplierId = firstProduct.supplierId;

    const order = new Order({
      orderId: generateOrderId(),
      vendorId: req.user.userId,
      supplierId: supplierId,
      items: orderItems,
      subtotal,
      discount: discount + couponDiscount,
      deliveryFee,
      total,
      deliveryOption,
      couponCode,
      deliveryAddress,
      trackingInfo: {
        estimatedDelivery: new Date(Date.now() + (deliveryOption === 'express' ? 2 : 3) * 24 * 60 * 60 * 1000)
      }
    });

    await order.save();

    res.status(201).json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    let query = {};
    
    if (req.user.userType === 'vendor') {
      query.vendorId = req.user.userId;
    } else if (req.user.userType === 'supplier') {
      query.supplierId = req.user.userId;
    }

    const orders = await Order.find(query)
      .populate('vendorId', 'name phone')
      .populate('supplierId', 'name phone')
      .sort({ createdAt: -1 });

    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders/:id', authenticateToken, async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.id })
      .populate('vendorId', 'name phone address')
      .populate('supplierId', 'name phone address')
      .populate('items.productId');

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check if user has access to this order
    if (order.vendorId._id.toString() !== req.user.userId && 
        order.supplierId._id.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/orders/:id/status', authenticateToken, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findOne({ orderId: req.params.id });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Only suppliers can update order status
    if (req.user.userType !== 'supplier' || 
        order.supplierId.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    order.status = status;
    order.updatedAt = new Date();

    if (status === 'delivered') {
      order.trackingInfo.actualDelivery = new Date();
    }

    await order.save();

    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Coupon Routes
app.get('/api/coupons/validate/:code', authenticateToken, async (req, res) => {
  try {
    const coupon = await Coupon.findOne({ 
      code: req.params.code.toUpperCase(),
      isActive: true,
      validUntil: { $gt: new Date() }
    });

    if (!coupon) {
      return res.status(404).json({ error: 'Invalid or expired coupon' });
    }

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({ error: 'Coupon usage limit exceeded' });
    }

    res.json({
      code: coupon.code,
      discount: coupon.discount,
      description: coupon.description,
      minOrderValue: coupon.minOrderValue,
      maxDiscount: coupon.maxDiscount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Dashboard Stats Routes
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    let stats = {};

    if (req.user.userType === 'vendor') {
      const totalOrders = await Order.countDocuments({ vendorId: req.user.userId });
      const pendingOrders = await Order.countDocuments({ 
        vendorId: req.user.userId, 
        status: { $in: ['pending', 'confirmed', 'processing'] }
      });
      const totalSpent = await Order.aggregate([
        { $match: { vendorId: mongoose.Types.ObjectId(req.user.userId) } },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]);

      stats = {
        totalOrders,
        pendingOrders,
        totalSpent: totalSpent[0]?.total || 0,
        supplierCount: await User.countDocuments({ userType: 'supplier', verified: true })
      };
    } else if (req.user.userType === 'supplier') {
      const totalOrders = await Order.countDocuments({ supplierId: req.user.userId });
      const pendingOrders = await Order.countDocuments({ 
        supplierId: req.user.userId, 
        status: 'pending' 
      });
      const totalRevenue = await Order.aggregate([
        { $match: { supplierId: mongoose.Types.ObjectId(req.user.userId) } },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]);
      const productCount = await Product.countDocuments({ 
        supplierId: req.user.userId, 
        isActive: true 
      });

      stats = {
        totalOrders,
        pendingOrders,
        totalRevenue: totalRevenue[0]?.total || 0,
        productCount
      };
    }

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Initialize default coupons
const initializeCoupons = async () => {
  const existingCoupons = await Coupon.countDocuments();
  if (existingCoupons === 0) {
    const defaultCoupons = [
      {
        code: 'SAVE10',
        discount: 10,
        description: '10% off your order',
        minOrderValue: 25,
        maxDiscount: 50,
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      },
      {
        code: 'BULK15',
        discount: 15,
        description: '15% off bulk orders',
        minOrderValue: 100,
        maxDiscount: 100,
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      },
      {
        code: 'FIRST20',
        discount: 20,
        description: '20% off first order',
        minOrderValue: 50,
        maxDiscount: 75,
        usageLimit: 1,
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    ];

    await Coupon.insertMany(defaultCoupons);
    console.log('Default coupons initialized');
  }
};

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 5MB' });
    }
  }
  res.status(500).json({ error: error.message });
});

// Start server
const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await initializeCoupons();
});

module.exports = app;