const Cart = require('../models/Cart');
const Product = require('../models/Product');
const User = require('../models/User'); // Import User model for socketId

// Helper function to emit to a specific user
const emitToUser = async (io, userId, event, data) => {
  try {
    const user = await User.findById(userId);
    if (user && user.socketId) {
      io.to(user.socketId).emit(event, data);
    }
  } catch (error) {
    console.error('Error emitting to user:', error);
  }
};

exports.addToCart = async (req, res, io) => { // Added io parameter
  try {
    const { productId, quantity } = req.body;
    const product = await Product.findById(productId);
    if (!product || product.available < quantity) {
      return res.status(400).json({ message: 'Invalid product or insufficient stock' });
    }

    let cart = await Cart.findOne({ vendor: req.user.userId }); // Corrected to req.user.userId
    if (!cart) {
      cart = new Cart({ vendor: req.user.userId, items: [] }); // Corrected to req.user.userId
    }

    const itemIndex = cart.items.findIndex(item => item.product.toString() === productId);
    if (itemIndex > -1) {
      cart.items[itemIndex].quantity += quantity;
    } else {
      cart.items.push({
        product: productId,
        name: product.name,
        quantity,
        price: product.price,
        minBulk: product.minBulk,
        discount: product.discount,
      });
    }

    await cart.save();

    // Emit real-time cart update to the specific vendor
    const updatedCart = await Cart.findById(cart._id).populate('items.product');
    emitToUser(io, req.user.userId, 'cart:updated', updatedCart);

    res.json(updatedCart);
  } catch (error) {
    console.error('Error adding to cart:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ vendor: req.user.userId }).populate('items.product'); // Corrected to req.user.userId
    if (!cart) {
      return res.json({ items: [] });
    }
    res.json(cart);
  } catch (error) {
    console.error('Error getting cart:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.removeFromCart = async (req, res, io) => { // Added io parameter
  try {
    const { productId } = req.params;
    const cart = await Cart.findOne({ vendor: req.user.userId }); // Corrected to req.user.userId
    if (!cart) {
      return res.status(404).json({ message: 'Cart not found' });
    }

    cart.items = cart.items.filter(item => item.product.toString() !== productId);
    await cart.save();

    // Emit real-time cart update to the specific vendor
    const updatedCart = await Cart.findById(cart._id).populate('items.product');
    emitToUser(io, req.user.userId, 'cart:updated', updatedCart);

    res.json({ message: 'Item removed from cart', cart: updatedCart });
  } catch (error) {
    console.error('Error removing from cart:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.updateCartItemQuantity = async (req, res, io) => { // Added io parameter, renamed from updateQuantity
  try {
    const { productId } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({ message: 'Quantity must be at least 1' });
    }

    const product = await Product.findById(productId);
    if (!product || product.available < quantity) {
      return res.status(400).json({ message: 'Invalid product or insufficient stock' });
    }

    const cart = await Cart.findOne({ vendor: req.user.userId }); // Corrected to req.user.userId
    if (!cart) {
      return res.status(404).json({ message: 'Cart not found' });
    }

    const itemIndex = cart.items.findIndex(item => item.product.toString() === productId);
    if (itemIndex === -1) {
      return res.status(404).json({ message: 'Item not found in cart' });
    }

    cart.items[itemIndex].quantity = quantity;
    await cart.save();

    // Emit real-time cart update to the specific vendor
    const updatedCart = await Cart.findById(cart._id).populate('items.product');
    emitToUser(io, req.user.userId, 'cart:updated', updatedCart);

    res.json({ message: 'Quantity updated', cart: updatedCart });
  } catch (error) {
    console.error('Error updating cart item quantity:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.clearCart = async (req, res, io) => { // Added io parameter
  try {
    const cart = await Cart.findOne({ vendor: req.user.userId }); // Corrected to req.user.userId
    if (!cart) {
      return res.status(404).json({ message: 'Cart not found' });
    }

    cart.items = [];
    await cart.save();

    // Emit real-time cart update to the specific vendor
    const updatedCart = await Cart.findById(cart._id).populate('items.product');
    emitToUser(io, req.user.userId, 'cart:updated', updatedCart);

    res.json({ message: 'Cart cleared', cart: updatedCart });
  } catch (error) {
    console.error('Error clearing cart:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
