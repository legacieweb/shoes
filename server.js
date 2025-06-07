const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const Order = require('./models/Order');
const Coupon = require('./models/Coupon');
const nodemailer = require("nodemailer");


dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
// ------------------------------
// 🔐 Middleware
// ------------------------------
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

const adminAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.isAdmin) {
      return res.status(403).json({ message: 'Admin access denied' });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// ------------------------------
// ✅ MongoDB Connection
// ------------------------------
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// ------------------------------
// 🔐 Admin Login
// ------------------------------
app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;
  if (
    email !== process.env.ADMIN_EMAIL ||
    password !== process.env.ADMIN_PASSWORD
  ) {
    return res.status(401).json({ message: 'Invalid admin credentials' });
  }

  const token = jwt.sign({ isAdmin: true }, process.env.JWT_SECRET, {
    expiresIn: '2h'
  });

  res.json({ token });
});


// ------------------------------
// 🏷️ Coupons (CRUD)
// ------------------------------
app.get('/api/admin/coupons', adminAuth, async (req, res) => {
  const coupons = await Coupon.find();
  res.json(coupons);
});

app.post('/api/admin/coupons', adminAuth, async (req, res) => {
  const { code, amount } = req.body;
  if (!code || !amount) return res.status(400).json({ message: 'Invalid data' });

  try {
    const exists = await Coupon.findOne({ code });
    if (exists) return res.status(400).json({ message: 'Coupon already exists' });

    const newCoupon = new Coupon({ code: code.toUpperCase(), amount, isActive: true });
    await newCoupon.save();
    res.status(201).json({ message: 'Coupon created', coupon: newCoupon });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.delete('/api/admin/coupons/:id', adminAuth, async (req, res) => {
  try {
    await Coupon.findByIdAndDelete(req.params.id);
    res.json({ message: 'Coupon deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting coupon' });
  }
});

// Optional: Update Coupon
app.put('/api/admin/coupons/:id', adminAuth, async (req, res) => {
  try {
    const { code, amount, isActive } = req.body;
    const updated = await Coupon.findByIdAndUpdate(req.params.id, {
      code: code.toUpperCase(),
      amount,
      isActive
    }, { new: true });

    res.json({ message: 'Coupon updated', coupon: updated });
  } catch (err) {
    res.status(500).json({ message: 'Error updating coupon' });
  }
});

// ------------------------------
// 👥 Admin: User Management
// ------------------------------
app.get('/api/admin/users', adminAuth, async (req, res) => {
  try {
    const users = await User.find().select('name email createdAt').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Failed to load users' });
  }
});

app.get('/api/admin/users/:id/details', adminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('name email createdAt');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const orders = await Order.find({ userId: user._id }).sort({ createdAt: -1 });
    const totalSpent = orders.reduce((sum, order) => sum + (order.totalPrice || 0), 0);

    res.json({ user, orders, totalSpent });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch user details' });
  }
});


// ------------------------------
// 📊 Admin: Analytics
// ------------------------------
app.get('/api/admin/analytics', adminAuth, async (req, res) => {
  try {
    const orders = await Order.find().populate('userId', 'name email');

    let totalRevenue = 0;
    let productSales = {};
    orders.forEach(order => {
      order.items.forEach(item => {
        totalRevenue += item.price * item.quantity;

        if (!productSales[item.name]) {
          productSales[item.name] = {
            quantity: 0,
            revenue: 0,
            image: item.image,
            price: item.price
          };
        }

        productSales[item.name].quantity += item.quantity;
        productSales[item.name].revenue += item.price * item.quantity;
      });
    });

    const totalOrders = orders.length;
    const totalUsers = await User.countDocuments();

    res.json({
      totalRevenue,
      totalOrders,
      totalUsers,
      productSales
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load analytics' });
  }
});

// ------------------------------
// 👤 User Auth Routes
// ------------------------------
app.post('/api/auth/signup', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ message: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    user = new User({ name, email, password: hashedPassword });
    await user.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '2h' });
    res.status(201).json({ token });
  } catch (err) {
    res.status(500).json({ message: 'Signup error', error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid email or password' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid email or password' });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '2h' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: 'Login error' });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/orders', authMiddleware, async (req, res) => {
  const { items, deliveryAddress, coupon, discount, shippingFee = 0, paymentRef } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Cart is empty' });
  }

  const requiredFields = ['name', 'email', 'phone', 'address', 'country', 'state', 'city', 'zip'];
  const missing = requiredFields.filter(field => !deliveryAddress?.[field]);
  if (missing.length > 0) {
    return res.status(400).json({ message: `Missing delivery fields: ${missing.join(', ')}` });
  }

  try {
    let validCoupon = null;

    if (coupon) {
      validCoupon = await Coupon.findOne({
        code: coupon.toUpperCase(),
        isActive: true
      });

      if (!validCoupon) {
        return res.status(400).json({ message: 'Coupon is invalid or already used' });
      }

      const usedBefore = await Order.findOne({
        userId: req.user.id,
        coupon: coupon.toUpperCase()
      });

      if (usedBefore) {
        return res.status(400).json({ message: 'You have already used this coupon' });
      }
    }

    const normalizedItems = items.map(item => ({
      name: item.name || 'Unnamed Product',
      price: item.price || 0,
      size: item.size || 'N/A',
      color: item.color || 'N/A',
      productId: item.productId || '',
      quantity: item.quantity || 1,
      image: item.image || ''
    }));

    const itemTotal = normalizedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const finalPrice = itemTotal - (discount || 0) + (shippingFee || 0);

    const order = new Order({
      userId: req.user.id,
      items: normalizedItems,
      deliveryAddress,
      totalPrice: finalPrice,
      discount: discount || 0,
      shippingFee,
      coupon: coupon?.toUpperCase() || null,
      paymentRef: paymentRef || ''
    });

    await order.save();

    if (validCoupon) {
      validCoupon.isActive = false;
      await validCoupon.save();
    }

    // ---------------------------
    // 📧 Email: Setup transporter
    // ---------------------------
    const transporter = nodemailer.createTransport({
      service: 'Gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    // Format items for display
    const itemDetailsHTML = normalizedItems.map(item =>
      `<li>${item.quantity} × ${item.name} - $${item.price} (${item.color}, ${item.size})</li>`
    ).join('');

    // ---------------------------
    // 📧 Email to User
    // ---------------------------
    const userEmail = {
      to: deliveryAddress.email,
      from: process.env.EMAIL_USER,
      subject: '✅ Your Order Confirmation',
      html: `
        <h2>🛍️ Thank you for your order!</h2>
        <p>Here's what you ordered:</p>
        <ul>${itemDetailsHTML}</ul>
        <p><strong>Discount:</strong> $${discount || 0}</p>
        <p><strong>Shipping Fee:</strong> $${shippingFee}</p>
        <p><strong>Total Paid:</strong> $${finalPrice}</p>
        <p>We'll notify you when it's shipped. 🚚</p>
      `
    };

    // ---------------------------
    // 📧 Email to Admin
    // ---------------------------
    const adminEmail = {
      to: process.env.ADMIN_EMAIL,
      from: process.env.EMAIL_USER,
      subject: '📦 New Order Received',
      html: `
        <h2>New Order Placed</h2>
        <p><strong>User:</strong> ${deliveryAddress.name} (${deliveryAddress.email})</p>
        <p><strong>Phone:</strong> ${deliveryAddress.phone}</p>
        <h4>📍 Shipping Address:</h4>
        <p>${deliveryAddress.address}, ${deliveryAddress.city}, ${deliveryAddress.state}, ${deliveryAddress.zip}, ${deliveryAddress.country}</p>
        <h4>🛍️ Items:</h4>
        <ul>${itemDetailsHTML}</ul>
        <p><strong>Discount:</strong> $${discount || 0}</p>
        <p><strong>Shipping:</strong> $${shippingFee}</p>
        <p><strong>Total:</strong> $${finalPrice}</p>
        <p><strong>Coupon:</strong> ${coupon || 'None'}</p>
      `
    };

    // Send emails
    transporter.sendMail(userEmail, err => {
      if (err) console.error('❌ Email to user failed:', err.message);
    });

    transporter.sendMail(adminEmail, err => {
      if (err) console.error('❌ Email to admin failed:', err.message);
    });

    res.status(201).json({ message: 'Order placed successfully', order });

  } catch (err) {
    console.error('❌ Order creation error:', err);
    res.status(500).json({ message: 'Server error during order processing' });
  }
});


app.get('/api/coupons/:code', authMiddleware, async (req, res) => {
  const { code } = req.params;
  const userId = req.user.id;

  try {
    // Check if it's the automatic discount
    if (code.trim().toUpperCase() === "AUTOMATIC DISCOUNT") {
      const user = await User.findById(userId);
      if (user.hasUsedAutomaticDiscount) {
        return res.status(400).json({ message: 'You have already used the Automatic Discount.' });
      }
    }

    const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
    if (!coupon) return res.status(404).json({ message: 'Coupon not found or inactive' });

    if (coupon.usedBy?.includes(userId)) {
      return res.status(400).json({ message: 'You have already used this coupon' });
    }

    res.json({ amount: coupon.amount });
  } catch (err) {
    res.status(500).json({ message: 'Server error while fetching coupon' });
  }
});


// ✅ ADMIN: Get all orders
app.get('/api/admin/orders', adminAuth, async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('userId', 'name email')
      .sort({ createdAt: -1 });

    const formatted = orders.map(order => {
      const itemTotal = order.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
      return {
        id: order._id,
        user: {
          name: order.userId?.name || 'N/A',
          email: order.userId?.email || 'N/A'
        },
        items: order.items,
        deliveryAddress: order.deliveryAddress,
        totalPrice: order.totalPrice || (itemTotal - (order.discount || 0) + (order.shippingFee || 0)),
        discount: order.discount || 0,
        shippingFee: order.shippingFee || 0,
        coupon: order.coupon || null,
        paymentRef: order.paymentRef || null,
        status: order.status || 'Pending',
        createdAt: order.createdAt
      };
    });

    res.json(formatted);
  } catch (err) {
    console.error('Order fetch error:', err);
    res.status(500).json({ message: 'Failed to load orders' });
  }
});


// ✅ USER: Get current user's orders
app.get('/api/user/orders', authMiddleware, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .select('-__v')
      .lean();

    const enriched = orders.map(order => {
      const itemTotal = order.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
      return {
        id: order._id,
        items: order.items,
        deliveryAddress: order.deliveryAddress,
        coupon: order.coupon,
        discount: order.discount || 0,
        shippingFee: order.shippingFee || 0,
        totalPrice: order.totalPrice || (itemTotal - (order.discount || 0) + (order.shippingFee || 0)),
        paymentRef: order.paymentRef || null,
        status: order.status || 'Pending',
        createdAt: order.createdAt
      };
    });

    res.status(200).json(enriched);
  } catch (err) {
    console.error('❌ Failed to fetch user orders:', err);
    res.status(500).json({ message: 'Failed to fetch orders' });
  }
});


// ✅ ADMIN: Update order status
app.patch('/api/admin/orders/:id/status', adminAuth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const allowedStatuses = [
      'Pending', 'Confirmed', 'Ready for Shipping',
      'Shipped', 'Delivered', 'Cancelled'
    ];

    if (!allowedStatuses.includes(req.body.status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    order.status = req.body.status;
    await order.save();

    res.json({ message: 'Status updated', status: order.status });
  } catch (err) {
    console.error('Update error:', err);
    res.status(500).json({ message: 'Failed to update order status' });
  }
});

app.post('/api/auth/change-password', authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Current password is incorrect' });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    res.json({ message: '✅ Password updated successfully!' });
  } catch (err) {
    console.error('Error changing password:', err);
    res.status(500).json({ message: 'Server error' });
  }
});
// ------------------------------
// 🔁 Reset Password
// ------------------------------
app.post('/api/auth/reset-password', async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'User not found' });

    // Generate token
    const resetToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    // Save token and expiration in user model (you can add these fields)
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpire = Date.now() + 3600000; // 1 hour
    await user.save();

    // Create reset URL
    const resetUrl = `http://localhost:5000/resetpassword/?token=${resetToken}`;

    // Send email (basic example)
    const transporter = nodemailer.createTransport({
      service: 'Gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const mailOptions = {
      to: user.email,
      from: process.env.EMAIL_USER,
      subject: 'Password Reset Request',
      html: `<p>You requested a password reset. Click the link below:</p>
             <a href="${resetUrl}">${resetUrl}</a>`
    };

    transporter.sendMail(mailOptions, (err) => {
      if (err) {
        console.error('Email error:', err);
        return res.status(500).json({ message: 'Error sending email' });
      }
      res.json({ message: 'Password reset email sent' });
    });
  } catch (err) {
    console.error('Reset error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Route to handle resetting the password with token
app.post('/api/auth/reset-password/:token', async (req, res) => {
  const { password } = req.body;
  const { token } = req.params;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user || !user.resetPasswordToken || user.resetPasswordExpire < Date.now()) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.json({ message: 'Password successfully reset' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});





app.post('/api/auth/mark-automatic-discount-used', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.hasUsedAutomaticDiscount) {
      return res.status(400).json({ message: 'Already marked as used' });
    }

    user.hasUsedAutomaticDiscount = true;
    await user.save();

    res.json({ message: 'Automatic discount marked as used' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});
// ------------------------------
// 🚀 Start Server
// ------------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
