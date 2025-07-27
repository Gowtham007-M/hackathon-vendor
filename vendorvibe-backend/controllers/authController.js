// authController.js
const User = require('../models/User');
const jwt = require('jsonwebtoken');

const generateToken = (user) => {
  // Ensure the 'type' (userType) is in the JWT payload
  return jwt.sign({ id: user._id, type: user.type }, process.env.JWT_SECRET, {
    expiresIn: '1d',
  });
};

exports.register = async (req, res, io) => {
  try {
    const { username, password, name, phone, type, aadhaarNumber, gstin } = req.body;
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ message: 'Username already exists' });

    const user = new User({
      username,
      password,
      name,
      phone,
      type,
      aadhaarNumber: type === 'vendor' ? aadhaarNumber : null,
      gstin: type === 'supplier' ? gstin : null
    });

    await user.save();
    const token = generateToken(user);

    // Emit real-time notification for new supplier registration
    if (user.type === 'supplier') {
      io.emit('supplier_added', {
        _id: user._id,
        name: user.name,
        username: user.username,
        phone: user.phone,
        gstin: user.gstin,
        verified: user.verified,
        isOnline: user.isOnline
      });
    }

    res.status(201).json({
      message: 'Registration successful',
      token,
      user: {
        id: user._id,
        username: user.username,
        userType: user.type,
        name: user.name
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.login = async (req, res, io) => {
  // --- DEBUG LOG: Check what req.body contains ---
  console.log('Login request body:', req.body);
  // -----------------------------------------------

  try {
    const { username, password, type } = req.body;
    const user = await User.findOne({ username, type });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    const token = generateToken(user);

    res.json({
        message: 'Login successful',
        token,
        user: {
            id: user._id,
            username: user.username,
            userType: user.type,
            name: user.name
        }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
