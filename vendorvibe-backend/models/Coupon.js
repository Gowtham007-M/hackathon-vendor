const mongoose = require('mongoose');

const CouponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  discount: { type: Number, required: true },
  description: { type: String, required: true },
  validUntil: { type: Date },
});

module.exports = mongoose.model('Coupon', CouponSchema);