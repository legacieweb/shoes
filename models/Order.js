const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  items: [{
    name: String,
    price: Number,
    size: String,
    color: String,
    productId: String,
    quantity: Number,
    image: String
  }],

  deliveryAddress: {
    name: String,
    email: String,
    phone: String,
    address: String,
    country: String,
    state: String,
    city: String,
    zip: String
  },

  coupon: {
    type: String,
    default: null                      // 🎟️ Coupon code applied
  },

  discount: {
    type: Number,
    default: 0                         // 💸 Discount applied
  },

  shippingFee: {
    type: Number,
    default: 0                         // 🚚 Calculated shipping fee
  },

  totalPrice: {
    type: Number,
    required: true                    // ✅ Final amount: items - discount + shipping
  },

  paymentRef: {
    type: String,
    default: ''                        // 🧾 Paystack or other payment gateway reference
  },

  status: {
    type: String,
    enum: [
      'Pending',
      'Confirmed',
      'Ready for Shipping',
      'Shipped',
      'Delivered',
      'Cancelled'
    ],
    default: 'Pending'                 // 📦 Order lifecycle state
  },

  createdAt: {
    type: Date,
    default: Date.now                  // 🕒 Timestamp
  }
});

module.exports = mongoose.model('Order', orderSchema);
