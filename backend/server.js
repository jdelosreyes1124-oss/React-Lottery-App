require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store);

const db = require('./models');
const predictionRoutes = require('./routes/predictions');
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 5000;

// Create session store
const sessionStore = new SequelizeStore({
  db: db.sequelize,
  tableName: 'sessions',
  checkExpirationInterval: 15 * 60 * 1000, // Cleanup expired sessions every 15 minutes
  expiration: 24 * 60 * 60 * 1000  // 24 hours
});

// ============================================
// MIDDLEWARE
// ============================================

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable if causing issues with frontend
}));
app.use(compression());

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
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

// Session middleware with database store
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production', // true in production with HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax'
  }
}));

// Create session table
sessionStore.sync();

// ============================================
// ROUTES
// ============================================
app.use('/api/auth', authRoutes);
app.use('/api/predictions', predictionRoutes);
app.use('/api/admin', adminRoutes);

// Health check endpoint 
app.get('/api/health', async (req, res) => {
  try {
    await db.sequelize.authenticate();
    const dbVersion = await db.sequelize.query('SELECT version()');
    const stats = await db.sequelize.query('SELECT COUNT(*) as tables FROM information_schema.tables WHERE table_schema = current_schema()');
    
    res.json({
      status: 'healthy',
      database: 'connected',
      dbVersion: dbVersion[0][0].version,
      tableCount: parseInt(stats[0][0].tables),
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '2.0.0',
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message
    });
  }
});

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'Lottery Prediction API',
    version: '2.0.0',
    endpoints: {
      auth: '/api/auth',
      predictions: '/api/predictions',
      admin: '/api/admin',
      health: '/api/health'
    }
  });
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
  
  // Handle specific error types
  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({
      error: 'Validation error',
      details: err.errors.map(e => ({ field: e.path, message: e.message }))
    });
  }
  
  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      error: 'Duplicate entry',
      details: err.errors.map(e => ({ field: e.path, message: e.message }))
    });
  }
  
  res.status(err.status || 500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// ============================================
// DATABASE CONNECTION AND SERVER START
// ============================================
async function startServer() {
  try {
    // Test database connection
    await db.sequelize.authenticate();
    console.log('✅ Database connection established');
    
    // Optional: Sync database (be careful in production!)
    if (process.env.NODE_ENV === 'development' && process.env.DB_SYNC === 'true') {
      await db.sequelize.sync({ alter: true });
      console.log('✅ Database synced');
    }
    
    // Start server
    app.listen(PORT, () => {
      console.log('=====================================');
      console.log(`🚀 Backend server running on port ${PORT}`);
      console.log(`📊 API available at http://localhost:${PORT}/api`);
      console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🗄️  Database: ${process.env.DB_NAME}`);
      console.log('=====================================');
    });
  } catch (error) {
    console.error('❌ Unable to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  await db.sequelize.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing HTTP server');
  await db.sequelize.close();
  process.exit(0);
});

// Start the server
startServer();

module.exports = app;