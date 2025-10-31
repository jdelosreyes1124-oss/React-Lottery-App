console.log("✅✅✅ SERVER.JS - VERSION 2025-10-31-B ✅✅✅");

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');

// Import routes
const predictionRoutes = require('./routes/predictions');
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');
const historicalResultsRoutes = require('./routes/historicalResults');
const schedulerRoutes = require('./routes/scheduler');

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================
// DATABASE CONNECTION
// ============================================
let mongoUri = process.env.MONGODB_URI;
if (!mongoUri.endsWith('/')) mongoUri += '/';
mongoUri += process.env.MONGODB_DB;

mongoose.connect(mongoUri)
  .then(() => console.log('✅ MongoDB Atlas connected'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// ============================================
// MIDDLEWARE
// ============================================

// CORS configuration for cross-domain requests
const corsOptions = {
  origin: function(origin, callback) {
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    const allowedOrigins = [
      'https://react-lottery-app-qber.vercel.app',
      'https://lottery-backend-tdqv.onrender.com'
    ];
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      console.warn(`⚠️ Blocked request from unauthorized origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
};

// ✅ FIX 1: This block correctly fixes the Google OAuth popup error
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

app.use(cors(corsOptions));
app.use(helmet({ 
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'development' ? 'dev' : 'combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.set('trust proxy', 1);

// Session middleware with MongoDB store
app.use(session({
  secret: process.env.SESSION_SECRET,
  store: MongoStore.create({ mongoUrl: mongoUri, collectionName: 'sessions' }),
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    secure: true,
    httpOnly: true,
    sameSite: 'none',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    path: '/',
    // ✅ FIX 2: Removed the 'domain' property to allow cookies to work with your Vercel frontend
  }
}));

// ============================================
// ROUTES
// ============================================
app.use('/api/auth', authRoutes);
app.use('/api/predictions', predictionRoutes);
app.use('/api/admin', historicalResultsRoutes); // Must be first for /admin
app.use('/api/admin', adminRoutes);
app.use('/api/admin', schedulerRoutes);

// Health check and other routes...
app.get('/api/health', (req, res) => res.json({ status: 'healthy', timestamp: new Date() }));


// ============================================
// ERROR HANDLING
// ============================================
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.originalUrl });
});

app.use((err, req, res, next) => {
  console.error('💥 Error:', err.stack);
  res.status(err.status || 500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
  });
});

// ============================================
// SERVER START
// ============================================
app.listen(PORT, () => {
  console.log(`🚀 Backend server running on port ${PORT}`);
});

module.exports = app;