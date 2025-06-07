const mongoose = require('mongoose');

// models/Coupon.js
// Coupon model schema (models/Coupon.js)
const couponSchema = new mongoose.Schema({
  code: String,
  amount: Number,
  isActive: Boolean,
  usedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
});

module.exports = mongoose.model('Coupon', couponSchema);
