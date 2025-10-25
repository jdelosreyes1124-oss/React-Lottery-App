// Fixed MongoDB Model Creation and Save Logic
// This fixes the "document must have an _id before saving" error

const express = require('express');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

console.log('[INFO] Historical Results routes loaded!');

const router = express.Router();

// Path to the 539 Excel file 
const EXCEL_539_PATH = path.join(__dirname, '../data/539PAST2025RESULT.xlsx');

// Import mongoose only if available
let mongoose = null;
let LotteryResultModel = null;

try {
  mongoose = require('mongoose');
  console.log('[INFO] Mongoose module loaded');
  
  // Only try to create model if mongoose is connected
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    // FIX: Properly handle existing models
    try {
      // Try to get existing model first
      LotteryResultModel = mongoose.model('LotteryResult');
      console.log('[INFO] Using existing LotteryResult model');
    } catch (error) {
      // Model doesn't exist, create it
      console.log('[INFO] Creating new LotteryResult model');
      
      const lotteryResultSchema = new mongoose.Schema({
        gameType: { 
          type: String, 
          enum: ['539', 'mark6', 'lotto649'], 
          required: true 
        },
        drawDate: {
          type: Date,
          required: true
        },
        numbers: {
          type: [Number],
          required: true,
          validate: {
            validator: function(v) {
              return Array.isArray(v) && v.length > 0;
            },
            message: 'Numbers array cannot be empty'
          }
        },
        bonus: {
          type: Number,
          default: null
        },
        drawNumber: {
          type: Number,
          default: null
        },
        source: { 
          type: String, 
          default: 'manual' 
        },
        metadata: {
          type: mongoose.Schema.Types.Mixed,
          default: {}
        }
      }, {
        timestamps: true,
        collection: 'lottery_results'
      });
      
      // Create indexes
      lotteryResultSchema.index({ gameType: 1, drawDate: -1 });
      
      // Register the model
      LotteryResultModel = mongoose.model('LotteryResult', lotteryResultSchema, 'lottery_results');
      console.log('[INFO] LotteryResult model created successfully');
    }
  } else {
    console.log('[WARNING] MongoDB not connected - will use Excel file only');
  }
} catch (error) {
  console.log('[WARNING] Mongoose not available:', error.message);
  console.log('[INFO] Will use Excel file for data storage');
}

// Helper: Format date consistently
function formatDateString(dateString) {
  if (!dateString) return new Date().toLocaleDateString('en-US');
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return dateString;
    }
    
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  } catch (error) {
    return dateString;
  }
}

// Helper: Parse date string to Date object
function parseDate(dateString) {
  if (!dateString) return new Date();
  
  try {
    // Handle YYYY-MM-DD format (from your React app)
    if (typeof dateString === 'string' && dateString.includes('-')) {
      const [year, month, day] = dateString.split('-').map(num => parseInt(num));
      return new Date(year, month - 1, day, 12, 0, 0);
    }
    
    // Handle MM/DD/YYYY format
    if (typeof dateString === 'string' && dateString.includes('/')) {
      const parts = dateString.split('/');
      if (parts.length === 3) {
        const month = parseInt(parts[0]) - 1;
        const day = parseInt(parts[1]);
        const year = parseInt(parts[2]);
        return new Date(year, month, day, 12, 0, 0);
      }
    }
    
    return new Date(dateString);
  } catch (error) {
    console.error('[ERROR] Date parsing failed:', error);
    return new Date();
  }
}

// Helper: Check if MongoDB is available and connected
function isMongoDBAvailable() {
  const available = mongoose && 
         mongoose.connection && 
         mongoose.connection.readyState === 1 && 
         LotteryResultModel !== null;
  
  if (mongoose?.connection) {
    console.log(`[DEBUG] MongoDB Status - ReadyState: ${mongoose.connection.readyState}, Model Available: ${!!LotteryResultModel}`);
  }
  
  return available;
}

// Helper: Read Excel file
function readExcelFile() {
  try {
    const dataDir = path.dirname(EXCEL_539_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log('[INFO] Created data directory');
    }
    
    if (!fs.existsSync(EXCEL_539_PATH)) {
      const emptyWorkbook = XLSX.utils.book_new();
      const emptySheet = XLSX.utils.aoa_to_sheet([
        ['Date', 'Number 1', 'Number 2', 'Number 3', 'Number 4', 'Number 5']
      ]);
      XLSX.utils.book_append_sheet(emptyWorkbook, emptySheet, 'Results');
      XLSX.writeFile(emptyWorkbook, EXCEL_539_PATH);
      console.log('[INFO] Created new Excel file');
      return [];
    }

    const workbook = XLSX.readFile(EXCEL_539_PATH);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);

    const results = [];
    jsonData.forEach((row, index) => {
      const dateValue = row['Date'] || row['date'] || '';
      const numbers = [];
      
      for (let i = 1; i <= 5; i++) {
        const num = row[`Number ${i}`] || row[`Number${i}`];
        if (num !== undefined && num !== null && num !== '') {
          numbers.push(parseInt(num));
        }
      }
      
      if (numbers.length === 5 && numbers.every(n => !isNaN(n))) {
        results.push({
          id: index,
          drawDate: formatDateString(dateValue),
          numbers: numbers
        });
      }
    });

    console.log(`[INFO] Read ${results.length} results from Excel`);
    return results;

  } catch (error) {
    console.error('[ERROR] Reading Excel:', error.message);
    return [];
  }
}

// Helper: Write Excel file
function writeExcelFile(data) {
  try {
    const dataDir = path.dirname(EXCEL_539_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const excelData = data.map(row => ({
      'Date': row.drawDate,
      'Number 1': row.numbers[0],
      'Number 2': row.numbers[1],
      'Number 3': row.numbers[2],
      'Number 4': row.numbers[3],
      'Number 5': row.numbers[4]
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Results');
    
    XLSX.writeFile(workbook, EXCEL_539_PATH);
    console.log('[INFO] Excel file updated');
    
    return true;
  } catch (error) {
    console.error('[ERROR] Writing Excel:', error.message);
    return false;
  }
}

// GET /api/admin/historical-results/539
router.get('/historical-results/539', async (req, res) => {
  try {
    console.log('[GET] Loading results...');
    let results = [];
    let usesMongoDB = false;
    
    // Try MongoDB first if available
    if (isMongoDBAvailable()) {
      try {
        const mongoResults = await LotteryResultModel.find({ gameType: '539' })
          .sort({ drawDate: -1 })
          .lean()
          .exec();
        
        if (mongoResults && mongoResults.length > 0) {
          results = mongoResults.map((result, index) => ({
            _id: result._id ? result._id.toString() : undefined,
            id: index,
            drawDate: formatDateString(result.drawDate),
            numbers: result.numbers || []
          }));
          usesMongoDB = true;
          console.log(`[INFO] Loaded ${results.length} from MongoDB`);
        }
      } catch (dbError) {
        console.log('[WARNING] MongoDB query failed:', dbError.message);
      }
    }
    
    // Use Excel if MongoDB didn't work or no results
    if (!usesMongoDB || results.length === 0) {
      results = readExcelFile();
      console.log(`[INFO] Using Excel data (${results.length} results)`);
    }
    
    res.json({
      success: true,
      results: results,
      total: results.length
    });
    
  } catch (error) {
    console.error('[ERROR] GET failed:', error);
    res.json({ 
      success: true, 
      results: [],
      total: 0,
      message: 'No results found'
    });
  }
});

// POST /api/admin/historical-results/539/add - FIXED VERSION
router.post('/historical-results/539/add', async (req, res) => {
  console.log('[POST] Add request received');
  console.log('[INFO] Request body:', JSON.stringify(req.body, null, 2));
  
  try {
    const { drawDate, numbers } = req.body;
    
    // Validate date
    if (!drawDate) {
      return res.status(400).json({
        success: false,
        error: 'Draw date is required'
      });
    }
    
    // Validate numbers
    if (!numbers || !Array.isArray(numbers) || numbers.length !== 5) {
      return res.status(400).json({
        success: false,
        error: 'Exactly 5 numbers are required'
      });
    }
    
    // Parse and validate numbers
    const parsedNumbers = [];
    for (let i = 0; i < numbers.length; i++) {
      const num = parseInt(numbers[i]);
      if (isNaN(num) || num < 1 || num > 39) {
        return res.status(400).json({
          success: false,
          error: `Number ${i+1} must be between 1 and 39`
        });
      }
      parsedNumbers.push(num);
    }
    
    // Check for duplicates
    const uniqueNumbers = new Set(parsedNumbers);
    if (uniqueNumbers.size !== 5) {
      return res.status(400).json({
        success: false,
        error: 'All numbers must be unique'
      });
    }
    
    const sortedNumbers = parsedNumbers.sort((a, b) => a - b);
    const parsedDate = parseDate(drawDate);
    const formattedDate = formatDateString(parsedDate);
    
    console.log('[INFO] Processed data:', {
      originalDate: drawDate,
      parsedDate: parsedDate.toISOString(),
      formattedDate: formattedDate,
      sortedNumbers: sortedNumbers
    });
    
    let allResults = [];
    let mongoId = null;
    let savedToMongo = false;
    
    // Try MongoDB first if available
    if (isMongoDBAvailable()) {
      console.log('[INFO] MongoDB is available, attempting to save...');
      
      try {
        // Check for existing record
        const startOfDay = new Date(parsedDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(parsedDate);
        endOfDay.setHours(23, 59, 59, 999);
        
        const existing = await LotteryResultModel.findOne({
          gameType: '539',
          drawDate: {
            $gte: startOfDay,
            $lte: endOfDay
          }
        }).exec();
        
        if (existing) {
          console.log('[INFO] Record already exists in MongoDB for date:', formattedDate);
          return res.status(400).json({
            success: false,
            error: `Result for ${formattedDate} already exists in database`
          });
        }
        
        // FIX: Create new document using constructor instead of create()
        const newResult = new LotteryResultModel({
          gameType: '539',
          drawDate: parsedDate,
          numbers: sortedNumbers,
          source: 'admin',
          metadata: {
            addedBy: 'admin',
            addedAt: new Date(),
            originalDateFormat: drawDate
          }
        });
        
        console.log('[INFO] Created new document, attempting to save...');
        
        // FIX: Use save() method properly
        const saved = await newResult.save();
        
        if (saved && saved._id) {
          mongoId = saved._id.toString();
          savedToMongo = true;
          console.log('[SUCCESS] Saved to MongoDB with ID:', mongoId);
          
          // Get all results from MongoDB
          const mongoResults = await LotteryResultModel.find({ gameType: '539' })
            .sort({ drawDate: -1 })
            .lean()
            .exec();
          
          allResults = mongoResults.map((result, index) => ({
            _id: result._id.toString(),
            id: index,
            drawDate: formatDateString(result.drawDate),
            numbers: result.numbers
          }));
          
          console.log('[INFO] Retrieved all results from MongoDB:', allResults.length);
          
          // Also update Excel file for backup
          writeExcelFile(allResults);
        }
        
      } catch (dbError) {
        console.error('[ERROR] MongoDB operation failed:', dbError);
        console.error('[ERROR] Error name:', dbError.name);
        console.error('[ERROR] Error message:', dbError.message);
        console.error('[ERROR] Stack:', dbError.stack);
        savedToMongo = false;
        // Continue to Excel fallback
      }
    } else {
      console.log('[INFO] MongoDB not available, using Excel storage');
    }
    
    // If MongoDB failed or not available, use Excel
    if (!savedToMongo) {
      console.log('[INFO] Falling back to Excel storage...');
      
      const currentData = readExcelFile();
      
      // Check for existing in Excel
      const exists = currentData.some(row => {
        const rowDate = formatDateString(row.drawDate);
        return rowDate === formattedDate;
      });
      
      if (exists) {
        return res.status(400).json({
          success: false,
          error: `Result for ${formattedDate} already exists in Excel`
        });
      }
      
      // Add new result
      const newResult = {
        id: 0,
        drawDate: formattedDate,
        numbers: sortedNumbers
      };
      
      currentData.unshift(newResult);
      
      // Re-index
      currentData.forEach((row, idx) => {
        row.id = idx;
      });
      
      // Save to Excel
      if (!writeExcelFile(currentData)) {
        return res.status(500).json({
          success: false,
          error: 'Failed to save data to Excel'
        });
      }
      
      allResults = currentData;
      console.log('[SUCCESS] Saved to Excel, total records:', allResults.length);
    }
    
    // Return success response
    const response = {
      success: true,
      message: `Result added successfully`,
      result: {
        _id: mongoId,
        id: 0,
        drawDate: formattedDate,
        numbers: sortedNumbers
      },
      results: allResults,
      total: allResults.length
    };
    
    console.log('[SUCCESS] Sending response');
    res.json(response);
    
  } catch (error) {
    console.error('[CRITICAL ERROR] Unexpected error in add route:', error);
    console.error('[CRITICAL ERROR] Error name:', error.name);
    console.error('[CRITICAL ERROR] Error message:', error.message);
    console.error('[CRITICAL ERROR] Stack trace:', error.stack);
    
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// PUT /api/admin/historical-results/539/:id
router.put('/historical-results/539/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { drawDate, numbers } = req.body;

    console.log(`[PUT] Update ID ${id}`);

    // Validate
    if (!drawDate || !numbers || !Array.isArray(numbers) || numbers.length !== 5) {
      return res.status(400).json({
        success: false,
        error: 'Invalid data'
      });
    }

    const parsedNumbers = numbers.map(n => parseInt(n));

    if (parsedNumbers.some(n => isNaN(n) || n < 1 || n > 39)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid numbers'
      });
    }

    if (new Set(parsedNumbers).size !== 5) {
      return res.status(400).json({
        success: false,
        error: 'Duplicate numbers'
      });
    }

    const sortedNumbers = parsedNumbers.sort((a, b) => a - b);
    let allResults = [];
    let updated = false;

    // Try MongoDB
    if (isMongoDBAvailable()) {
      try {
        const updatedDoc = await LotteryResultModel.findByIdAndUpdate(
          id,
          {
            drawDate: parseDate(drawDate),
            numbers: sortedNumbers
          },
          { new: true }
        ).exec();
        
        if (updatedDoc) {
          updated = true;
          const mongoResults = await LotteryResultModel.find({ gameType: '539' })
            .sort({ drawDate: -1 })
            .lean()
            .exec();
          
          allResults = mongoResults.map((result, index) => ({
            _id: result._id.toString(),
            id: index,
            drawDate: formatDateString(result.drawDate),
            numbers: result.numbers
          }));
          
          writeExcelFile(allResults);
        }
      } catch (dbError) {
        console.log('[WARNING] MongoDB update failed:', dbError.message);
      }
    }

    // Fallback to Excel
    if (!updated) {
      const currentData = readExcelFile();
      const resultId = parseInt(id);
      const index = currentData.findIndex(r => r.id === resultId);
      
      if (index === -1) {
        return res.status(404).json({
          success: false,
          error: 'Not found'
        });
      }

      currentData[index] = {
        id: resultId,
        drawDate: formatDateString(drawDate),
        numbers: sortedNumbers
      };

      if (!writeExcelFile(currentData)) {
        return res.status(500).json({
          success: false,
          error: 'Save failed'
        });
      }

      allResults = currentData;
    }

    res.json({
      success: true,
      message: 'Updated',
      results: allResults,
      total: allResults.length
    });
    
  } catch (error) {
    console.error('[ERROR] Update failed:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Update failed'
    });
  }
});

// DELETE /api/admin/historical-results/539/:id
router.delete('/historical-results/539/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`[DELETE] Delete ID ${id}`);

    let deleted = false;
    let allResults = [];

    // Try MongoDB
    if (isMongoDBAvailable()) {
      try {
        const deletedDoc = await LotteryResultModel.findByIdAndDelete(id).exec();
        
        if (deletedDoc) {
          deleted = true;
          const mongoResults = await LotteryResultModel.find({ gameType: '539' })
            .sort({ drawDate: -1 })
            .lean()
            .exec();
          
          allResults = mongoResults.map((result, index) => ({
            _id: result._id.toString(),
            id: index,
            drawDate: formatDateString(result.drawDate),
            numbers: result.numbers
          }));
          
          writeExcelFile(allResults);
        }
      } catch (dbError) {
        console.log('[WARNING] MongoDB delete failed:', dbError.message);
      }
    }

    // Fallback to Excel
    if (!deleted) {
      const currentData = readExcelFile();
      const resultId = parseInt(id);
      const index = currentData.findIndex(r => r.id === resultId);
      
      if (index === -1) {
        return res.status(404).json({
          success: false,
          error: 'Not found'
        });
      }

      currentData.splice(index, 1);
      currentData.forEach((row, idx) => {
        row.id = idx;
      });

      if (!writeExcelFile(currentData)) {
        return res.status(500).json({
          success: false,
          error: 'Save failed'
        });
      }

      allResults = currentData;
    }

    res.json({
      success: true,
      message: 'Deleted',
      results: allResults,
      total: allResults.length
    });
    
  } catch (error) {
    console.error('[ERROR] Delete failed:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Delete failed'
    });
  }
});

// POST /api/admin/historical-results/539/sync
router.post('/historical-results/539/sync', async (req, res) => {
  try {
    console.log('[SYNC] Starting...');
    const excelResults = readExcelFile();
    
    res.json({
      success: true,
      message: `${excelResults.length} results available`,
      results: excelResults,
      total: excelResults.length
    });
    
  } catch (error) {
    console.error('[ERROR] Sync failed:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Sync failed'
    });
  }
});

module.exports = router;