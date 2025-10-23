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

// Import routes
const predictionRoutes = require('./routes/predictions');
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');

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
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, server-to-server)
    if (!origin) return callback(null, true);
    
    // List of explicitly allowed origins
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001', 
      'http://localhost:5173',
      'https://react-lottery-app-qber.vercel.app',
      process.env.FRONTEND_URL
    ].filter(Boolean); // Remove any undefined values
    
    // Check if origin is allowed
    const isAllowed = 
      allowedOrigins.includes(origin) || 
      /\.vercel\.app$/.test(origin) || // Any Vercel app
      /\.onrender\.com$/.test(origin); // Any Render app
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.log('⚠️ CORS blocked origin:', origin);
      // In development, you might want to allow anyway:
      if (process.env.NODE_ENV === 'development') {
        console.log('🔧 Development mode - allowing origin anyway');
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true, // CRITICAL for cookies/sessions
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'Set-Cookie'],
  exposedHeaders: ['Set-Cookie'],
  optionsSuccessStatus: 200,
  maxAge: 86400 // Cache preflight for 24 hours
};

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
app.set('trust proxy', 1);

// Additional CORS headers middleware
app.use((req, res, next) => {
  // Ensure credentials header is always present
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Log incoming requests for debugging
  if (process.env.NODE_ENV === 'development') {
    console.log(`📥 ${req.method} ${req.path} from ${req.get('origin') || 'no-origin'}`);
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
    secure: process.env.NODE_ENV === 'production', // HTTPS in production
    httpOnly: true, // Prevent XSS attacks
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // Critical for cross-domain
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    // Don't set domain - let it default for maximum compatibility
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
// ROUTES
// ============================================

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/predictions', predictionRoutes);
app.use('/api/admin', adminRoutes);

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
  // Log 404s in development
  if (process.env.NODE_ENV === 'development') {
    console.log(`❌ 404 Not Found: ${req.method} ${req.originalUrl}`);
  }
  
  res.status(404).json({ 
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method,
    message: 'The requested API endpoint does not exist'
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