const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const customerRoutes = require('./routes/customerRoutes');
const orderRoutes = require('./routes/orderRoutes');
const deliveryRoutes = require('./routes/deliveryRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const reportRoutes = require('./routes/reportRoutes');
const userRoutes = require('./routes/userRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cookie parser
app.use(cookieParser());

// Enable CORS
app.use(cors({
  origin: true,
  credentials: true
}));

// Static files directory
const publicDir = path.resolve(__dirname, '../public');
app.use(express.static(publicDir));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'AquaTrack API',
    timestamp: new Date().toISOString()
  });
});

// Public runtime config for the browser. The Maps browser key is meant to be
// used client-side and must be referrer-restricted in Google Cloud Console.
app.get('/api/config', (req, res) => {
  res.status(200).json({ mapsBrowserKey: process.env.MAPS_BROWSER_KEY || '' });
});

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/deliveries', deliveryRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/users', userRoutes);

// Page Routing
app.get('/login', (req, res) => {
  res.sendFile('login.html', { root: publicDir });
});

app.get('/dashboard', (req, res) => {
  res.sendFile('index.html', { root: publicDir });
});

// Default root route
app.get('/', (req, res) => {
  if (req.cookies && req.cookies.token) {
    return res.redirect('/dashboard');
  }
  return res.redirect('/login');
});

// Central error handling middleware
app.use(errorHandler);

module.exports = app;
