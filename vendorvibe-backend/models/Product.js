// Product.js
const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true }, // 'name' is required
  price: { type: Number, required: true },
  available: { type: Number, required: true },
  minBulk: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // 'supplier' is required
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
});

module.exports = mongoose.model('Product', ProductSchema);