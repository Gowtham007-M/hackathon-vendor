const Order = require('../models/Order');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');
const User = require('../models/User'); // Assuming you have a User model for supplier details

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

exports.placeOrder = async (req, res, io) => { // Added io parameter
  try {
    const { items, deliveryOption, coupon } = req.body;
    let total = 0;
    let supplierId = null;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'Order must contain items' });
    }

    // Validate stock and calculate total
    for (const item of items) {
      const product = await Product.findById(item.product);
      if (!product) {
        return res.status(400).json({ message: `Product with ID ${item.product} not found` });
      }
      if (product.available < item.quantity) {
        return res.status(400).json({ message: `Insufficient stock for ${product.name}. Available: ${product.available}` });
      }

      // Ensure all items are from the same supplier for a single order
      if (supplierId === null) {
        supplierId = product.supplier;
      } else if (supplierId.toString() !== product.supplier.toString()) {
        return res.status(400).json({ message: 'All items in an order must be from the same supplier.' });
      }

      total += item.quantity * product.price;
      if (item.quantity >= product.minBulk) {
        total -= (item.quantity * product.price * product.discount) / 100;
      }

      // Decrease product available quantity (Moved to after order creation for atomicity)
      // product.available -= item.quantity;
      // await product.save();
    }

    // Apply coupon discount if valid
    if (coupon) {
      const couponDoc = await Coupon.findOne({ code: coupon });
      if (couponDoc && (!couponDoc.validUntil || couponDoc.validUntil > new Date()) && (!couponDoc.usageLimit || couponDoc.usageLimit > 0)) {
        if (total >= couponDoc.minOrderValue) {
          let discountAmount = (total * couponDoc.discount) / 100;
          if (couponDoc.maxDiscount && discountAmount > couponDoc.maxDiscount) {
            discountAmount = couponDoc.maxDiscount;
          }
          total -= discountAmount;
          couponDoc.usageLimit = couponDoc.usageLimit ? couponDoc.usageLimit - 1 : couponDoc.usageLimit;
          await couponDoc.save();
        } else {
          return res.status(400).json({ message: `Coupon requires a minimum order value of ${couponDoc.minOrderValue}` });
        }
      } else if (couponDoc && couponDoc.usageLimit === 0) {
        return res.status(400).json({ message: 'Coupon has reached its usage limit.' });
      } else if (couponDoc) {
        return res.status(400).json({ message: 'Coupon is expired or invalid.' });
      }
    }

    // Add delivery fee
    const deliveryFee = total > 50 ? 0 : (deliveryOption === 'express' ? 15 : 8); // Example logic
    total += deliveryFee;

    const order = new Order({
      vendor: req.user.userId, // Corrected to req.user.userId
      supplier: supplierId,
      items: items.map(item => ({
        product: item.product,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
      })),
      total,
      deliveryOption,
      status: 'pending',
      statusHistory: [{ status: 'pending', updatedBy: req.user.userId, updatedAt: new Date() }], // Corrected to req.user.userId
    });

    await order.save();

    // Now decrement product availability after successful order creation
    for (const item of items) {
      await Product.findByIdAndUpdate(item.product, { $inc: { available: -item.quantity } });
      // Emit product stock update for each product in the order
      const updatedProduct = await Product.findById(item.product);
      if (updatedProduct) {
        io.emit('product_stock_updated', {
          productId: updatedProduct._id,
          newStock: updatedProduct.available,
          productName: updatedProduct.name
        });
      }
    }

    // Populate order details for real-time emission
    const populatedOrder = await Order.findById(order._id)
      .populate('items.product', 'name image')
      .populate('supplier', 'name email')
      .populate('vendor', 'name email');

    // Emit real-time event for new order to vendor and supplier
    emitToUser(io, populatedOrder.vendor._id, 'order_created', populatedOrder);
    emitToUser(io, populatedOrder.supplier._id, 'order_created', populatedOrder);


    res.status(201).json(populatedOrder);
  } catch (error) {
    console.error('Error placing order:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getOrders = async (req, res) => {
  try {
    const userType = req.user.userType; // Corrected to req.user.userType
    const userId = req.user.userId; // Corrected to req.user.userId
    let orders;

    if (userType === 'vendor') {
      orders = await Order.find({ vendor: userId })
        .populate('items.product', 'name price image')
        .populate('supplier', 'name email')
        .sort({ createdAt: -1 });
    } else if (userType === 'supplier') {
      orders = await Order.find({ supplier: userId })
        .populate('items.product', 'name price image')
        .populate('vendor', 'name email')
        .sort({ createdAt: -1 });
    } else {
      return res.status(403).json({ message: 'Access denied. Unknown user type.' });
    }

    res.json(orders);
  } catch (error) {
    console.error('Error getting orders:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.updateOrderStatus = async (req, res, io) => { // Added io parameter
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Only allow supplier to update order status
    if (order.supplier.toString() !== req.user.userId) { // Corrected to req.user.userId
      return res.status(403).json({ message: 'Not authorized to update this order' });
    }

    // Basic validation for status transitions (can be made more robust)
    const validStatuses = ['confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    order.status = status;
    order.statusHistory.push({
      status: status,
      updatedBy: req.user.userId, // Corrected to req.user.userId
      updatedAt: new Date()
    });

    await order.save();

    // Populate order details for real-time emission
    const populatedOrder = await Order.findById(order._id)
      .populate('items.product', 'name image')
      .populate('supplier', 'name email')
      .populate('vendor', 'name email');

    // Emit real-time event for order status change to vendor and supplier
    emitToUser(io, populatedOrder.vendor._id, 'order_status_changed', {
      orderId: populatedOrder._id, // Use _id for consistency with frontend
      newStatus: populatedOrder.status,
      message: `Order #${populatedOrder._id.toString().slice(-6)} status updated to ${populatedOrder.status}`,
      order: populatedOrder // Send the full updated order
    });
    emitToUser(io, populatedOrder.supplier._id, 'order_status_changed', {
      orderId: populatedOrder._id,
      newStatus: populatedOrder.status,
      message: `Order #${populatedOrder._id.toString().slice(-6)} status updated to ${populatedOrder.status}`,
      order: populatedOrder
    });

    res.json({
      message: `Order status updated to ${status}`,
      order: populatedOrder
    });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getOrderById = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId)
      .populate('items.product')
      .populate('supplier', 'name email')
      .populate('vendor', 'name email');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check if user is either the vendor or supplier for this order
    if (order.vendor._id.toString() !== req.user.userId && // Corrected to req.user.userId
        order.supplier._id.toString() !== req.user.userId) { // Corrected to req.user.userId
      return res.status(403).json({ message: 'Not authorized to view this order' });
    }

    res.json(order);
  } catch (error) {
    console.error('Error getting order by ID:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
