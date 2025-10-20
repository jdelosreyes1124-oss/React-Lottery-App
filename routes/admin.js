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

// Rate limiting
const scraperLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { 
    success: false, 
    error: 'Too many scraper requests. Please try again later.' 
  }
});

// Multer configuration
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

// Admin authentication middleware
const requireAdmin = async (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ 
      success: false, 
      error: 'Not authenticated' 
    });
  }
  
  if (req.session.user.role !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      error: 'Admin access required' 
    });
  }
  
  next();
};

// Helper functions
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

// GET /api/admin/stats
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const stats = await dbService.getStatistics();
    
    await dbService.logAdminAction(
      req.session.user.id,
      'VIEW_STATS',
      { stats },
      req
    );
    
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
    
    await dbService.logAdminAction(
      req.session.user.id,
      'EXCEL_PREVIEW',
      { gamesFound: Object.keys(preview) },
      req
    );

    res.json({ success: true, data: preview });
  } catch (error) {
    console.error('Error loading Excel preview:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/admin/excel/upload
router.post('/excel/upload', requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No file uploaded' 
      });
    }

    console.log('📤 Processing uploaded file:', req.file.originalname);

    const workbook = XLSX.readFile(req.file.path);
    const allResults = [];
    const summary = {
      '539': { imported: 0, skipped: 0, errors: 0 },
      'mark6': { imported: 0, skipped: 0, errors: 0 },
      'lotto649': { imported: 0, skipped: 0, errors: 0 }
    };

    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      
      const gameType = identifyGameType(sheetName, jsonData);
      if (!gameType) {
        console.log(`Skipping sheet ${sheetName}: Unable to identify game type`);
        continue;
      }
      
      console.log(`Processing ${jsonData.length} rows from sheet: ${sheetName} (${gameType})`);
      
      const results = jsonData.map(row => {
        const numbers = extractNumbers(row);
        const bonus = row.Bonus || row.bonus || row.BONUS || null;
        const drawDate = normalizeDate(row.Date || row.date || row.DATE || row['Draw Date']);
        
        return {
          game_type: gameType,
          draw_date: drawDate,
          numbers: numbers.slice(0, gameType === '539' ? 5 : 6),
          bonus: gameType !== '539' ? bonus : null,
          source: 'excel_import'
        };
      }).filter(r => r.draw_date && r.numbers.length > 0);
      
      allResults.push(...results);
    }

    if (allResults.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        error: 'No valid data found in Excel file'
      });
    }

    const importResults = await dbService.bulkAddLotteryResults(allResults, 'skip');
    
    importResults.forEach(result => {
      if (result.game_type) {
        const gameType = result.game_type;
        if (result.action === 'created') {
          summary[gameType].imported++;
        } else if (result.action === 'skipped') {
          summary[gameType].skipped++;
        } else if (result.action === 'error') {
          summary[gameType].errors++;
        }
      }
    });

    fs.unlinkSync(req.file.path);

    console.log('✅ Excel import complete:', summary);

    await dbService.logAdminAction(
      req.session.user.id,
      'EXCEL_UPLOAD',
      {
        filename: req.file.originalname,
        totalProcessed: allResults.length,
        summary
      },
      req
    );

    res.json({
      success: true,
      message: 'Excel file uploaded and processed successfully',
      gamesLoaded: Object.keys(summary).filter(g => summary[g].imported > 0),
      totalDraws: Object.values(summary).reduce((sum, g) => sum + g.imported, 0),
      summary
    });
  } catch (error) {
    console.error('❌ Error uploading Excel file:', error);
    
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// GET /api/admin/historical-results/:gameType
router.get('/historical-results/:gameType', requireAdmin, async (req, res) => {
  try {
    const { gameType } = req.params;
    const { page = 1, limit = 50 } = req.query;
    
    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type'
      });
    }
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { rows: results, count: total } = await dbService.getLotteryResults(
      gameType,
      { limit: parseInt(limit), offset }
    );
    
    const formattedResults = results.map(result => ({
      id: result._id,
      drawDate: result.drawDate,
      numbers: result.numbers,
      bonus: result.bonus,
      source: result.source,
      createdAt: result.createdAt
    }));
    
    await dbService.logAdminAction(
      req.session.user.id,
      'VIEW_HISTORICAL_RESULTS',
      { gameType, resultCount: total, page, limit },
      req
    );
    
    res.json({
      success: true,
      results: formattedResults,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
        hasMore: parseInt(page) < Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching historical results:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/admin/historical-results/:gameType/add
router.post('/historical-results/:gameType/add', requireAdmin, async (req, res) => {
  try {
    const { gameType } = req.params;
    const { numbers, bonus, drawDate } = req.body;
    
    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type'
      });
    }
    
    const expectedCount = gameType === '539' ? 5 : 6;
    if (!numbers || numbers.length !== expectedCount) {
      return res.status(400).json({
        success: false,
        error: `Expected ${expectedCount} numbers for ${gameType}`
      });
    }
    
    const result = await dbService.addLotteryResult({
      gameType,
      drawDate: drawDate || new Date().toISOString().split('T')[0],
      numbers,
      bonus: gameType !== '539' ? bonus : null,
      source: 'manual'
    });
    
    await dbService.logAdminAction(
      req.session.user.id,
      'ADD_HISTORICAL_RESULT',
      { gameType, drawDate, numbers, bonus },
      req
    );
    
    res.json({
      success: true,
      message: 'Result added successfully',
      result
    });
  } catch (error) {
    console.error('Error adding historical result:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/admin/historical-results/:gameType/sync - ENHANCED VERSION
router.post('/historical-results/:gameType/sync', requireAdmin, async (req, res) => {
  try {
    const { gameType } = req.params;
    const { source = 'excel' } = req.body;
    
    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type'
      });
    }
    
    console.log(`🔄 Starting ${source} sync for ${gameType}`);
    
    let syncResult;
    
    if (source === 'web') {
      syncResult = await syncFromWeb(gameType);
    } else {
      syncResult = await syncFromExcel(gameType);
    }
    
    await dbService.logAdminAction(
      req.session.user.id,
      'SYNC_DATA',
      { 
        gameType, 
        source,
        ...syncResult 
      },
      req
    );
    
    res.json({
      success: true,
      message: `Sync completed for ${gameType}`,
      ...syncResult
    });
  } catch (error) {
    console.error('Error syncing data:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE /api/admin/historical-results/:gameType/:resultId
router.delete('/historical-results/:gameType/:resultId', requireAdmin, async (req, res) => {
  try {
    const { gameType, resultId } = req.params;

    const deleted = await dbService.deleteLotteryResult(resultId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Result not found'
      });
    }

    await dbService.logAdminAction(
      req.session.user.id,
      'DELETE_HISTORICAL_RESULT',
      { gameType, resultId },
      req
    );

    res.json({
      success: true,
      message: 'Result deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting result:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/admin/scheduler/status/:gameType
router.get('/scheduler/status/:gameType', requireAdmin, async (req, res) => {
  try {
    const { gameType } = req.params;
    
    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type'
      });
    }
    
    const status = scheduledScraper.getSchedulerStatus(gameType);
    const job = await dbService.getSchedulerJob(gameType);
    
    res.json({
      success: true,
      status: {
        active: status.enabled,
        schedule: status.schedule,
        lastRun: status.lastRun,
        lastStatus: status.lastResult?.success ? 'success' : status.status,
        enabled: status.enabled,
        status: status.status,
        nextRun: status.nextRun,
        lastResult: status.lastResult
      }
    });
  } catch (error) {
    console.error('Error getting scheduler status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/admin/scheduler/start/:gameType
router.post('/scheduler/start/:gameType', requireAdmin, async (req, res) => {
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
    
    await dbService.logAdminAction(
      req.session.user.id,
      'START_SCHEDULER',
      { gameType, schedule },
      req
    );
    
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
router.post('/scheduler/stop/:gameType', requireAdmin, async (req, res) => {
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
    
    await dbService.logAdminAction(
      req.session.user.id,
      'STOP_SCHEDULER',
      { gameType },
      req
    );
    
    res.json(result);
  } catch (error) {
    console.error('Error stopping scheduler:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/admin/scheduler/trigger/:gameType - USES REAL SCRAPER
router.post('/scheduler/trigger/:gameType', requireAdmin, scraperLimiter, async (req, res) => {
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
      await dbService.logAdminAction(
        req.session.user.id,
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

// GET /api/admin/scheduler/status (all games)
router.get('/scheduler/status', requireAdmin, async (req, res) => {
  try {
    const { gameType } = req.query;
    
    if (gameType && !['539', 'mark6', 'lotto649'].includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type'
      });
    }
    
    const allStatus = scheduledScraper.getSchedulerStatus();
    const status = gameType ? { [gameType]: allStatus[gameType] } : allStatus;
    
    res.json({
      success: true,
      status,
      presets: scheduledScraper.SCHEDULE_PRESETS
    });
  } catch (error) {
    console.error('Error getting scheduler status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/admin/database/stats - NEW: Database statistics
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

// POST /api/admin/database/verify - NEW: Verify database integrity
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
      await dbService.logAdminAction(
        req.session.user.id,
        'EXPORT_TO_EXCEL',
        { gameType, filename: result.filename, count: result.count },
        req
      );
      
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

module.exports = router;