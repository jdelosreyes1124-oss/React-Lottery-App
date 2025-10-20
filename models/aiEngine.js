/**
 * Backend API endpoints for Admin Excel Management
 * Complete Express.js routes file
 * 
 * INSTALLATION:
 * npm install express multer xlsx
 * 
 * USAGE:
 * const adminRoutes = require('./routes/admin');
 * app.use('/api/admin', adminRoutes);
 */
/**
 * Backend API endpoints for Admin Excel Management
 */

const express = require('express');  // ← ADD THIS LINE
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const router = express.Router();  // Now this will work


// ============================================
// CONFIGURATION
// ============================================

// Configure multer for file uploads
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

// Path to the main Excel data file
const EXCEL_DATA_PATH = path.join(__dirname, '../data/lottery-data.xlsx');

// ============================================
// MIDDLEWARE
// ============================================

/**
 * Middleware to check admin access
 */
const requireAdmin = (req, res, next) => {
  // Check if user is authenticated
  if (!req.session || !req.session.user) {
    return res.status(401).json({ 
      success: false, 
      error: 'Not authenticated' 
    });
  }
  
  // Check if user has admin role
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

/**
 * Identify game type from sheet name and data structure
 */
function identifyGameType(sheetName, data) {
  const name = sheetName.toLowerCase().trim();
  
  // Direct name matching
  if (name.includes('539')) return '539';
  if (name.includes('mark') && name.includes('6')) return 'mark6';
  if (name.includes('lotto') || name.includes('649')) return 'lotto649';
  
  // Fallback: analyze data structure
  if (data.length > 0) {
    const firstRow = data[0];
    const numberColumns = Object.keys(firstRow).filter(key => {
      const lowerKey = key.toLowerCase();
      return !lowerKey.includes('date') && 
             !lowerKey.includes('bonus') &&
             (lowerKey.includes('number') || lowerKey.match(/^[A-Z]$/));
    }).length;
    
    if (numberColumns === 5) return '539';
    if (numberColumns === 6) return 'mark6';
  }
  
  return null;
}

/**
 * Get standardized sheet name for a game type
 */
function getSheetName(gameType) {
  const sheetNames = {
    '539': '539',
    'mark6': 'Mark6',
    'lotto649': 'Lotto649'
  };
  return sheetNames[gameType] || gameType;
}

/**
 * Log admin actions to console and file
 */
function logAdminAction(username, action, details) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    username,
    action,
    details
  };
  
  // Log to console
  console.log('🔐 Admin Action:', JSON.stringify(logEntry, null, 2));
  
  // Log to file
  try {
    const logPath = path.join(__dirname, '../logs/admin-actions.log');
    const logDir = path.dirname(logPath);
    
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
  } catch (error) {
    console.error('Failed to write to log file:', error);
  }
}

// ============================================
// ROUTES
// ============================================

/**
 * GET /api/admin/stats
 * Get admin statistics
 */
router.get('/stats', requireAdmin, (req, res) => {
  try {
    // TODO: Implement actual statistics from your database
    const stats = {
      totalUsers: 0,
      predictionsToday: 0,
      activeSessions: 0
    };
    
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Error getting admin stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/excel/preview
 * Get a preview of current Excel data
 */
router.get('/excel/preview', requireAdmin, async (req, res) => {
  try {
    // Check if Excel file exists
    if (!fs.existsSync(EXCEL_DATA_PATH)) {
      return res.json({
        success: true,
        data: {
          '539': { totalDraws: 0, latestDraw: null },
          'mark6': { totalDraws: 0, latestDraw: null },
          'lotto649': { totalDraws: 0, latestDraw: null }
        }
      });
    }

    // Read Excel file
    const workbook = XLSX.readFile(EXCEL_DATA_PATH);
    const preview = {};

    // Process each sheet
    workbook.SheetNames.forEach(sheetName => {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      
      const gameType = identifyGameType(sheetName, jsonData);
      if (gameType) {
        // Extract dates
        const dates = jsonData
          .map(row => row.Date || row.date)
          .filter(d => d)
          .map(d => new Date(d))
          .filter(d => !isNaN(d.getTime()));

        preview[gameType] = {
          totalDraws: jsonData.length,
          latestDraw: dates.length > 0 ? new Date(Math.max(...dates)) : null
        };
      }
    });

    // Log the action
    logAdminAction(req.session.user.username, 'EXCEL_PREVIEW', {
      gamesFound: Object.keys(preview)
    });

    res.json({ success: true, data: preview });
  } catch (error) {
    console.error('Error loading Excel preview:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/excel/upload
 * Upload and replace Excel data file
 */
router.post('/excel/upload', requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No file uploaded' 
      });
    }

    console.log('📤 Processing uploaded file:', req.file.originalname);

    // Backup existing file
    if (fs.existsSync(EXCEL_DATA_PATH)) {
      const backupPath = path.join(
        path.dirname(EXCEL_DATA_PATH),
        `lottery-data-backup-${Date.now()}.xlsx`
      );
      fs.copyFileSync(EXCEL_DATA_PATH, backupPath);
      console.log(`✅ Backup created: ${backupPath}`);
    }

    // Validate the uploaded file
    const workbook = XLSX.readFile(req.file.path);
    const gamesLoaded = [];
    let totalDraws = 0;

    workbook.SheetNames.forEach(sheetName => {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      
      const gameType = identifyGameType(sheetName, jsonData);
      if (gameType && !gamesLoaded.includes(gameType)) {
        gamesLoaded.push(gameType);
        totalDraws += jsonData.length;
      }
    });

    // Check if valid game data was found
    if (gamesLoaded.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        error: 'No valid game data found in Excel file. Please ensure sheets are named 539, Mark6, or Lotto649.'
      });
    }

    // Move uploaded file to data directory
    const dataDir = path.dirname(EXCEL_DATA_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.copyFileSync(req.file.path, EXCEL_DATA_PATH);
    fs.unlinkSync(req.file.path);

    console.log(`✅ Excel file uploaded: ${totalDraws} draws across ${gamesLoaded.join(', ')}`);

    // Log the action
    logAdminAction(req.session.user.username, 'EXCEL_UPLOAD', {
      gamesLoaded,
      totalDraws,
      filename: req.file.originalname
    });

    res.json({
      success: true,
      message: 'Excel file uploaded successfully',
      gamesLoaded,
      totalDraws
    });
  } catch (error) {
    console.error('❌ Error uploading Excel file:', error);
    
    // Clean up uploaded file on error 
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * POST /api/admin/excel/add-draw 
 * Add a new draw result to the Excel file
 */
router.post('/excel/add-draw', requireAdmin, async (req, res) => {
  try {
    const { gameType, date, numbers, bonus } = req.body;

    // Validate game type
    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid game type. Must be 539, mark6, or lotto649' 
      });
    }

    // Validate required
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
    }[gameType];

    // Validate number count
    if (numbers.length !== config.count) {
      return res.status(400).json({
        success: false,
        error: `Expected ${config.count} numbers for ${gameType}`
      });
    }

    // Validate number range
    if (numbers.some(n => n < 1 || n > config.max)) {
      return res.status(400).json({
        success: false,
        error: `All numbers must be between 1 and ${config.max}`
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
    if (config.hasBonus) {
      if (!bonus || bonus < 1 || bonus > config.max) {
        return res.status(400).json({
          success: false,
          error: `Bonus must be between 1 and ${config.max}`
        });
      }
      if (numbers.includes(bonus)) {
        return res.status(400).json({
          success: false,
          error: 'Bonus number must be different from main numbers'
        });
      }
    }

    // Load or create workbook
    let workbook;
    if (fs.existsSync(EXCEL_DATA_PATH)) {
      workbook = XLSX.readFile(EXCEL_DATA_PATH);
    } else {
      workbook = XLSX.utils.book_new();
    }

    // Find or create the appropriate sheet
    const sheetName = getSheetName(gameType);
    let existingData = [];

    if (workbook.SheetNames.includes(sheetName)) {
      const worksheet = workbook.Sheets[sheetName];
      existingData = XLSX.utils.sheet_to_json(worksheet);
    }

    // Create new draw entry
    const newDraw = {
      Date: date,
      ...numbers.reduce((obj, num, idx) => {
        obj[`Number${idx + 1}`] = num;
        return obj;
      }, {})
    };

    if (config.hasBonus) {
      newDraw.Bonus = bonus;
    }

    // Add to existing data
    existingData.push(newDraw);

    // Sort by date (newest first)
    existingData.sort((a, b) => {
      const dateA = new Date(a.Date || 0);
      const dateB = new Date(b.Date || 0);
      return dateB - dateA;
    });

    // Create new worksheet
    const newWorksheet = XLSX.utils.json_to_sheet(existingData);
    
    // Update or add the sheet
    if (workbook.SheetNames.includes(sheetName)) {
      workbook.Sheets[sheetName] = newWorksheet;
    } else {
      XLSX.utils.book_append_sheet(workbook, newWorksheet, sheetName);
    }

    // Ensure data directory exists
    const dataDir = path.dirname(EXCEL_DATA_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Write the file 
    XLSX.writeFile(workbook, EXCEL_DATA_PATH);

    console.log(`✅ Draw added for ${gameType}: ${numbers.join(', ')}${bonus ? ` + ${bonus}` : ''}`);

    // Log the action
    logAdminAction(req.session.user.username, 'ADD_DRAW', {
      gameType,
      date,
      numbersCount: numbers.length,
      hasBonus: !!bonus
    });

    res.json({
      success: true,
      message: `Draw added successfully for ${gameType}`,
      draw: newDraw
    });
  } catch (error) {
    console.error('❌ Error adding draw:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * PUT /api/admin/games/:gameType/settings
 * Update game settings (placeholder for future implementation)
 */
router.put('/games/:gameType/settings', requireAdmin, (req, res) => {
  try {
    const { gameType } = req.params;
    const settings = req.body;

    // TODO: Implement game settings update logic
    
    logAdminAction(req.session.user.username, 'UPDATE_GAME_SETTINGS', {
      gameType,
      settings
    });

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