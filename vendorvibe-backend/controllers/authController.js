const User = require('../models/User');
const jwt = require('jsonwebtoken');

const generateToken = (user) => {
  return jwt.sign({ id: user._id, type: user.type }, process.env.JWT_SECRET, {
    expiresIn: '1d',
  });
};

exports.register = async (req, res) => {
  try {
    const { username, password, name, phone, type } = req.body;
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ message: 'Username already exists' });

    const user = new User({
      username,
      password,
      name,
      phone,
      type,
      aadhaarDocument: req.file ? req.file.path : null,
    });

    await user.save();
    const token = generateToken(user);
    res.status(201).json({ message: 'Registration successful', token });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { username, password, type } = req.body;
    const user = await User.findOne({ username, type });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    const token = generateToken(user);
    res.json({ token, user: { id: user._id, name: user.name, type: user.type } });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};