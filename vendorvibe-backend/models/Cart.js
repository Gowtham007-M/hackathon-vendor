const mongoose = require('mongoose');

const CartSchema = new mongoose.Schema({
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: String,
    quantity: Number,
    price: Number,
    minBulk: Number,
    discount: Number,
  }],
});

module.exports = mongoose.model('Cart', CartSchema);