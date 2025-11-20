require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');

// Initialize app FIRST before using it
const app = express();
const PORT = process.env.PORT || 5000;

// Import routes - CRITICAL: Include historicalResults!
const predictionRoutes = require('./routes/predictions');
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');
const historicalResultsRoutes = require('./routes/historicalResults');
const schedulerRoutes = require('./routes/scheduler');

// Initialize scrapers
const scraper539 = require('./services/scraper539');
console.log('✅ 539 Scraper loaded:', !!scraper539.scrapeLatestResults);

// ============================================
// DATABASE CONNECTION - FIXED
// ============================================
let mongoUri = process.env.MONGODB_URI;
if (!mongoUri.endsWith('/')) mongoUri += '/';
mongoUri += process.env.MONGODB_DB;

console.log('🔄 Connecting to MongoDB...');

// Connect to MongoDB and WAIT for it to be ready
async function connectDatabase() {
  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ MongoDB Atlas connected successfully');
    
    // Wait for connection to fully stabilize
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return true;
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    throw err;
  }
}

// ============================================
// MIDDLEWARE SETUP FUNCTION (called AFTER DB connects)
// ============================================
function setupMiddleware() {
  // ENHANCED CORS configuration for cross-domain requests
  const corsOptions = {
    origin: function(origin, callback) {
      // Allow all origins in development
      if (process.env.NODE_ENV === 'development') {
        return callback(null, true);
      }
      // Production origins
      const allowedOrigins = [
        'https://react-lottery-app-seven.vercel.app',
        'https://lottery-app-2dvh.onrender.com'
      ];
      
      if (!origin) {
        // Allow requests with no origin (like mobile apps or curl)
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
        callback(null, true);
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
    console.log(`🔥 ${req.method} ${req.path} from ${origin || 'no-origin'}`);
    next();
  });

  // ============================================
  // SESSION MIDDLEWARE - FIXED VERSION
  // ============================================
  console.log('🔐 Setting up session store...');
  
  app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-please-change-in-production',
    store: MongoStore.create({
      mongoUrl: mongoUri,  // ✅ Let MongoStore create its own connection
      collectionName: 'sessions_v2',  // ✅ New collection to avoid conflicts
      touchAfter: 24 * 3600,
      ttl: 24 * 60 * 60,
    }),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    proxy: true,
    name: process.env.SESSION_COOKIE_NAME || 'connect.sid',
    cookie: {
      secure: true, // Always use secure cookies
      httpOnly: true,
      sameSite: 'none',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: '/',
      domain: undefined
    }
  }));

  console.log('✅ Session middleware configured successfully');

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
}

// ============================================
// ROUTES SETUP FUNCTION
// ============================================
function setupRoutes() {
  const db = require('./models_mongoose');
  
  // ============================================
  // ROUTES - CRITICAL ORDER FIX
  // ============================================
  // API routes - ORDER MATTERS!
  app.use('/api/auth', authRoutes);
  app.use('/api/predictions', predictionRoutes);

  // CRITICAL: Load historicalResults BEFORE admin routes
  app.use('/api/admin', historicalResultsRoutes);
  console.log('✅ Historical Results routes loaded - handles /api/admin/historical-results/539/*');

  // Admin routes MUST come AFTER historicalResults
  app.use('/api/admin', adminRoutes);
  console.log('✅ Admin routes loaded - conflicting POST route should be commented out');

  // Scheduler routes for web scraping
  app.use('/api/admin', schedulerRoutes);
  console.log('✅ Scheduler routes loaded - handles /api/admin/scheduler/*');

  // ============================================
  // MAGAYO API TESTING
  // ============================================

  app.get('/api/admin/magayo/test', async (req, res) => {
    console.log('\n🧪 MAGAYO API TEST START');
    console.log('═'.repeat(60));
    
    const testResults = {
      timestamp: new Date().toISOString(),
      tests: {},
      summary: {}
    };

    try {
      const axios = require('axios');
      const apiUrl = process.env.MAGAYO_API_URL || 'https://www.magayo.com/api/tickets.php';
      const apiKey = process.env.MAGAYO_API_KEY;

      const GAME_CODE_MAP = {
        '539': 'tw_dailycash539',
        'mark6': 'hk_mark6',
        'lotto649': 'tw_lotto649'
      };

      // Test 1: Environment Variables
      console.log('\n📋 TEST 1: Environment Variables');
      testResults.tests.envVariables = {
        apiUrl: apiUrl,
        hasApiKey: !!apiKey,
        apiKeyLength: apiKey ? apiKey.length : 0,
        status: apiKey ? 'PASSED' : 'FAILED'
      };
      
      if (apiKey) {
        console.log('✅ API URL:', apiUrl);
        console.log('✅ API Key found (length:', apiKey.length, ')');
      } else {
        console.log('❌ MAGAYO_API_KEY is not set');
      }

      // Test 2: API Connectivity
      console.log('\n🌐 TEST 2: API Connectivity');
      try {
        const startTime = Date.now();
        const testUrl = `${apiUrl}?api_key=${apiKey}&game=tw_dailycash539&tickets=1`;
        console.log('Testing URL:', testUrl.replace(apiKey, 'YOUR_API_KEY'));
        
        const response = await axios.get(testUrl, { timeout: 5000 });
        const responseTime = Date.now() - startTime;
        
        console.log('✅ Connected successfully');
        console.log('⏱️  Response time:', responseTime, 'ms');
        console.log('📊 Response status:', response.status);
        
        testResults.tests.connectivity = {
          status: 'PASSED',
          responseTime: responseTime,
          httpStatus: response.status
        };
      } catch (error) {
        console.log('❌ Connection failed:', error.message);
        testResults.tests.connectivity = {
          status: 'FAILED',
          error: error.message
        };
      }

      // Test 3: Game Code Mapping
      console.log('\n🎮 TEST 3: Game Code Mapping');
      testResults.tests.gameCodeMapping = {
        ...GAME_CODE_MAP,
        status: 'PASSED'
      };
      console.log('✅ Game codes configured:');
      Object.entries(GAME_CODE_MAP).forEach(([game, code]) => {
        console.log(`   - ${game}: ${code}`);
      });

      // Test 4: Prediction Request
      console.log('\n🎯 TEST 4: Magayo Prediction Request (539)');
      try {
        const gameType = '539';
        const magayoGameCode = GAME_CODE_MAP[gameType];
        
        const predictionUrl = `${apiUrl}?api_key=${apiKey}&game=${magayoGameCode}&tickets=1`;
        console.log('Requesting prediction for:', gameType);
        
        const startTime = Date.now();
        const response = await axios.get(predictionUrl, { timeout: 5000 });
        const responseTime = Date.now() - startTime;
        
        if (response.data.error && response.data.error > 0) {
          throw new Error(`API error code: ${response.data.error}`);
        }
        
        if (response.data && response.data.tickets && response.data.tickets.length > 0) {
          const ticket = response.data.tickets[0].ticket;
          console.log('✅ Prediction received successfully');
          console.log('🎫 Ticket:', ticket);
          console.log('⏱️  Response time:', responseTime, 'ms');
          
          // Parse the ticket
          const parts = ticket.split(',');
          const numbers = [];
          let bonus = null;
          
          parts.forEach(part => {
            if (part.startsWith('+')) {
              bonus = parseInt(part.substring(1));
            } else {
              numbers.push(parseInt(part));
            }
          });
          
          console.log('🔢 Numbers:', numbers.sort((a, b) => a - b));
          if (bonus) console.log('🎁 Bonus:', bonus);
          
          testResults.tests.predictionRequest = {
            status: 'PASSED',
            gameType: gameType,
            numbers: numbers.sort((a, b) => a - b),
            bonus: bonus,
            responseTime: responseTime,
            rawTicket: ticket
          };
        } else {
          throw new Error('Invalid response format');
        }
      } catch (error) {
        console.log('❌ Prediction request failed:', error.message);
        testResults.tests.predictionRequest = {
          status: 'FAILED',
          error: error.message
        };
      }

      // Test 5: All Game Types
      console.log('\n🎮 TEST 5: Testing All Game Types');
      const gameTests = {};
      
      for (const [gameType, magayoCode] of Object.entries(GAME_CODE_MAP)) {
        try {
          console.log(`\n   Testing ${gameType} (${magayoCode})...`);
          
          const testUrl = `${apiUrl}?api_key=${apiKey}&game=${magayoCode}&tickets=1`;
          const startTime = Date.now();
          const response = await axios.get(testUrl, { timeout: 5000 });
          const responseTime = Date.now() - startTime;
          
          if (response.data.error === 0 || !response.data.error) {
            console.log(`   ✅ ${gameType} working (${responseTime}ms)`);
            gameTests[gameType] = {
              status: 'PASSED',
              responseTime: responseTime
            };
          } else {
            console.log(`   ❌ ${gameType} returned error: ${response.data.error}`);
            gameTests[gameType] = {
              status: 'FAILED',
              errorCode: response.data.error
            };
          }
        } catch (error) {
          console.log(`   ❌ ${gameType} error: ${error.message}`);
          gameTests[gameType] = {
            status: 'FAILED',
            error: error.message
          };
        }
      }
      
      testResults.tests.allGameTypes = gameTests;

      // Summary
      console.log('\n');
      console.log('═'.repeat(60));
      console.log('📊 TEST SUMMARY');
      console.log('═'.repeat(60));
      
      const passedTests = Object.values(testResults.tests)
        .filter(test => test.status === 'PASSED').length;
      const totalTests = Object.keys(testResults.tests).length;
      
      console.log(`✅ Passed: ${passedTests}/${totalTests}`);
      
      Object.entries(testResults.tests).forEach(([testName, result]) => {
        const icon = result.status === 'PASSED' ? '✅' : '❌';
        console.log(`${icon} ${testName}: ${result.status}`);
      });
      
      testResults.summary = {
        totalTests: totalTests,
        passedTests: passedTests,
        failedTests: totalTests - passedTests,
        allTestsPassed: passedTests === totalTests
      };
      
      console.log('');
      console.log('═'.repeat(60));
      console.log('🧪 MAGAYO API TEST END');
      console.log('═'.repeat(60));
      console.log('');

      res.json({
        success: true,
        ...testResults
      });

    } catch (error) {
      console.error('💥 Test error:', error);
      testResults.summary = {
        status: 'FATAL_ERROR',
        error: error.message
      };
      
      res.status(500).json({
        success: false,
        ...testResults
      });
    }
  });

  app.get('/api/admin/magayo/quick-test', async (req, res) => {
    try {
      const axios = require('axios');
      const apiUrl = process.env.MAGAYO_API_URL || 'https://www.magayo.com/api/tickets.php';
      const apiKey = process.env.MAGAYO_API_KEY;
      
      if (!apiKey) {
        return res.status(400).json({
          success: false,
          error: 'MAGAYO_API_KEY not configured'
        });
      }
      
      const testUrl = `${apiUrl}?api_key=${apiKey}&game=tw_dailycash539&tickets=1`;
      const response = await axios.get(testUrl, { timeout: 5000 });
      
      if (response.data.tickets && response.data.tickets.length > 0) {
        res.json({
          success: true,
          status: 'API_WORKING',
          ticket: response.data.tickets[0].ticket
        });
      } else {
        res.json({
          success: false,
          status: 'NO_DATA',
          response: response.data
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        status: 'API_ERROR',
        error: error.message
      });
    }
  });

  // ============================================
  // DEBUG ROUTES
  // ============================================
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
      for (const collection of ['users', 'lottery_results', 'predictions', 'sessions_v2', 'admin_logs']) {
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
        version: '2.0.2',
        environment: process.env.NODE_ENV || 'development',
        cors: {
          origin: req.get('origin') || 'no-origin',
          credentials: true
        },
        routes: {
          historicalResultsLoaded: true,
          adminLoaded: true,
          magayoTestingLoaded: true,
          order: 'historicalResults BEFORE admin (correct)'
        },
        sessionStore: 'MongoDB (sessions_v2 collection)'
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
      version: '2.0.2',
      database: 'MongoDB Atlas',
      sessionStore: 'MongoDB (sessions_v2)',
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
        magayoTesting: {
          fullTest: 'GET /api/admin/magayo/test',
          quickTest: 'GET /api/admin/magayo/quick-test'
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
    } else if (process.env.NODE_ENV === 'development') {
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
}

// ============================================
// SERVER START - FIXED INITIALIZATION ORDER
// ============================================
async function startServer() {
  try {
    console.log('🚀 Starting server initialization...');
    
    // STEP 1: Connect to database FIRST
    await connectDatabase();
    
    // STEP 2: Setup middleware (including sessions) AFTER DB is connected
    setupMiddleware();
    
    // STEP 3: Setup routes
    setupRoutes();
    
    // STEP 4: Start listening
    app.listen(PORT, () => {
      console.log('=====================================');
      console.log(`🚀 Backend server running on port ${PORT}`);
      console.log(`📊 API: http://localhost:${PORT}/api`);
      console.log(`🏥 Health: http://localhost:${PORT}/api/health`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`☁️  Database: MongoDB Atlas - ${process.env.MONGODB_DB}`);
      console.log(`🔐 Session store: MongoDB (sessions_v2) ✅`);
      console.log(`📝 CORS: Enabled for Vercel apps + configured origins`);
      console.log('=====================================');
      console.log('📁 ROUTE LOADING ORDER (CRITICAL):');
      console.log('   1. Auth routes');
      console.log('   2. Predictions routes');
      console.log('   3. Historical Results routes (FIRST for /admin)');
      console.log('   4. Admin routes (SECOND for /admin)');
      console.log('   5. Scheduler routes');
      console.log('   ✅ This ensures 539 routes work correctly');
      console.log('=====================================');
      console.log('🧪 MAGAYO TESTING ENDPOINTS:');
      console.log('   - Full test: GET /api/admin/magayo/test');
      console.log('   - Quick test: GET /api/admin/magayo/quick-test');
      console.log('=====================================');
      console.log('✅ All systems operational!');
      console.log('=====================================');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
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