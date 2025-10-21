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
app.use(cors({
  origin: 'https://react-lottery-app-qber.vercel.app'}));
// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(compression());

// CORS configuration - Allow multiple origins including all Vercel deployments
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://react-lottery-app-qber.vercel.app',
  'https://react-lottery-app-qber-e5taw4n1h-joshuads-projects-754ba2a4.vercel.app',  // ✅ add this line
  process.env.FRONTEND_URL
].filter(Boolean); // Remove any undefined values

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list OR matches Vercel pattern
    if (allowedOrigins.indexOf(origin) !== -1 || origin.match(/\.vercel\.app$/)) {
      callback(null, true);
    } else {
      console.log('❌ CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
}));

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session middleware with MongoDB store
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  store: MongoStore.create({
    mongoUrl: mongoUri,
    collectionName: 'sessions',
    ttl: 24 * 60 * 60, // 24 hours
    autoRemove: 'native'
  }),
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  }
}));

// ============================================
// ROUTES
// ============================================
app.use('/api/auth', authRoutes);
app.use('/api/predictions', predictionRoutes);
app.use('/api/admin', adminRoutes);

// Health check endpoint 
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
    for (const collection of ['users', 'lottery_results', 'predictions', 'scheduler_jobs', 'admin_logs']) {
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
      environment: process.env.NODE_ENV || 'development'
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
      auth: '/api/auth',
      predictions: '/api/predictions',
      admin: '/api/admin',
      health: '/api/health'
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

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler 
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Global error handler 
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  
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
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
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
      console.log(`🔐 CORS enabled for: ${allowedOrigins.join(', ')} + all *.vercel.app`);
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