// server.js - Enhanced with Real-time WebSocket functionality and Modular Routes
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config(); // This loads environment variables from a .env file

// Import route files (now functions that accept 'io')
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const cartRoutes = require('./routes/cart');
const supplierRoutes = require('./routes/suppliers');

// Import models (important for Mongoose schemas and hooks)
const User = require('./models/User');
const Product = require('./models/Product');
const Order = require('./models/Order');
const Coupon = require('./models/Coupon');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with CORS
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  }
});

// Middleware for Express routes (REST API)
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads')); // Serve static files from the 'uploads' directory

mongoose.set('debug', true);

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/vendorvibe', {
  serverSelectionTimeoutMS: 30000,
  connectTimeoutMS: 30000,
  socketTimeoutMS: 45000,
});

mongoose.connection.on('connected', () => console.log('MongoDB connected successfully'));
mongoose.connection.on('error', (err) => console.error('MongoDB connection error:', err));
mongoose.connection.on('disconnected', () => console.log('MongoDB disconnected'));

// JWT Middleware - This is now in middleware/auth.js, but kept here for direct use in server.js if needed
// However, the imported routes will use the one from middleware/auth.js
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
    req.user = user; // Attach user payload to request
    next();
  });
};

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('authenticate', async (token) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      const user = await User.findByIdAndUpdate(decoded.userId, {
        socketId: socket.id,
        isOnline: true,
        lastSeen: new Date()
      }, { new: true }); // Get the updated user object

      if (user) {
        socket.userId = decoded.userId;
        socket.userType = decoded.userType;
        console.log(`User ${user.username} authenticated with socket ${socket.id}`);
        socket.join(`user_${decoded.userId}`);
        socket.join(decoded.userType === 'vendor' ? 'vendors' : 'suppliers');

        // Emit online status to relevant users
        if (decoded.userType === 'supplier') {
          io.to('vendors').emit('supplier:online', {
            supplierId: decoded.userId,
            name: user.name
          });
        }
      } else {
        console.error('Authenticated user not found in DB:', decoded.userId);
        socket.emit('auth:error', 'Authentication failed: User not found');
      }

    } catch (error) {
      console.error('Socket authentication failed:', error);
      socket.emit('auth:error', 'Invalid token');
    }
  });

  socket.on('disconnect', async () => {
    console.log('User disconnected:', socket.id);
    if (socket.userId) {
      try {
        const user = await User.findByIdAndUpdate(socket.userId, {
          isOnline: false,
          lastSeen: new Date(),
          $unset: { socketId: 1 }
        }, { new: true });

        if (user && user.userType === 'supplier') {
          io.to('vendors').emit('supplier:offline', {
            supplierId: socket.userId
          });
        }
      } catch (error) {
        console.error('Error updating user status on disconnect:', error);
      }
    }
  });

  socket.on('cart:update', (cartData) => {
    io.to(`user_${socket.userId}`).emit('cart:updated', cartData);
  });

  socket.on('notification:send', (data) => {
    io.to(`user_${data.recipientId}`).emit('notification:received', {
      ...data,
      timestamp: new Date(),
      senderId: socket.userId
    });
  });
});


// Use the imported route files, passing the 'io' instance
app.use('/api/auth', authRoutes(io));
app.use('/api/products', productRoutes(io));
app.use('/api/orders', orderRoutes(io));
app.use('/api/cart', cartRoutes(io));
app.use('/api/suppliers', supplierRoutes(io));

// Middleware for file upload (Multer) - This is already in middleware/fileUpload.js
// and used by authRoutes. Keeping this here for completeness if other routes need direct multer setup.
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|pdf/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) return cb(null, true);
    cb(new Error('Only images and PDFs are allowed'));
  },
});

// Initialization function for default coupons
const initializeDefaultCoupons = async () => {
  try {
    const existingCoupons = await Coupon.countDocuments();
    if (existingCoupons === 0) {
      const defaultCoupons = [
        {
          code: 'SAVE10',
          discount: 10,
          description: '10% off your order',
          minOrderValue: 20,
          maxDiscount: 50,
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Valid for 30 days
        },
        {
          code: 'BULK15',
          discount: 15,
          description: '15% off bulk orders',
          minOrderValue: 100,
          maxDiscount: 100,
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        {
          code: 'FIRST20',
          discount: 20,
          description: '20% off first order',
          minOrderValue: 50,
          maxDiscount: 75,
          usageLimit: 1,
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      ];
      await Coupon.insertMany(defaultCoupons);
      console.log('Default coupons initialized');
    }
  } catch (error) {
    console.error('Failed to initialize coupons:', error.message);
  }
};

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 5MB' });
    }
  }
  console.error('Global error handler:', error);
  res.status(500).json({ error: error.message || 'Internal server error' });
});

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  initializeDefaultCoupons(); // Initialize coupons on server start
});
