const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: String,
    quantity: Number,
    price: Number,
  }],
  total: { type: Number, required: true },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending',
  },
  date: { type: Date, default: Date.now },
  deliveryOption: { type: String, enum: ['standard', 'express'], default: 'standard' },
  coupon: { type: String },
});

module.exports = mongoose.model('Order', OrderSchema);