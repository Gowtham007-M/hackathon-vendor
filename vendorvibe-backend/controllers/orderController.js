const Order = require('../models/Order');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');

exports.placeOrder = async (req, res) => {
  try {
    const { items, deliveryOption, coupon } = req.body;
    let total = 0;

    // Validate stock and calculate total
    for (const item of items) {
      const product = await Product.findById(item.product);
      if (!product || product.available < item.quantity) {
        return res.status(400).json({ message: `Insufficient stock for ${product.name}` });
      }
      total += item.quantity * product.price;
      if (item.quantity >= product.minBulk) {
        total -= (item.quantity * product.price * product.discount) / 100;
      }
    }

    // Apply coupon discount if valid
    if (coupon) {
      const couponDoc = await Coupon.findOne({ code: coupon });
      if (couponDoc && (!couponDoc.validUntil || couponDoc.validUntil > new Date())) {
        total -= (total * couponDoc.discount) / 100;
      }
    }

    // Add delivery fee
    total += total > 50 ? 0 : (deliveryOption === 'express' ? 15 : 8);

    const order = new Order({
      vendor: req.user.id,
      supplier: items[0].product.supplier, // Assuming all items are from one supplier
      items,
      total,
      deliveryOption,
      coupon,
    });

    await order.save();
    // Update product stock
    for (const item of items) {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { available: -item.quantity },
      });
    }

    res.status(201).json(order);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getOrders = async (req, res) => {
  try {
    const orders = await Order.find({ vendor: req.user.id }).populate('items.product supplier');
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    
    // Valid status values
    const validStatuses = ['pending', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        message: 'Invalid status. Valid statuses are: ' + validStatuses.join(', ')
      });
    }

    const order = await Order.findById(orderId).populate('supplier');
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Check if user is the supplier for this order
    if (order.supplier._id.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to update this order' });
    }

    // Prevent certain status transitions
    if (order.status === 'delivered' || order.status === 'cancelled') {
      return res.status(400).json({ 
        message: `Cannot update status from ${order.status}` 
      });
    }

    // If cancelling order, restore product stock
    if (status === 'cancelled' && order.status !== 'cancelled') {
      for (const item of order.items) {
        await Product.findByIdAndUpdate(item.product, {
          $inc: { available: item.quantity },
        });
      }
    }

    order.status = status;
    order.updatedAt = new Date();
    
    // Add status history
    if (!order.statusHistory) {
      order.statusHistory = [];
    }
    order.statusHistory.push({
      status: status,
      updatedBy: req.user.id,
      updatedAt: new Date()
    });

    await order.save();
    
    res.json({ 
      message: `Order status updated to ${status}`, 
      order 
    });
  } catch (error) {
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
    if (order.vendor._id.toString() !== req.user.id && 
        order.supplier._id.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to view this order' });
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getSupplierOrders = async (req, res) => {
  try {
    const orders = await Order.find({ supplier: req.user.id })
      .populate('items.product')
      .populate('vendor', 'name email')
      .sort({ createdAt: -1 });
    
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};