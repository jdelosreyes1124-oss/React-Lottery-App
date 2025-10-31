require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');

// Import MongoDB models
const db = require('./models_mongoose');

// Import routes - CRITICAL: Include historicalResults!
const predictionRoutes = require('./routes/predictions');
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');
const historicalResultsRoutes = require('./routes/historicalResults');
const schedulerRoutes = require('./routes/scheduler');

// Initialize scrapers
const scraper539 = require('./services/scraper539');
console.log('✅ 539 Scraper loaded:', !!scraper539.scrapeLatestResults);

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================
// DATABASE CONNECTION
// ============================================
let mongoUri = process.env.MONGODB_URI;
if (!mongoUri.endsWith('/')) mongoUri += '/';
mongoUri += process.env.MONGODB_DB;

// Connect to MongoDB
mongoose.connect(mongoUri)
  .then(() => console.log('✅ MongoDB Atlas connected'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// ============================================
// MIDDLEWARE
// ============================================

// ENHANCED CORS configuration for cross-domain requests
const corsOptions = {
  origin: function(origin, callback) {
    // Allow all origins in development
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }

    // Production origins
    const allowedOrigins = [
      'https://react-lottery-app-qber.vercel.app',
      'https://lottery-backend-tdqv.onrender.com'
    ];
    
    if (!origin) {
      // Allow requests with no origin (like mobile apps or curl)
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, origin);  // Return the origin instead of true
    } else {
      console.warn(`⚠️ Blocked request from unauthorized origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'Set-Cookie'],
  exposedHeaders: ['Set-Cookie'],
  optionsSuccessStatus: 200,
  maxAge: 86400
};
// COOP headers removed to allow Google OAuth popup communication
// These headers were blocking window.postMessage from Google OAuth
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Handle preflight requests

// Security headers
app.use(helmet({ 
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Compression
app.use(compression());

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Trust proxy (required for Render/Vercel)
app.enable('trust proxy');
app.set('trust proxy', 1);

// CORS and security middleware
app.use((req, res, next) => {
  const origin = req.get('origin');
  
  // Log all requests in production for debugging CORS
  console.log(`📥 ${req.method} ${req.path} from ${origin || 'no-origin'}`);
  
  // Ensure CORS headers are present
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Only set origin if it's allowed
  if (origin && (origin === 'https://react-lottery-app-qber.vercel.app' || 
                 origin.endsWith('.vercel.app') || 
                 process.env.NODE_ENV === 'development')) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,PATCH');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie, Set-Cookie');
    return res.status(200).json({ status: 'ok' });
  }
  
  next();
});

// Session middleware with MongoDB store
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-please-change-in-production',
  store: MongoStore.create({
    mongoUrl: mongoUri,
    collectionName: 'sessions',
    touchAfter: 24 * 3600, // Lazy session update (in seconds)
    crypto: {
      secret: process.env.SESSION_SECRET || 'your-secret-key-please-change-in-production'
    }
  }),
  resave: false,
  saveUninitialized: false,
  proxy: true, // Trust the reverse proxy
  name: 'connect.sid', // Session cookie name
  cookie: {
    secure: true, // Always use secure cookies
    httpOnly: true, // Prevent XSS attacks
    sameSite: 'none', // Required for cross-origin
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    path: '/',
    domain: process.env.NODE_ENV === 'production' ? '.onrender.com' : undefined
  }
}));

// Debug middleware for sessions (remove in production)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log('🔐 Session Debug:', {
      sessionID: req.sessionID,
      hasSession: !!req.session,
      userId: req.session?.userId,
      user: req.session?.user?.username
    });
    next();
  });
}

// ============================================
// ROUTES - CRITICAL ORDER FIX
// ============================================

// API routes - ORDER MATTERS!
app.use('/api/auth', authRoutes);
app.use('/api/predictions', predictionRoutes);

// CRITICAL: Load historicalResults BEFORE admin routes
// This handles /api/admin/historical-results/539/* routes
app.use('/api/admin', historicalResultsRoutes);
console.log('✅ Historical Results routes loaded - handles /api/admin/historical-results/539/*');

// Admin routes MUST come AFTER historicalResults
// Make sure the conflicting POST route is commented out in admin.js
app.use('/api/admin', adminRoutes);
console.log('✅ Admin routes loaded - conflicting POST route should be commented out');

// Scheduler routes for web scraping
app.use('/api/admin', schedulerRoutes);
console.log('✅ Scheduler routes loaded - handles /api/admin/scheduler/*');

// Debug route to verify historicalResults routes are loaded
app.get('/api/admin/test-historical', (req, res) => {
  res.json({
    success: true,
    message: 'Historical routes are properly loaded',
    expectedRoutes: [
      'GET /api/admin/historical-results/539',
      'POST /api/admin/historical-results/539/add',
      'DELETE /api/admin/historical-results/539/:id',
      'POST /api/admin/historical-results/539/sync',
      'GET /api/admin/historical-results/539/status'
    ],
    note: 'These routes should now be accessible'
  });
});

// Health check endpoint with detailed info
app.get('/api/health', async (req, res) => {
  try {
    const dbState = mongoose.connection.readyState;
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    
    // Get collection stats
    const collections = await mongoose.connection.db.listCollections().toArray();
    
    // Get document counts
    const stats = {};
    for (const collection of ['users', 'lottery_results', 'predictions', 'sessions', 'admin_logs']) {
      try {
        stats[collection] = await mongoose.connection.db.collection(collection).countDocuments();
      } catch (err) {
        stats[collection] = 0;
      }
    }
    
    res.json({
      status: 'healthy',
      database: states[dbState],
      dbName: mongoose.connection.name,
      collections: collections.length,
      documents: stats,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '2.0.0',
      environment: process.env.NODE_ENV || 'development',
      cors: {
        origin: req.get('origin') || 'no-origin',
        credentials: true
      },
      routes: {
        historicalResultsLoaded: true,
        adminLoaded: true,
        order: 'historicalResults BEFORE admin (correct)'
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      database: 'error',
      error: error.message
    });
  }
});

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'Lottery Prediction API',
    version: '2.0.0',
    database: 'MongoDB Atlas',
    endpoints: {
      auth: {
        login: 'POST /api/auth/login',
        logout: 'POST /api/auth/logout',
        verify: 'GET /api/auth/verify',
        register: 'POST /api/auth/register'
      },
      predictions: {
        predict: 'POST /api/predictions/:gameType',
        automation: 'POST /api/predictions/:gameType/automation',
        allPastResults: 'GET /api/predictions/all-past-results/:gameType'
      },
      admin: {
        historicalResults: 'GET /api/admin/historical-results/:gameType',
        addResult: 'POST /api/admin/historical-results/:gameType/add',
        deleteResult: 'DELETE /api/admin/historical-results/:gameType/:id',
        syncExcel: 'POST /api/admin/historical-results/:gameType/sync',
        schedulerStatus: 'GET /api/admin/scheduler/status/:gameType',
        triggerScrape: 'POST /api/admin/scheduler/trigger/:gameType'
      },
      historicalRoutes: {
        get539: 'GET /api/admin/historical-results/539',
        add539: 'POST /api/admin/historical-results/539/add',
        delete539: 'DELETE /api/admin/historical-results/539/:id',
        sync539: 'POST /api/admin/historical-results/539/sync',
        status539: 'GET /api/admin/historical-results/539/status'
      },
      health: 'GET /api/health'
    }
  });
});

// Test endpoint for lottery results
app.get('/api/lottery-results/latest', async (req, res) => {
  try {
    const games = ['539', 'mark6', 'lotto649'];
    const results = {};
    
    for (const game of games) {
      results[game] = await db.LotteryResult
        .findOne({ gameType: game })
        .sort({ drawDate: -1 })
        .lean();
    }
    
    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test CORS endpoint
app.get('/api/test-cors', (req, res) => {
  res.json({
    success: true,
    message: 'CORS is working!',
    origin: req.get('origin') || 'no-origin',
    headers: {
      'access-control-allow-origin': res.get('access-control-allow-origin'),
      'access-control-allow-credentials': res.get('access-control-allow-credentials')
    }
  });
});

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use('*', (req, res) => {
  // Special logging for historical-results 404s
  if (req.originalUrl.includes('historical-results')) {
    console.error('❌ 404 for historical-results route:', req.method, req.originalUrl);
    console.error('   This means the route is not properly registered');
    console.error('   Check that historicalResults.js exports router correctly');
  } else if (process.env.NODE_ENV === 'development') {
    console.log(`❌ 404 Not Found: ${req.method} ${req.originalUrl}`);
  }
  
  res.status(404).json({ 
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method,
    message: 'The requested API endpoint does not exist',
    debug: req.originalUrl.includes('historical-results') 
      ? 'Historical results route not found - check route registration' 
      : undefined
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('💥 Error:', err.stack);
  
  // Handle CORS errors
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      error: 'CORS error',
      message: 'Origin not allowed',
      origin: req.get('origin')
    });
  }
  
  // Handle specific MongoDB error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation error',
      details: Object.values(err.errors).map(e => ({ 
        field: e.path, 
        message: e.message 
      }))
    });
  }
  
  if (err.code === 11000) { // MongoDB duplicate key error
    const field = Object.keys(err.keyPattern)[0];
    return res.status(409).json({
      error: 'Duplicate entry',
      field: field,
      message: `${field} already exists`
    });
  }
  
  // Handle Mongoose _id error specifically
  if (err.message && err.message.includes('document must have an _id')) {
    return res.status(500).json({
      error: 'Database error',
      message: 'Document ID error - this route may have a conflict',
      debug: 'Check if admin.js POST route is commented out'
    });
  }
  
  res.status(err.status || 500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// ============================================
// SERVER START
// ============================================
async function startServer() {
  try {
    // Wait for database connection
    await db.connectDB();
    
    // Start server
    app.listen(PORT, () => {
      console.log('=====================================');
      console.log(`🚀 Backend server running on port ${PORT}`);
      console.log(`📊 API available at http://localhost:${PORT}/api`);
      console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`☁️  Database: MongoDB Atlas - ${process.env.MONGODB_DB}`);
      console.log(`🔐 Session store: MongoDB`);
      console.log(`📝 CORS: Enabled for Vercel apps + configured origins`);
      console.log('=====================================');
      console.log('📁 ROUTE LOADING ORDER (CRITICAL):');
      console.log('   1. Auth routes');
      console.log('   2. Predictions routes');
      console.log('   3. Historical Results routes (FIRST for /admin)');
      console.log('   4. Admin routes (SECOND for /admin)');
      console.log('   ✅ This ensures 539 routes work correctly');
      console.log('=====================================');
    });
  } catch (error) {
    console.error('❌ Unable to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing connections');
  await mongoose.connection.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing connections');
  await mongoose.connection.close();
  process.exit(0);
});

// Start the server
startServer();

module.exports = app;