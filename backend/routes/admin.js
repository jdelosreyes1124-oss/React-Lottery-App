// ============================================
// routes/admin.js - Complete Admin Routes File
// ============================================
const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const dbService = require('../services/databaseService');
const db = require('../models');
const scheduledScraper = require('../services/scheduledScraper');

// ============================================
// RATE LIMITING
// ============================================
const scraperLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: { 
    success: false, 
    error: 'Too many scraper requests. Please try again later.' 
  }
});

// ============================================
// MULTER CONFIGURATION FOR FILE UPLOADS
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
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// ============================================
// MIDDLEWARE - Admin Authentication
// ============================================
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

// ============================================
// HELPER FUNCTIONS
// ============================================
function normalizeDate(date) {
  if (!date) return null;
  try {
    if (typeof date === 'number') {
      // Excel serial date
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
  
  // Try to detect from data structure
  if (data && data.length > 0) {
    const firstRow = data[0];
    const numberColumns = Object.keys(firstRow).filter(key => {
      const lowerKey = key.toLowerCase();
      return (lowerKey.includes('number') || lowerKey.match(/^num/)) && 
             !lowerKey.includes('bonus');
    }).length;
    
    if (numberColumns === 5) return '539';
    if (numberColumns === 6) {
      // Could be mark6 or lotto649
      return 'mark6';
    }
  }
  
  return null;
}

function extractNumbers(row) {
  const numbers = [];
  
  // Try various column name formats
  const possibleFormats = [
    // Format: "Number 1", "Number 2", etc.
    ...Array.from({length: 8}, (_, i) => `Number ${i + 1}`),
    // Format: "Number1", "Number2", etc.
    ...Array.from({length: 8}, (_, i) => `Number${i + 1}`),
    // Format: "Num 1", "Num 2", etc.
    ...Array.from({length: 8}, (_, i) => `Num ${i + 1}`),
    // Format: "Num1", "Num2", etc.
    ...Array.from({length: 8}, (_, i) => `Num${i + 1}`),
    // Single letters: A, B, C, D, E, F
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

// ============================================
// ADMIN DASHBOARD ROUTES
// ============================================

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
        id: u.id,
        username: u.username,
        email: u.email,
        role: u.role,
        isActive: u.is_active,
        lastLogin: u.last_login,
        createdAt: u.created_at
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

// ============================================
// EXCEL MANAGEMENT ROUTES
// ============================================

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

    // Process each sheet 
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      
      const gameType = identifyGameType(sheetName, jsonData);
      if (!gameType) {
        console.log(`Skipping sheet ${sheetName}: Unable to identify game type`);
        continue;
      }
      
      console.log(`Processing ${jsonData.length} rows from sheet: ${sheetName} (${gameType})`);
      
      // Convert Excel data to database format 
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

    // Import to database
    const importResults = await dbService.bulkAddLotteryResults(allResults, 'skip');
    
    // Count results
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

    // Clean up uploaded file 
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

// POST /api/admin/excel/add-draw 
router.post('/excel/add-draw', requireAdmin, async (req, res) => {
  try {
    const { gameType, date, numbers, bonus } = req.body;

    // Validate game type
    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid game type' 
      });
    }

    // Validate required fields 
    if (!date || !numbers || !Array.isArray(numbers)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid draw data. Date and numbers array are required' 
      });
    }

    // Game configuration 
    const config = {
      '539': { count: 5, max: 39, hasBonus: false },
      'mark6': { count: 6, max: 49, hasBonus: true },
      'lotto649': { count: 6, max: 49, hasBonus: true }
    };

    const gameConfig = config[gameType];

    // Validate number count 
    if (numbers.length !== gameConfig.count) {
      return res.status(400).json({
        success: false,
        error: `Expected ${gameConfig.count} numbers for ${gameType}`
      });
    }

    // Validate number range  
    if (numbers.some(n => n < 1 || n > gameConfig.max)) {
      return res.status(400).json({
        success: false,
        error: `All numbers must be between 1 and ${gameConfig.max}`
      });
    }

    // Validate uniqueness 
    if (new Set(numbers).size !== numbers.length) {
      return res.status(400).json({
        success: false,
        error: 'Numbers must be unique'
      });
    }

    // Validate bonus if required 
    if (gameConfig.hasBonus && bonus) {
      if (bonus < 1 || bonus > gameConfig.max) {
        return res.status(400).json({
          success: false,
          error: `Bonus must be between 1 and ${gameConfig.max}`
        });
      }
      if (numbers.includes(bonus)) {
        return res.status(400).json({
          success: false,
          error: 'Bonus number must be different from main numbers'
        });
      }
    }

    const result = await dbService.addLotteryResult({
      game_type: gameType,
      draw_date: date,
      numbers,
      bonus: gameConfig.hasBonus ? bonus : null,
      source: 'manual'
    });

    await dbService.logAdminAction(
      req.session.user.id,
      'ADD_DRAW',
      { gameType, date, numbers, bonus },
      req
    );

    res.json({
      success: true,
      message: 'Draw added successfully',
      draw: result
    });
  } catch (error) {
    console.error('Error adding draw:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// POST /api/admin/excel/export 
router.post('/excel/export', requireAdmin, async (req, res) => {
  try {
    const { gameType } = req.body;
    
    const gameTypes = gameType ? [gameType] : ['539', 'mark6', 'lotto649'];
    const workbook = XLSX.utils.book_new();
    
    for (const type of gameTypes) {
      const { rows: results } = await dbService.getLotteryResults(type, { limit: 10000 });
      
      if (results.length === 0) {
        continue;
      }
      
      const excelData = results.map(r => {
        const row = {
          Date: r.draw_date
        };
        
        r.numbers.forEach((num, idx) => {
          row[`Number ${idx + 1}`] = num;
        });
        
        if (r.bonus) {
          row.Bonus = r.bonus;
        }
        
        return row;
      });
      
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      XLSX.utils.book_append_sheet(workbook, worksheet, type.toUpperCase());
    }
    
    const filename = `lottery-export-${Date.now()}.xlsx`;
    const filepath = path.join(__dirname, '../uploads', filename);
    
    // Ensure uploads directory exists 
    const uploadDir = path.dirname(filepath);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    XLSX.writeFile(workbook, filepath);
    
    res.download(filepath, filename, (err) => {
      if (err) {
        console.error('Error sending file:', err);
      }
      // Clean up file after download 
      fs.unlinkSync(filepath);
    });
  } catch (error) {
    console.error('Error exporting to Excel:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// HISTORICAL RESULTS ROUTES
// ============================================

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
      id: result.id,
      drawDate: result.draw_date,
      numbers: result.numbers,
      bonus: result.bonus,
      source: result.source,
      createdAt: result.created_at
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
    const { numbers, drawDate, bonus } = req.body;

    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type'
      });
    }

    const expectedNumberCount = gameType === '539' ? 5 : 6;
    const maxNumber = gameType === '539' ? 39 : 49;

    if (!numbers || !Array.isArray(numbers) || numbers.length !== expectedNumberCount) {
      return res.status(400).json({
        success: false,
        error: `Must provide exactly ${expectedNumberCount} numbers`
      });
    }

    if (numbers.some(n => n < 1 || n > maxNumber)) {
      return res.status(400).json({
        success: false,
        error: `All numbers must be between 1 and ${maxNumber}`
      });
    }

    const result = await dbService.addLotteryResult({
      game_type: gameType,
      draw_date: drawDate || new Date().toISOString().split('T')[0],
      numbers,
      bonus: gameType !== '539' ? bonus : null,
      source: 'manual'
    });

    await dbService.logAdminAction(
      req.session.user.id,
      'ADD_HISTORICAL_RESULT',
      { gameType, numbers, drawDate, bonus },
      req
    );

    res.json({
      success: true,
      message: 'Result added successfully',
      result
    });
  } catch (error) {
    console.error('Error adding result:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// PUT /api/admin/historical-results/:gameType/:resultId
router.put('/historical-results/:gameType/:resultId', requireAdmin, async (req, res) => {
  try {
    const { gameType, resultId } = req.params;
    const { numbers, drawDate, bonus } = req.body;
    
    const result = await db.LotteryResult.findByPk(resultId);
    
    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Result not found'
      });
    }
    
    await result.update({
      draw_date: drawDate,
      numbers,
      bonus
    });
    
    await dbService.logAdminAction(
      req.session.user.id,
      'UPDATE_HISTORICAL_RESULT',
      { gameType, resultId, numbers, drawDate, bonus },
      req
    );
    
    res.json({
      success: true,
      message: 'Result updated successfully',
      result
    });
  } catch (error) {
    console.error('Error updating result:', error);
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

// POST /api/admin/historical-results/:gameType/sync
router.post('/historical-results/:gameType/sync', requireAdmin, async (req, res) => {
  try {
    const { gameType } = req.params;

    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type'
      });
    }

    console.log(`📊 Syncing ${gameType.toUpperCase()} from Excel...`);

    // Define Excel file paths
    const EXCEL_PATHS = {
      '539': path.join(__dirname, '../data/539PAST2025RESULT.xlsx'),
      'mark6': path.join(__dirname, '../data/MARK6PAST2025RESULT.xlsx'),
      'lotto649': path.join(__dirname, '../data/LOTTO649PAST2025RESULT.xlsx')
    };

    const excelPath = EXCEL_PATHS[gameType];

    // Check if file exists
    if (!fs.existsSync(excelPath)) {
      return res.status(404).json({
        success: false,
        error: `Excel file not found for ${gameType} at ${excelPath}`
      });
    }

    // Read Excel file
    const workbook = XLSX.readFile(excelPath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);

    console.log(`📄 Found ${jsonData.length} rows in Excel file`);

    // Convert Excel data to database format
    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (const row of jsonData) {
      try {
        // Extract numbers
        const numbers = extractNumbers(row);
        
        // Get bonus
        const bonus = row.Bonus || row.bonus || row.BONUS || null;
        
        // Get date 
        const drawDate = normalizeDate(row.Date || row.date || row.DATE || row['Draw Date']);

        if (!drawDate || numbers.length === 0) {
          skipped++;
          continue;
        }

        // Validate number count 
        const expectedCount = gameType === '539' ? 5 : 6;
        if (numbers.length < expectedCount) {
          skipped++;
          continue;
        }

        // Add to database
        await dbService.addLotteryResult({
          game_type: gameType,
          draw_date: drawDate,
          numbers: numbers.slice(0, expectedCount),
          bonus: gameType !== '539' ? bonus : null,
          source: 'excel_sync'
        });

        imported++;
      } catch (err) {
        console.error('Error processing row:', err.message);
        errors++;
      }
    }

    console.log(`✅ Sync complete: ${imported} imported, ${skipped} skipped, ${errors} errors`);

    await dbService.logAdminAction(
      req.session.user.id,
      'SYNC_HISTORICAL_RESULTS',
      { 
        gameType, 
        imported, 
        skipped, 
        errors,
        totalRows: jsonData.length 
      },
      req
    );

    res.json({
      success: true,
      message: `Sync completed: ${imported} imported, ${skipped} skipped`,
      imported,
      skipped,
      errors,
      totalRows: jsonData.length
    });
  } catch (error) {
    console.error('Error syncing data:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// SCHEDULER ROUTES
// ============================================

// GET /api/admin/scheduler/status 
router.get('/scheduler/status', requireAdmin, async (req, res) => {
  try {
    const { gameType } = req.query;
    
    if (gameType && !['539', 'mark6', 'lotto649'].includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type'
      });
    }
    
    const jobs = gameType 
      ? [await dbService.getSchedulerJob(gameType)]
      : await dbService.getAllSchedulerJobs();
    
    const status = {};
    for (const job of jobs.filter(j => j)) {
      status[job.game_type] = {
        active: job.is_active,
        schedule: job.schedule,
        lastRun: job.last_run,
        lastStatus: job.last_status,
        totalRuns: job.total_runs,
        successfulRuns: job.successful_runs,
        failedRuns: job.failed_runs
      };
    }
    
    res.json({
      success: true,
      status,
      presets: {
        everyHour: '0 * * * *',
        every6Hours: '0 */6 * * *',
        daily: '0 0 * * *',
        weekly: '0 0 * * 0'
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

// GET /api/admin/scheduler/status/:gameType 
router.get('/scheduler/status/:gameType', requireAdmin, async (req, res) => {
  try {
    const { gameType } = req.params;
    
    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type. Supported: 539, mark6, lotto649'
      });
    }
    
    const job = await dbService.getSchedulerJob(gameType);
    
    res.json({
      success: true,
      status: job ? {
        active: job.is_active,
        schedule: job.schedule,
        lastRun: job.last_run,
        lastStatus: job.last_status,
        totalRuns: job.total_runs,
        successfulRuns: job.successful_runs,
        failedRuns: job.failed_runs
      } : null
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
    
    const job = await dbService.updateSchedulerJob(gameType, {
      is_active: true,
      schedule,
      next_run: new Date()
    });
    
    await dbService.logAdminAction(
      req.session.user.id,
      'START_SCHEDULER',
      { gameType, schedule },
      req
    );
    
    res.json({
      success: true,
      message: `Scheduler started for ${gameType}`,
      job
    });
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
    
    const job = await dbService.updateSchedulerJob(gameType, {
      is_active: false
    });
    
    await dbService.logAdminAction(
      req.session.user.id,
      'STOP_SCHEDULER',
      { gameType },
      req
    );
    
    res.json({
      success: true,
      message: `Scheduler stopped for ${gameType}`,
      job
    });
  } catch (error) {
    console.error('Error stopping scheduler:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/admin/scheduler/trigger/:gameType
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
    
    // Actually run the scraper 
    const result = await scheduledScraper.triggerManualScrape(gameType);
    
    // Record the run in database 
    await dbService.recordSchedulerRun(
      gameType, 
      result.success, 
      result.added || 0,
      result.error || null
    );
    
    // Log admin action 
    await dbService.logAdminAction(
      req.session.user.id,
      'TRIGGER_MANUAL_SCRAPE',
      { 
        gameType, 
        result: {
          success: result.success,
          added: result.added,
          skipped: result.skipped
        }
      },
      req
    );
    
    if (result.success) {
      res.json({
        success: true,
        message: `Scraped ${result.added} new results`,
        added: result.added,
        skipped: result.skipped,
        total: result.total,
        validation: result.validation
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Scrape failed',
        added: 0
      });
    }
  } catch (error) {
    console.error('Error triggering manual scrape:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      added: 0
    });
  }
});

// GET /api/admin/scheduler/presets 
router.get('/scheduler/presets', requireAdmin, (req, res) => {
  res.json({
    success: true,
    presets: {
      everyHour: { schedule: '0 * * * *', label: 'Every Hour' },
      every6Hours: { schedule: '0 */6 * * *', label: 'Every 6 Hours' },
      daily: { schedule: '0 0 * * *', label: 'Daily at Midnight' },
      weekly: { schedule: '0 0 * * 0', label: 'Weekly on Sunday' }
    }
  });
});

// ============================================
// ADMIN LOGS ROUTES
// ============================================

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
        id: log.id,
        username: log.User?.username,
        action: log.action,
        details: log.details,
        ipAddress: log.ip_address,
        timestamp: log.created_at
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

// ============================================
// GAME SETTINGS ROUTES
// ============================================

// PUT /api/admin/games/:gameType/settings 
router.put('/games/:gameType/settings', requireAdmin, async (req, res) => {
  try {
    const { gameType } = req.params;
    const settings = req.body;

    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type'
      });
    }

    // Here you would implement actual game settings update logic
    // For now, just log the action 

    await dbService.logAdminAction(
      req.session.user.id,
      'UPDATE_GAME_SETTINGS',
      { gameType, settings },
      req
    );

    res.json({
      success: true,
      message: `Settings updated for ${gameType}`
    });
  } catch (error) {
    console.error('Error updating game settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;