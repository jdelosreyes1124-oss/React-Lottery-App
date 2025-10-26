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
// AUTHENTICATION MIDDLEWARE
// ============================================

// Check if user is authenticated
const requireAuth = (req, res, next) => {
  console.log('Auth check:', {
    hasSession: !!req.session,
    hasUserId: !!req.session?.userId,
    hasUser: !!req.session?.user,
    sessionId: req.sessionID
  });

  // Check both userId and user object for compatibility
  if (!req.session || (!req.session.userId && !req.session.user)) {
    return res.status(401).json({ 
      success: false, 
      error: 'Not authenticated',
      message: 'Please log in to access this resource'
    });
  }
  next();
};

// Check if user has admin role
const requireAdmin = async (req, res, next) => {
  try {
    // First check if authenticated
    if (!req.session || (!req.session.userId && !req.session.user)) {
      return res.status(401).json({ 
        success: false, 
        error: 'Not authenticated' 
      });
    }

    // Get user ID from session (support both formats)
    const userId = req.session.userId || req.session.user?.id || req.session.user?._id;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid session' 
      });
    }

    // If user object is already in session and has role, use it
    if (req.session.user && req.session.user.role) {
      if (req.session.user.role !== 'admin') {
        return res.status(403).json({ 
          success: false, 
          error: 'Admin access required' 
        });
      }
      return next();
    }

    // Otherwise fetch from database
    const user = await db.User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    if (user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        error: 'Admin access required',
        message: 'You do not have permission to access this resource'
      });
    }
    
    // Store user in request for later use
    req.user = user;
    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Authorization check failed',
      message: error.message 
    });
  }
};

// ============================================
// HELPER FUNCTIONS
// ============================================
function normalizeDate(date) {
  if (!date) return null;
  try {
    if (typeof date === 'number') {
      const d = new Date((date - 25569) * 86400 * 1000);
      return d.toISOString().split('T')[0];
    }
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
  } catch (e) {
    return null;
  }
}

function identifyGameType(sheetName, data) {
  const name = sheetName.toLowerCase().trim();
  
  if (name.includes('539') || (name.includes('daily') && name.includes('cash'))) return '539';
  if (name.includes('mark') && name.includes('6')) return 'mark6';
  if (name.includes('lotto') || name.includes('649')) return 'lotto649';
  
  if (data && data.length > 0) {
    const firstRow = data[0];
    const numberColumns = Object.keys(firstRow).filter(key => {
      const lowerKey = key.toLowerCase();
      return (lowerKey.includes('number') || lowerKey.match(/^num/)) && 
             !lowerKey.includes('bonus');
    }).length;
    
    if (numberColumns === 5) return '539';
    if (numberColumns === 6) return 'mark6';
  }
  
  return null;
}

function extractNumbers(row) {
  const numbers = [];
  const possibleFormats = [
    ...Array.from({length: 8}, (_, i) => `Number ${i + 1}`),
    ...Array.from({length: 8}, (_, i) => `Number${i + 1}`),
    ...Array.from({length: 8}, (_, i) => `Num ${i + 1}`),
    ...Array.from({length: 8}, (_, i) => `Num${i + 1}`),
    ...'ABCDEF'.split('')
  ];
  
  possibleFormats.forEach(colName => {
    const value = row[colName];
    if (value !== undefined && value !== null && !isNaN(value)) {
      numbers.push(parseInt(value));
    }
  });
  
  return numbers;
}

// Helper function - Sync from web scraper
async function syncFromWeb(gameType) {
  const startTime = Date.now();
  
  try {
    const result = await scheduledScraper.triggerManualScrape(gameType);
    const duration = Date.now() - startTime;
    
    return {
      source: 'web_scraper',
      imported: result.added || 0,
      skipped: result.skipped || 0,
      scraped: result.scraped || 0,
      total: result.total || 0,
      duration: `${(duration / 1000).toFixed(2)}s`,
      success: result.success,
      error: result.error
    };
  } catch (error) {
    console.error(`Web sync error for ${gameType}:`, error);
    return {
      source: 'web_scraper',
      imported: 0,
      skipped: 0,
      error: error.message,
      duration: `${((Date.now() - startTime) / 1000).toFixed(2)}s`
    };
  }
}

// Helper function - Sync from Excel
async function syncFromExcel(gameType) {
  const startTime = Date.now();
  
  try {
    const excelMap = {
      '539': '539PAST2025RESULT.xlsx',
      'mark6': 'MARK6PAST2025RESULT.xlsx',
      'lotto649': 'LOTTO649PAST2025RESULT.xlsx'
    };
    
    const excelPath = path.join(__dirname, '../data', excelMap[gameType]);
    
    if (!fs.existsSync(excelPath)) {
      return {
        source: 'excel',
        imported: 0,
        skipped: 0,
        error: 'Excel file not found'
      };
    }
    
    const workbook = XLSX.readFile(excelPath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(`Processing ${jsonData.length} rows from Excel`);
    
    const results = [];
    
    for (const row of jsonData) {
      const numbers = extractNumbers(row);
      const bonus = row.Bonus || row.bonus || null;
      const drawDate = normalizeDate(row.Date || row.date || row['Draw Date']);
      
      if (drawDate && numbers.length > 0) {
        results.push({
          gameType,
          drawDate,
          numbers: numbers.slice(0, gameType === '539' ? 5 : 6),
          bonus: gameType !== '539' ? bonus : null,
          source: 'excel_sync'
        });
      }
    }
    
    const bulkResult = await dbService.bulkUpsertLotteryResults(results);
    const duration = Date.now() - startTime;
    
    return {
      source: 'excel',
      imported: bulkResult.inserted,
      modified: bulkResult.modified,
      skipped: jsonData.length - bulkResult.total,
      total: jsonData.length,
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
// CRITICAL MISSING ROUTE - Historical Results
// ============================================

// GET /api/admin/historical-results/:gameType - THIS IS THE MISSING ROUTE
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
      .sort({ drawDate: -1 }) // Most recent first
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

// POST /api/admin/historical-results/:gameType/add
router.post('/historical-results/:gameType/add', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { gameType } = req.params;
    const { drawDate, numbers, bonus } = req.body;
    
    console.log('Adding new result:', { gameType, drawDate, numbers, bonus });
    
    // Validate game type
    const validGames = ['539', 'mark6', 'lotto649'];
    if (!validGames.includes(gameType)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid game type',
        validTypes: validGames 
      });
    }

    // Validate required fields
    if (!drawDate || !numbers || !Array.isArray(numbers)) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        required: ['drawDate', 'numbers (array)']
      });
    }

    // Check for duplicate
    const existing = await db.LotteryResult.findOne({
      gameType,
      drawDate: new Date(drawDate)
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Result already exists for this date',
        existingId: existing._id
      });
    }

    // Create new result
    const newResult = await db.LotteryResult.create({
      gameType,
      drawDate: new Date(drawDate),
      numbers,
      bonus: bonus || null,
      source: 'admin_manual',
      createdAt: new Date()
    });

    // Log the action
    const userId = req.session.userId || req.session.user?.id || req.session.user?._id;
    if (userId) {
      await dbService.logAdminAction(
        userId,
        'ADD_HISTORICAL_RESULT',
        { gameType, drawDate, numbers, bonus },
        req
      );
    }

    console.log('✅ Result added successfully:', newResult._id);

    res.status(201).json({
      success: true,
      data: newResult,
      message: 'Historical result added successfully'
    });
  } catch (error) {
    console.error('Error adding historical result:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to add result',
      message: error.message 
    });
  }
});

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
        error: 'Result not found',
        resultId
      });
    }

    // Log the action
    const userId = req.session.userId || req.session.user?.id || req.session.user?._id;
    if (userId) {
      await dbService.logAdminAction(
        userId,
        'DELETE_HISTORICAL_RESULT',
        { gameType, resultId, deletedData: result },
        req
      );
    }

    console.log('✅ Result deleted successfully');

    res.json({
      success: true,
      message: 'Result deleted successfully',
      deletedResult: result
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

// POST /api/admin/historical-results/:gameType/sync - Sync with Excel
router.post('/historical-results/:gameType/sync', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { gameType } = req.params;
    
    console.log('🔄 Syncing Excel data for:', gameType);
    
    const result = await syncFromExcel(gameType);
    
    // Log the action
    const userId = req.session.userId || req.session.user?.id || req.session.user?._id;
    if (userId) {
      await dbService.logAdminAction(
        userId,
        'SYNC_EXCEL_DATA',
        { gameType, result },
        req
      );
    }
    
    res.json({
      success: !result.error,
      ...result
    });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Sync failed',
      message: error.message 
    });
  }
});

// ============================================
// SCRAPER ROUTES (for Auto Update functionality)
// ============================================

// GET /api/admin/scraper/preview/:gameType
router.get('/scraper/preview/:gameType', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { gameType } = req.params;
    const { maxResults = 30 } = req.query;
    
    console.log('Scraper preview for:', gameType);
    
    // Get latest results from scraper without importing
    const scraperData = await scheduledScraper.previewScrape(gameType, parseInt(maxResults));
    
    res.json({
      success: true,
      gameType,
      data: scraperData,
      count: scraperData.length,
      maxResults: parseInt(maxResults)
    });
  } catch (error) {
    console.error('Scraper preview error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Preview failed',
      message: error.message 
    });
  }
});

// POST /api/admin/scraper/import/:gameType
router.post('/scraper/import/:gameType', requireAuth, requireAdmin, scraperLimiter, async (req, res) => {
  try {
    const { gameType } = req.params;
    const { maxResults = 50, mergeStrategy = 'skip' } = req.body;
    
    console.log('🔄 Importing scraped results:', { gameType, maxResults, mergeStrategy });
    
    const result = await scheduledScraper.triggerManualScrape(gameType);
    
    // Log the action
    const userId = req.session.userId || req.session.user?.id || req.session.user?._id;
    if (userId && result.success) {
      await dbService.logAdminAction(
        userId,
        'IMPORT_SCRAPED_DATA',
        { 
          gameType,
          maxResults,
          mergeStrategy,
          result: {
            added: result.added,
            skipped: result.skipped,
            total: result.total
          }
        },
        req
      );
    }
    
    res.json({
      success: result.success,
      message: result.success ? `Imported ${result.added} new results` : 'Import failed',
      imported: result.added || 0,
      skipped: result.skipped || 0,
      total: result.total || 0,
      error: result.error
    });
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Import failed',
      message: error.message 
    });
  }
});

// GET /api/admin/scraper/status/:gameType
router.get('/scraper/status/:gameType', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { gameType } = req.params;
    
    const status = scheduledScraper.getSchedulerStatus()[gameType];
    
    res.json({
      success: true,
      gameType,
      ...status
    });
  } catch (error) {
    console.error('Status error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get status',
      message: error.message 
    });
  }
});

// ============================================
// SCHEDULER ROUTES (Auto Update functionality)
// ============================================

// GET /api/admin/scheduler/status/:gameType
router.get('/scheduler/status/:gameType', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { gameType } = req.params;
    
    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type'
      });
    }
    
    const status = scheduledScraper.getSchedulerStatus()[gameType];
    
    res.json({
      success: true,
      gameType,
      status: status?.isActive ? 'active' : 'inactive',
      ...status
    });
  } catch (error) {
    console.error('Scheduler status error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get scheduler status',
      message: error.message 
    });
  }
});

// GET /api/admin/scheduler/status (all games)
router.get('/scheduler/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const allStatus = scheduledScraper.getSchedulerStatus();
    
    res.json({
      success: true,
      schedulers: allStatus,
      presets: scheduledScraper.SCHEDULE_PRESETS
    });
  } catch (error) {
    console.error('Error getting all scheduler status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/admin/scheduler/start/:gameType
router.post('/scheduler/start/:gameType', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { gameType } = req.params;
    const { schedule = '0 */6 * * *' } = req.body;
    
    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type'
      });
    }
    
    const result = scheduledScraper.startScheduler(gameType, schedule);
    
    await dbService.updateSchedulerJob(gameType, {
      isActive: true,
      schedule,
      nextRun: new Date()
    });
    
    const userId = req.session.userId || req.session.user?.id || req.session.user?._id;
    if (userId) {
      await dbService.logAdminAction(
        userId,
        'START_SCHEDULER',
        { gameType, schedule },
        req
      );
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error starting scheduler:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/admin/scheduler/stop/:gameType
router.post('/scheduler/stop/:gameType', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { gameType } = req.params;
    
    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type'
      });
    }
    
    const result = scheduledScraper.stopScheduler(gameType);
    
    await dbService.updateSchedulerJob(gameType, {
      isActive: false
    });
    
    const userId = req.session.userId || req.session.user?.id || req.session.user?._id;
    if (userId) {
      await dbService.logAdminAction(
        userId,
        'STOP_SCHEDULER',
        { gameType },
        req
      );
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error stopping scheduler:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/admin/scheduler/trigger/:gameType - Manual trigger
router.post('/scheduler/trigger/:gameType', requireAuth, requireAdmin, scraperLimiter, async (req, res) => {
  try {
    const { gameType } = req.params;
    
    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type'
      });
    }
    
    console.log(`🔧 Manual scrape triggered for ${gameType.toUpperCase()}`);
    
    const result = await scheduledScraper.triggerManualScrape(gameType);
    
    if (result.success) {
      const userId = req.session.userId || req.session.user?.id || req.session.user?._id;
      if (userId) {
        await dbService.logAdminAction(
          userId,
          'TRIGGER_MANUAL_SCRAPE',
          { 
            gameType, 
            result: {
              success: result.success,
              added: result.added,
              skipped: result.skipped,
              scraped: result.scraped,
              total: result.total
            }
          },
          req
        );
      }
      
      res.json({
        success: true,
        message: `Updated! ${result.added} new results added`,
        added: result.added,
        skipped: result.skipped,
        total: result.total,
        scraped: result.scraped
      });
    } else {
      res.json({
        success: false,
        error: result.error || 'Scraping failed',
        message: `Scraping failed: ${result.error}`,
        added: 0
      });
    }
  } catch (error) {
    console.error('Error triggering manual scrape:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: `Error: ${error.message}`,
      added: 0
    });
  }
});

// ============================================
// EXISTING ROUTES (Keep all your original routes)
// ============================================

// GET /api/admin/stats
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const stats = await dbService.getStatistics();
    
    const userId = req.session.userId || req.session.user?.id || req.session.user?._id;
    if (userId) {
      await dbService.logAdminAction(
        userId,
        'VIEW_STATS',
        { stats },
        req
      );
    }
    
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Error getting admin stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/users
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    const { rows: users, count: total } = await dbService.getAllUsers({ 
      limit: parseInt(limit), 
      offset 
    });
    
    res.json({
      success: true,
      users: users.map(u => ({
        id: u._id,
        username: u.username,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        lastLogin: u.lastLogin,
        createdAt: u.createdAt
      })),
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error getting users:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/excel/preview
router.get('/excel/preview', requireAdmin, async (req, res) => {
  try {
    const preview = {};
    
    for (const gameType of ['539', 'mark6', 'lotto649']) {
      const stats = await dbService.getGameStatistics(gameType);
      preview[gameType] = {
        totalDraws: stats.totalDraws,
        latestDraw: stats.latestDraw
      };
    }
    
    const userId = req.session.userId || req.session.user?.id || req.session.user?._id;
    if (userId) {
      await dbService.logAdminAction(
        userId,
        'PREVIEW_EXCEL',
        { preview },
        req
      );
    }
    
    res.json({ success: true, preview });
  } catch (error) {
    console.error('Error getting excel preview:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/admin/excel/sync/:gameType
router.post('/excel/sync/:gameType', requireAdmin, async (req, res) => {
  try {
    const { gameType } = req.params;
    const { source = 'both' } = req.body;
    
    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type'
      });
    }
    
    const results = {};
    
    if (source === 'excel' || source === 'both') {
      results.excel = await syncFromExcel(gameType);
    }
    
    if (source === 'web' || source === 'both') {
      results.web = await syncFromWeb(gameType);
    }
    
    const totalImported = (results.excel?.imported || 0) + (results.web?.imported || 0);
    const totalSkipped = (results.excel?.skipped || 0) + (results.web?.skipped || 0);
    
    const userId = req.session.userId || req.session.user?.id || req.session.user?._id;
    if (userId) {
      await dbService.logAdminAction(
        userId,
        'SYNC_DATA',
        { gameType, source, results },
        req
      );
    }
    
    res.json({
      success: true,
      message: `Sync completed! ${totalImported} imported, ${totalSkipped} skipped`,
      results,
      summary: {
        totalImported,
        totalSkipped
      }
    });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/admin/excel/upload
router.post('/excel/upload', requireAdmin, upload.single('excel'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }
    
    const workbook = XLSX.readFile(req.file.path);
    const importResults = [];
    
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);
      
      if (!data || data.length === 0) continue;
      
      const gameType = identifyGameType(sheetName, data);
      if (!gameType) {
        console.log(`Could not identify game type for sheet: ${sheetName}`);
        continue;
      }
      
      const results = [];
      for (const row of data) {
        const numbers = extractNumbers(row);
        const bonus = row.Bonus || row.bonus || null;
        const drawDate = normalizeDate(row.Date || row.date || row['Draw Date']);
        
        if (drawDate && numbers.length > 0) {
          results.push({
            gameType,
            drawDate,
            numbers: numbers.slice(0, gameType === '539' ? 5 : 6),
            bonus: gameType !== '539' ? bonus : null,
            source: 'excel_upload'
          });
        }
      }
      
      if (results.length > 0) {
        const bulkResult = await dbService.bulkUpsertLotteryResults(results);
        importResults.push({
          sheet: sheetName,
          gameType,
          processed: data.length,
          imported: bulkResult.inserted,
          modified: bulkResult.modified,
          skipped: data.length - bulkResult.total
        });
      }
    }
    
    fs.unlinkSync(req.file.path);
    
    const userId = req.session.userId || req.session.user?.id || req.session.user?._id;
    if (userId) {
      await dbService.logAdminAction(
        userId,
        'UPLOAD_EXCEL',
        { filename: req.file.originalname, results: importResults },
        req
      );
    }
    
    res.json({
      success: true,
      message: 'Excel file processed successfully',
      results: importResults
    });
  } catch (error) {
    console.error('Excel upload error:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/admin/database/stats
router.get('/database/stats', requireAdmin, async (req, res) => {
  try {
    const stats = await dbService.getDatabaseStats();
    
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error getting database stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/admin/database/verify/:gameType
router.post('/database/verify/:gameType', requireAdmin, async (req, res) => {
  try {
    const { gameType } = req.params;
    const { dateRange } = req.body;
    
    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type'
      });
    }
    
    const fromDate = dateRange?.from || '2020-01-01';
    const toDate = dateRange?.to || new Date().toISOString().split('T')[0];
    
    const missingDates = await dbService.findMissingDates(gameType, fromDate, toDate);
    
    res.json({
      success: true,
      gameType,
      dateRange: { from: fromDate, to: toDate },
      missingDates,
      missingCount: missingDates.length
    });
  } catch (error) {
    console.error('Error verifying database:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/admin/export/:gameType
router.post('/export/:gameType', requireAdmin, async (req, res) => {
  try {
    const { gameType } = req.params;
    
    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type'
      });
    }
    
    const result = await scheduledScraper.exportToExcel(gameType);
    
    if (result.success) {
      const userId = req.session.userId || req.session.user?.id || req.session.user?._id;
      if (userId) {
        await dbService.logAdminAction(
          userId,
          'EXPORT_TO_EXCEL',
          { gameType, filename: result.filename, count: result.count },
          req
        );
      }
      
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('Error exporting data:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/admin/logs
router.get('/logs', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 100, action } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    const { rows: logs, count: total } = await dbService.getAdminLogs({
      limit: parseInt(limit),
      offset,
      action
    });
    
    res.json({
      success: true,
      logs: logs.map(log => ({
        id: log._id,
        username: log.userId?.username,
        action: log.action,
        details: log.details,
        ipAddress: log.ipAddress,
        timestamp: log.createdAt
      })),
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error getting admin logs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Test route - GET /api/admin/test
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Admin routes are working',
    session: {
      hasSession: !!req.session,
      userId: req.session?.userId || null,
      user: req.session?.user?.username || null
    },
    timestamp: new Date().toISOString()
  });
});

module.exports = router;