const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const dbService = require('../services/databaseService');
const db = require('../models_mongoose');
const scheduledScraper = require('../services/scheduledScraper');

// ============================================
// RATE LIMITING
// ============================================
const scraperLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { 
    success: false, 
    error: 'Too many scraper requests. Please try again later.' 
  }
});

// ============================================
// MULTER CONFIGURATION
// ============================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `lottery-data-${Date.now()}.xlsx`);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files are allowed'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

// ============================================
// MIDDLEWARE
// ============================================

// Authentication middleware
const requireAuth = (req, res, next) => {
  console.log('Auth check:', {
    hasSession: !!req.session,
    hasUserId: !!req.session?.userId,
    hasUser: !!req.session?.user,
    sessionId: req.sessionID
  });
  
  if (!req.session?.userId && !req.session?.user) {
    return res.status(401).json({ 
      success: false, 
      error: 'Authentication required',
      message: 'Please log in to access this resource'
    });
  }
  next();
};

// Admin role middleware
const requireAdmin = (req, res, next) => {
  const userRole = req.session?.user?.role;
  
  if (userRole !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      error: 'Admin access required',
      message: 'You do not have permission to access this resource'
    });
  }
  next();
};

// ============================================
// HELPER FUNCTIONS
// ============================================

// Parse Excel file and extract lottery data
function parseExcelFile(filePath, gameType) {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    
    const results = [];
    
    jsonData.forEach((row, index) => {
      let drawDate, numbers, bonus;
      
      // Parse based on game type and Excel structure
      switch(gameType) {
        case '539':
          drawDate = row['Date'] || row['開獎日期'];
          numbers = [];
          for (let i = 1; i <= 5; i++) {
            const num = row[`Number ${i}`] || row[`號碼${i}`] || row[`Num${i}`];
            if (num) numbers.push(parseInt(num));
          }
          break;
          
        case 'mark6':
          drawDate = row['Date'] || row['開獎日期'];
          numbers = [];
          for (let i = 1; i <= 6; i++) {
            const num = row[`Number ${i}`] || row[`號碼${i}`] || row[`Num${i}`];
            if (num) numbers.push(parseInt(num));
          }
          bonus = row['Special'] || row['特別號'];
          break;
          
        case 'lotto649':
          drawDate = row['Date'] || row['開獎日期'];
          numbers = [];
          for (let i = 1; i <= 6; i++) {
            const num = row[`Number ${i}`] || row[`號碼${i}`] || row[`Num${i}`];
            if (num) numbers.push(parseInt(num));
          }
          bonus = row['Special'] || row['特別號'];
          break;
      }
      
      // Validate and add result
      if (drawDate && numbers.length > 0) {
        results.push({
          gameType,
          drawDate: new Date(drawDate),
          numbers: numbers.sort((a, b) => a - b),
          bonus: bonus ? parseInt(bonus) : null,
          source: 'excel_import'
        });
      }
    });
    
    console.log(`Parsed ${results.length} valid results from Excel`);
    return results;
    
  } catch (error) {
    console.error('Error parsing Excel file:', error);
    throw error;
  }
}

// Bulk insert with duplicate checking
async function bulkInsertResults(results, gameType) {
  const inserted = [];
  const skipped = [];
  const errors = [];
  
  for (const result of results) {
    try {
      // Check if result already exists
      const existing = await db.LotteryResult.findOne({
        gameType: result.gameType,
        drawDate: result.drawDate
      });
      
      if (existing) {
        skipped.push({
          date: result.drawDate,
          reason: 'Already exists'
        });
        continue;
      }
      
      // Insert new result
      const newResult = await db.LotteryResult.create(result);
      inserted.push(newResult);
      
    } catch (error) {
      errors.push({
        date: result.drawDate,
        error: error.message
      });
    }
  }
  
  return {
    total: results.length,
    inserted: inserted.length,
    skipped: skipped.length,
    errors: errors.length,
    details: { inserted, skipped, errors }
  };
}

// Sync Excel data with database
async function syncExcelWithDB(filePath, gameType) {
  const startTime = Date.now();
  
  try {
    // Parse Excel file
    const results = parseExcelFile(filePath, gameType);
    
    if (!results || results.length === 0) {
      return {
        source: 'excel',
        imported: 0,
        skipped: 0,
        error: 'No valid data found in Excel file'
      };
    }
    
    // Bulk insert results
    const bulkResult = await bulkInsertResults(results, gameType);
    
    const duration = Date.now() - startTime;
    
    return {
      source: 'excel',
      imported: bulkResult.inserted,
      modified: bulkResult.modified,
      skipped: results.length - bulkResult.total,
      total: results.length,
      duration: `${(duration / 1000).toFixed(2)}s`
    };
  } catch (error) {
    console.error(`Excel sync error for ${gameType}:`, error);
    return {
      source: 'excel',
      imported: 0,
      skipped: 0,
      error: error.message,
      duration: `${((Date.now() - startTime) / 1000).toFixed(2)}s`
    };
  }
}

// ============================================
// HISTORICAL RESULTS ROUTES - WITH FIX
// ============================================

// GET /api/admin/historical-results/:gameType
router.get('/historical-results/:gameType', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { gameType } = req.params;
    const { page = 1, limit = 50 } = req.query;
    
    console.log(`📊 Fetching historical results - Game: ${gameType}, Page: ${page}, Limit: ${limit}`);
    
    // Validate game type
    const validGames = ['539', 'mark6', 'lotto649'];
    if (!validGames.includes(gameType)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid game type',
        validTypes: validGames,
        received: gameType
      });
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Fetch results with pagination
    const results = await db.LotteryResult
      .find({ gameType })
      .sort({ drawDate: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
    const total = await db.LotteryResult.countDocuments({ gameType });

    console.log(`✅ Found ${results.length} results out of ${total} total`);

    res.json({
      success: true,
      data: results || [],
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
        hasMore: skip + results.length < total
      }
    });
  } catch (error) {
    console.error('❌ Error fetching historical results:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch historical results',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/* ========================================================================
   COMMENTED OUT - This route conflicts with historicalResults.js
   The POST route for adding results is handled by historicalResults.js
   which uses Excel-based storage to avoid MongoDB _id errors
   ======================================================================== */

// POST /api/admin/historical-results/:gameType/add
// router.post('/historical-results/:gameType/add', requireAuth, requireAdmin, async (req, res) => {
//   // THIS ROUTE IS INTENTIONALLY COMMENTED OUT
//   // It was causing: MongooseError: document must have an _id before saving
//   // The working implementation is in routes/historicalResults.js
//   // That file handles the 539 game with Excel-based storage
// });

/* ========================================================================
   END OF COMMENTED SECTION
   ======================================================================== */

// DELETE /api/admin/historical-results/:gameType/:resultId
router.delete('/historical-results/:gameType/:resultId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { gameType, resultId } = req.params;
    
    console.log('Deleting result:', { gameType, resultId });
    
    const result = await db.LotteryResult.findOneAndDelete({
      _id: resultId,
      gameType
    });

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Result not found'
      });
    }

    // Log the action
    const userId = req.session.userId || req.session.user?.id;
    if (userId) {
      await dbService.logAdminAction(
        userId,
        'DELETE_HISTORICAL_RESULT',
        { gameType, resultId, result },
        req
      );
    }

    console.log('✅ Result deleted successfully');

    res.json({
      success: true,
      message: 'Result deleted successfully',
      data: result
    });
  } catch (error) {
    console.error('Error deleting result:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete result',
      message: error.message 
    });
  }
});

// PUT /api/admin/historical-results/:gameType/:resultId
router.put('/historical-results/:gameType/:resultId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { gameType, resultId } = req.params;
    const { drawDate, numbers, bonus } = req.body;
    
    console.log('Updating result:', { gameType, resultId });
    
    // Validate input
    if (!drawDate || !numbers || !Array.isArray(numbers)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input data'
      });
    }
    
    const result = await db.LotteryResult.findOneAndUpdate(
      { _id: resultId, gameType },
      {
        drawDate: new Date(drawDate),
        numbers: numbers.sort((a, b) => a - b),
        bonus: bonus || null,
        updatedAt: new Date()
      },
      { new: true }
    );
    
    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Result not found'
      });
    }
    
    // Log the action
    const userId = req.session.userId || req.session.user?.id;
    if (userId) {
      await dbService.logAdminAction(
        userId,
        'UPDATE_HISTORICAL_RESULT',
        { gameType, resultId, newData: { drawDate, numbers, bonus } },
        req
      );
    }
    
    console.log('✅ Result updated successfully');
    
    res.json({
      success: true,
      message: 'Result updated successfully',
      data: result
    });
  } catch (error) {
    console.error('Error updating result:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update result',
      message: error.message 
    });
  }
});

// ============================================
// EXCEL UPLOAD ROUTES
// ============================================

// POST /api/admin/upload/excel/:gameType
router.post('/upload/excel/:gameType', requireAuth, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    const { gameType } = req.params;
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }
    
    // Validate game type
    const validGames = ['539', 'mark6', 'lotto649'];
    if (!validGames.includes(gameType)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid game type',
        validTypes: validGames
      });
    }
    
    console.log(`📤 Processing Excel upload for ${gameType}:`, req.file.originalname);
    
    // Sync Excel with database
    const result = await syncExcelWithDB(req.file.path, gameType);
    
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    
    // Log the action
    const userId = req.session.userId || req.session.user?.id;
    if (userId) {
      await dbService.logAdminAction(
        userId,
        'EXCEL_UPLOAD',
        { gameType, filename: req.file.originalname, result },
        req
      );
    }
    
    res.json({
      success: true,
      message: `Excel data processed for ${gameType}`,
      ...result
    });
    
  } catch (error) {
    console.error('Excel upload error:', error);
    
    // Clean up file on error
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to process Excel file',
      message: error.message
    });
  }
});

// ============================================
// SCRAPER CONTROL ROUTES
// ============================================

// POST /api/admin/scraper/trigger/:gameType
router.post('/scraper/trigger/:gameType', requireAuth, requireAdmin, scraperLimiter, async (req, res) => {
  try {
    const { gameType } = req.params;
    const { options = {} } = req.body;
    
    // Validate game type
    const validGames = ['539', 'mark6', 'lotto649'];
    if (!validGames.includes(gameType)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid game type',
        validTypes: validGames
      });
    }
    
    console.log(`🔄 Triggering scraper for ${gameType}`);
    
    // Run the scraper
    const result = await scheduledScraper.runScraper(gameType, options);
    
    // Log the action
    const userId = req.session.userId || req.session.user?.id;
    if (userId) {
      await dbService.logAdminAction(
        userId,
        'TRIGGER_SCRAPER',
        { gameType, options, result },
        req
      );
    }
    
    res.json({
      success: true,
      message: `Scraper completed for ${gameType}`,
      ...result
    });
    
  } catch (error) {
    console.error('Scraper trigger error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to run scraper',
      message: error.message
    });
  }
});

// GET /api/admin/scraper/status
router.get('/scraper/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const status = scheduledScraper.getStatus();
    
    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    console.error('Error getting scraper status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get scraper status',
      message: error.message
    });
  }
});

// POST /api/admin/scraper/schedule/:gameType
router.post('/scraper/schedule/:gameType', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { gameType } = req.params;
    const { schedule, enabled = true } = req.body;
    
    // Validate game type
    const validGames = ['539', 'mark6', 'lotto649'];
    if (!validGames.includes(gameType)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid game type',
        validTypes: validGames
      });
    }
    
    console.log(`📅 Updating scraper schedule for ${gameType}:`, { schedule, enabled });
    
    // Update schedule
    const result = scheduledScraper.updateSchedule(gameType, schedule, enabled);
    
    // Log the action
    const userId = req.session.userId || req.session.user?.id;
    if (userId) {
      await dbService.logAdminAction(
        userId,
        'UPDATE_SCRAPER_SCHEDULE',
        { gameType, schedule, enabled },
        req
      );
    }
    
    res.json({
      success: true,
      message: `Schedule updated for ${gameType}`,
      ...result
    });
    
  } catch (error) {
    console.error('Schedule update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update schedule',
      message: error.message
    });
  }
});

// ============================================
// USER MANAGEMENT ROUTES
// ============================================

// GET /api/admin/users
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, role, active } = req.query;
    
    // Build filter
    const filter = {};
    if (role) filter.role = role;
    if (active !== undefined) filter.isActive = active === 'true';
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Fetch users
    const users = await db.User
      .find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    // Get total count
    const total = await db.User.countDocuments(filter);
    
    res.json({
      success: true,
      data: users,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
    
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users',
      message: error.message
    });
  }
});

// PUT /api/admin/users/:userId
router.put('/users/:userId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { role, isActive } = req.body;
    
    // Build update object
    const update = {};
    if (role) update.role = role;
    if (isActive !== undefined) update.isActive = isActive;
    
    // Update user
    const user = await db.User.findByIdAndUpdate(
      userId,
      update,
      { new: true, select: '-password' }
    );
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Log the action
    const adminId = req.session.userId || req.session.user?.id;
    if (adminId) {
      await dbService.logAdminAction(
        adminId,
        'UPDATE_USER',
        { userId, updates: update },
        req
      );
    }
    
    res.json({
      success: true,
      message: 'User updated successfully',
      data: user
    });
    
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update user',
      message: error.message
    });
  }
});

// DELETE /api/admin/users/:userId
router.delete('/users/:userId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Prevent self-deletion
    if (userId === req.session.userId || userId === req.session.user?.id) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete your own account'
      });
    }
    
    // Delete user
    const user = await db.User.findByIdAndDelete(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Log the action
    const adminId = req.session.userId || req.session.user?.id;
    if (adminId) {
      await dbService.logAdminAction(
        adminId,
        'DELETE_USER',
        { userId, username: user.username },
        req
      );
    }
    
    res.json({
      success: true,
      message: 'User deleted successfully'
    });
    
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete user',
      message: error.message
    });
  }
});

// ============================================
// ADMIN LOGS ROUTES
// ============================================

// GET /api/admin/logs
router.get('/logs', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, action, userId } = req.query;
    
    // Build filter
    const filter = {};
    if (action) filter.action = action;
    if (userId) filter.user = userId;
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Fetch logs with user details
    const logs = await db.AdminLog
      .find(filter)
      .populate('user', 'username email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    // Get total count
    const total = await db.AdminLog.countDocuments(filter);
    
    res.json({
      success: true,
      data: logs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
    
  } catch (error) {
    console.error('Error fetching admin logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch logs',
      message: error.message
    });
  }
});

// ============================================
// DASHBOARD STATS ROUTES
// ============================================

// GET /api/admin/stats/dashboard
router.get('/stats/dashboard', requireAuth, requireAdmin, async (req, res) => {
  try {
    const stats = {
      users: {
        total: await db.User.countDocuments(),
        active: await db.User.countDocuments({ isActive: true }),
        admins: await db.User.countDocuments({ role: 'admin' })
      },
      results: {
        '539': await db.LotteryResult.countDocuments({ gameType: '539' }),
        'mark6': await db.LotteryResult.countDocuments({ gameType: 'mark6' }),
        'lotto649': await db.LotteryResult.countDocuments({ gameType: 'lotto649' })
      },
      predictions: {
        total: await db.Prediction.countDocuments(),
        today: await db.Prediction.countDocuments({
          createdAt: { $gte: new Date().setHours(0, 0, 0, 0) }
        })
      },
      scraper: scheduledScraper.getStatus()
    };
    
    res.json({
      success: true,
      data: stats
    });
    
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch stats',
      message: error.message
    });
  }
});

// ============================================
// SCHEDULER JOB MANAGEMENT
// ============================================

// GET /api/admin/scheduler/jobs
router.get('/scheduler/jobs', requireAuth, requireAdmin, async (req, res) => {
  try {
    const jobs = await db.SchedulerJob
      .find()
      .sort({ nextRunAt: 1 })
      .lean();
    
    res.json({
      success: true,
      data: jobs
    });
    
  } catch (error) {
    console.error('Error fetching scheduler jobs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch jobs',
      message: error.message
    });
  }
});

// PUT /api/admin/scheduler/jobs/:jobId
router.put('/scheduler/jobs/:jobId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { jobId } = req.params;
    const { isActive, schedule } = req.body;
    
    const update = {};
    if (isActive !== undefined) update.isActive = isActive;
    if (schedule) update.schedule = schedule;
    
    const job = await db.SchedulerJob.findByIdAndUpdate(
      jobId,
      update,
      { new: true }
    );
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }
    
    // Log the action
    const userId = req.session.userId || req.session.user?.id;
    if (userId) {
      await dbService.logAdminAction(
        userId,
        'UPDATE_SCHEDULER_JOB',
        { jobId, updates: update },
        req
      );
    }
    
    res.json({
      success: true,
      message: 'Job updated successfully',
      data: job
    });
    
  } catch (error) {
    console.error('Error updating scheduler job:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update job',
      message: error.message
    });
  }
});

// POST /api/admin/scheduler/jobs/:jobId/run
router.post('/scheduler/jobs/:jobId/run', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const job = await db.SchedulerJob.findById(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }
    
    // Trigger job execution based on type
    let result;
    if (job.type === 'scraper') {
      result = await scheduledScraper.runScraper(job.gameType, job.options);
    } else {
      return res.status(400).json({
        success: false,
        error: 'Unknown job type'
      });
    }
    
    // Update job last run
    job.lastRunAt = new Date();
    job.lastRunStatus = result.success ? 'success' : 'failed';
    job.lastRunResult = result;
    await job.save();
    
    // Log the action
    const userId = req.session.userId || req.session.user?.id;
    if (userId) {
      await dbService.logAdminAction(
        userId,
        'RUN_SCHEDULER_JOB',
        { jobId, jobType: job.type, result },
        req
      );
    }
    
    res.json({
      success: true,
      message: 'Job executed successfully',
      result
    });
    
  } catch (error) {
    console.error('Error running scheduler job:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to run job',
      message: error.message
    });
  }
});

// ============================================
// TEST ROUTE
// ============================================

router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Admin routes are working',
    timestamp: new Date().toISOString(),
    user: req.session?.user
  });
});

module.exports = router;