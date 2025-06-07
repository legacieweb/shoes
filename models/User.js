const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  resetPasswordToken: String,
resetPasswordExpire: Date,
hasUsedAutomaticDiscount: {
  type: Boolean,
  default: false
}
});

module.exports = mongoose.model('User', userSchema);
