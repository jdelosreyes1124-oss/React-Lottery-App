const express = require('express');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

console.log('[INFO] Historical Results routes loaded!');

const router = express.Router();

// Path to the 539 Excel file 
const EXCEL_539_PATH = path.join(__dirname, '../data/539PAST2025RESULT.xlsx');

// Import mongoose only if available
let mongoose;
try {
  mongoose = require('mongoose');
  console.log('[INFO] Mongoose module loaded');
} catch (error) {
  console.log('[WARNING] Mongoose not available, using Excel only');
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
    // Handle MM/DD/YYYY format
    if (dateString.includes('/')) {
      const parts = dateString.split('/');
      if (parts.length === 3) {
        const month = parseInt(parts[0]) - 1;
        const day = parseInt(parts[1]);
        const year = parseInt(parts[2]);
        return new Date(year, month, day);
      }
    }
    
    // Handle YYYY-MM-DD format
    if (dateString.includes('-')) {
      return new Date(dateString);
    }
    
    return new Date(dateString);
  } catch (error) {
    return new Date();
  }
}

// Helper: Get LotteryResult model safely
function getLotteryResultModel() {
  if (!mongoose) return null;
  
  try {
    // Check if mongoose is properly initialized
    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
      console.log('[WARNING] MongoDB not connected');
      return null;
    }
    
    // Return existing model if available
    if (mongoose.models && mongoose.models.LotteryResult) {
      return mongoose.models.LotteryResult;
    }
    
    // Create new model
    const lotteryResultSchema = new mongoose.Schema({
      gameType: { type: String, enum: ['539', 'mark6', 'lotto649'], required: true },
      drawDate: Date,
      numbers: [Number],
      bonus: Number,
      drawNumber: Number,
      source: { type: String, default: 'manual' },
      metadata: mongoose.Schema.Types.Mixed
    }, {
      timestamps: true
    });
    
    lotteryResultSchema.index({ gameType: 1, drawDate: -1 });
    
    return mongoose.model('LotteryResult', lotteryResultSchema, 'lottery_results');
  } catch (error) {
    console.log('[WARNING] Could not get/create model:', error.message);
    return null;
  }
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
    if (mongoose && mongoose.connection && mongoose.connection.readyState === 1) {
      try {
        const LotteryResult = getLotteryResultModel();
        if (LotteryResult) {
          const mongoResults = await LotteryResult.find({ gameType: '539' })
            .sort({ drawDate: -1 })
            .lean();
          
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
        }
      } catch (dbError) {
        console.log('[WARNING] MongoDB query failed:', dbError.message);
      }
    }
    
    // Use Excel if MongoDB didn't work
    if (!usesMongoDB) {
      results = readExcelFile();
      console.log(`[INFO] Using Excel data`);
    }
    
    res.json({
      success: true,
      results: results,
      total: results.length
    });
    
  } catch (error) {
    console.error('[ERROR] GET failed:', error.message);
    // Return empty results instead of error
    res.json({ 
      success: true, 
      results: [],
      total: 0
    });
  }
});

// POST /api/admin/historical-results/539/add
router.post('/historical-results/539/add', async (req, res) => {
  console.log('[POST] Add request received');
  
  try {
    const { drawDate, numbers } = req.body;
    console.log('[INFO] Data:', { drawDate, numbers });
    
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
    const formattedDate = formatDateString(drawDate);
    
    console.log('[INFO] Processing:', formattedDate, sortedNumbers);
    
    let usesMongoDB = false;
    let mongoId = null;
    let allResults = [];
    
    // Try MongoDB if available
    if (mongoose && mongoose.connection && mongoose.connection.readyState === 1) {
      console.log('[INFO] Attempting MongoDB save...');
      
      try {
        const LotteryResult = getLotteryResultModel();
        
        if (LotteryResult) {
          // Parse date for MongoDB
          const dateObj = parseDate(drawDate);
          const startOfDay = new Date(dateObj);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(dateObj);
          endOfDay.setHours(23, 59, 59, 999);
          
          // Check for existing
          const existing = await LotteryResult.findOne({ 
            gameType: '539',
            drawDate: { $gte: startOfDay, $lte: endOfDay }
          });
          
          if (existing) {
            console.log('[WARNING] Date already exists in MongoDB');
            return res.status(400).json({
              success: false,
              error: `Result for ${formattedDate} already exists`
            });
          }
          
          // Create and save
          const newDoc = new LotteryResult({
            gameType: '539',
            drawDate: dateObj,
            numbers: sortedNumbers,
            source: 'manual'
          });
          
          const saved = await newDoc.save();
          mongoId = saved._id.toString();
          usesMongoDB = true;
          
          console.log('[SUCCESS] Saved to MongoDB:', mongoId);
          
          // Get all results
          const mongoResults = await LotteryResult.find({ gameType: '539' })
            .sort({ drawDate: -1 })
            .lean();
          
          allResults = mongoResults.map((result, index) => ({
            _id: result._id.toString(),
            id: index,
            drawDate: formatDateString(result.drawDate),
            numbers: result.numbers
          }));
          
          // Update Excel backup
          writeExcelFile(allResults);
        }
      } catch (dbError) {
        console.error('[WARNING] MongoDB failed:', dbError.message);
        usesMongoDB = false;
      }
    }
    
    // Use Excel if MongoDB didn't work
    if (!usesMongoDB) {
      console.log('[INFO] Using Excel storage...');
      
      const currentData = readExcelFile();
      
      // Check for existing
      const exists = currentData.some(row => 
        formatDateString(row.drawDate) === formattedDate
      );
      
      if (exists) {
        return res.status(400).json({
          success: false,
          error: `Result for ${formattedDate} already exists`
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
      
      // Save
      if (!writeExcelFile(currentData)) {
        return res.status(500).json({
          success: false,
          error: 'Failed to save data'
        });
      }
      
      allResults = currentData;
      console.log('[SUCCESS] Saved to Excel');
    }
    
    // Return success
    res.json({
      success: true,
      message: 'Result added successfully',
      result: {
        _id: mongoId,
        id: 0,
        drawDate: formattedDate,
        numbers: sortedNumbers
      },
      results: allResults,
      total: allResults.length
    });
    
  } catch (error) {
    console.error('[ERROR] Add failed:', error.message);
    console.error('[ERROR] Stack:', error.stack);
    
    // Try to provide a helpful response even on error
    res.status(500).json({ 
      success: false, 
      error: 'Server error. Please try again.'
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
    if (mongoose && mongoose.connection && mongoose.connection.readyState === 1) {
      try {
        const LotteryResult = getLotteryResultModel();
        if (LotteryResult) {
          const updatedDoc = await LotteryResult.findByIdAndUpdate(
            id,
            {
              drawDate: parseDate(drawDate),
              numbers: sortedNumbers
            },
            { new: true }
          );
          
          if (updatedDoc) {
            updated = true;
            const mongoResults = await LotteryResult.find({ gameType: '539' })
              .sort({ drawDate: -1 })
              .lean();
            
            allResults = mongoResults.map((result, index) => ({
              _id: result._id.toString(),
              id: index,
              drawDate: formatDateString(result.drawDate),
              numbers: result.numbers
            }));
            
            writeExcelFile(allResults);
          }
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
    if (mongoose && mongoose.connection && mongoose.connection.readyState === 1) {
      try {
        const LotteryResult = getLotteryResultModel();
        if (LotteryResult) {
          const deletedDoc = await LotteryResult.findByIdAndDelete(id);
          
          if (deletedDoc) {
            deleted = true;
            const mongoResults = await LotteryResult.find({ gameType: '539' })
              .sort({ drawDate: -1 })
              .lean();
            
            allResults = mongoResults.map((result, index) => ({
              _id: result._id.toString(),
              id: index,
              drawDate: formatDateString(result.drawDate),
              numbers: result.numbers
            }));
            
            writeExcelFile(allResults);
          }
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