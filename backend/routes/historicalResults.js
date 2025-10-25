const express = require('express');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

console.log('[INFO] Historical Results routes loaded!');

const router = express.Router();

// Path to the 539 Excel file 
const EXCEL_539_PATH = path.join(__dirname, '../data/539PAST2025RESULT.xlsx');

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

// Helper: Get or create LotteryResult model
function getLotteryResultModel() {
  try {
    // Return existing model if available
    if (mongoose.models.LotteryResult) {
      return mongoose.models.LotteryResult;
    }
    
    // Create new model with schema that matches your LotteryResult.js
    const lotteryResultSchema = new mongoose.Schema({
      gameType: { type: String, enum: ['539', 'mark6', 'lotto649'], required: true },
      drawDate: Date,
      numbers: [Number],
      bonus: Number,
      drawNumber: Number,
      source: { type: String, default: 'manual' },
      metadata: mongoose.Schema.Types.Mixed
    }, {
      timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
    });
    
    lotteryResultSchema.index({ gameType: 1, drawDate: -1 });
    
    return mongoose.model('LotteryResult', lotteryResultSchema, 'lottery_results');
  } catch (error) {
    console.log('[WARNING] Could not get/create model:', error.message);
    return null;
  }
}

// Helper: Read Excel file (backup)
function readExcelFile() {
  try {
    if (!fs.existsSync(EXCEL_539_PATH)) {
      const dataDir = path.dirname(EXCEL_539_PATH);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      
      const emptyWorkbook = XLSX.utils.book_new();
      const emptySheet = XLSX.utils.aoa_to_sheet([
        ['Date', 'Number 1', 'Number 2', 'Number 3', 'Number 4', 'Number 5']
      ]);
      XLSX.utils.book_append_sheet(emptyWorkbook, emptySheet, 'Results');
      XLSX.writeFile(emptyWorkbook, EXCEL_539_PATH);
      
      return [];
    }

    const workbook = XLSX.readFile(EXCEL_539_PATH);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);

    return jsonData.map((row, index) => {
      const dateValue = row['Date'] || row['date'] || '';
      const numbers = [];
      
      for (let i = 1; i <= 5; i++) {
        const num = row[`Number ${i}`] || row[`Number${i}`];
        if (num !== undefined && num !== null && num !== '') {
          numbers.push(parseInt(num));
        }
      }
      
      if (numbers.length === 5 && numbers.every(n => !isNaN(n))) {
        return {
          id: index,
          drawDate: formatDateString(dateValue),
          numbers: numbers
        };
      }
      return null;
    }).filter(row => row !== null);

  } catch (error) {
    console.error('[ERROR] Reading Excel:', error.message);
    return [];
  }
}

// Helper: Write Excel file (backup)
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
    console.log('[INFO] Excel backup updated');
    
    return true;
  } catch (error) {
    console.error('[ERROR] Writing Excel:', error.message);
    return false;
  }
}

// GET /api/admin/historical-results/539
router.get('/historical-results/539', async (req, res) => {
  try {
    console.log('[GET] Loading 539 results...');
    let results = [];
    
    // Check if MongoDB is connected
    if (mongoose.connection.readyState === 1) {
      try {
        const LotteryResult = getLotteryResultModel();
        if (LotteryResult) {
          const mongoResults = await LotteryResult.find({ gameType: '539' })
            .sort({ drawDate: -1 })
            .lean();
          
          if (mongoResults && mongoResults.length > 0) {
            results = mongoResults.map((result, index) => ({
              _id: result._id.toString(),
              id: index,
              drawDate: formatDateString(result.drawDate),
              numbers: result.numbers || []
            }));
            console.log(`[INFO] Loaded ${results.length} from MongoDB`);
          }
        }
      } catch (dbError) {
        console.log('[WARNING] MongoDB query failed:', dbError.message);
      }
    }
    
    // Fallback to Excel if no MongoDB results
    if (results.length === 0) {
      results = readExcelFile();
      console.log(`[INFO] Loaded ${results.length} from Excel`);
    }
    
    res.json({
      success: true,
      results: results,
      total: results.length
    });
    
  } catch (error) {
    console.error('[ERROR] GET failed:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      results: [],
      total: 0
    });
  }
});

// POST /api/admin/historical-results/539/add
// Debug version of the POST /api/admin/historical-results/539/add route
// Replace your existing POST route (around line 217-407) with this version:

router.post('/historical-results/539/add', async (req, res) => {
  console.log('[DEBUG] ========== ADD ROUTE START ==========');
  
  try {
    console.log('[DEBUG] Request received at:', new Date().toISOString());
    console.log('[DEBUG] Request body:', JSON.stringify(req.body));
    console.log('[DEBUG] Request headers:', req.headers['content-type']);
    
    const { drawDate, numbers } = req.body;
    
    // Validate date
    console.log('[DEBUG] Validating date:', drawDate);
    if (!drawDate) {
      console.log('[DEBUG] Date validation failed - no date provided');
      return res.status(400).json({
        success: false,
        error: 'Draw date is required'
      });
    }
    
    // Validate numbers
    console.log('[DEBUG] Validating numbers:', numbers);
    if (!numbers || !Array.isArray(numbers) || numbers.length !== 5) {
      console.log('[DEBUG] Numbers validation failed');
      console.log('[DEBUG] - Is array?', Array.isArray(numbers));
      console.log('[DEBUG] - Length:', numbers ? numbers.length : 'undefined');
      return res.status(400).json({
        success: false,
        error: 'Exactly 5 numbers are required'
      });
    }
    
    // Parse and validate numbers
    console.log('[DEBUG] Parsing numbers...');
    const parsedNumbers = numbers.map(n => parseInt(n));
    console.log('[DEBUG] Parsed numbers:', parsedNumbers);
    
    for (let i = 0; i < parsedNumbers.length; i++) {
      const num = parsedNumbers[i];
      console.log(`[DEBUG] Validating number ${i+1}:`, num);
      if (isNaN(num) || num < 1 || num > 39) {
        console.log(`[DEBUG] Number ${i+1} validation failed`);
        return res.status(400).json({
          success: false,
          error: `Number ${i+1} must be between 1 and 39`
        });
      }
    }
    
    // Check for duplicates
    console.log('[DEBUG] Checking for duplicates...');
    const uniqueNumbers = new Set(parsedNumbers);
    if (uniqueNumbers.size !== 5) {
      console.log('[DEBUG] Duplicate numbers found');
      return res.status(400).json({
        success: false,
        error: 'All numbers must be unique'
      });
    }
    
    const sortedNumbers = parsedNumbers.sort((a, b) => a - b);
    console.log('[DEBUG] Sorted numbers:', sortedNumbers);
    
    const formattedDate = formatDateString(drawDate);
    console.log('[DEBUG] Formatted date:', formattedDate);
    
    const parsedDateObj = parseDate(drawDate);
    console.log('[DEBUG] Parsed date object:', parsedDateObj);
    
    let savedDoc = null;
    let allResults = [];
    
    // Check MongoDB connection
    console.log('[DEBUG] Checking MongoDB connection...');
    console.log('[DEBUG] - Connection state:', mongoose.connection.readyState);
    console.log('[DEBUG] - Connection host:', mongoose.connection.host);
    console.log('[DEBUG] - Database name:', mongoose.connection.name);
    
    // Try to save to MongoDB
    if (mongoose.connection.readyState === 1) {
      console.log('[DEBUG] MongoDB is connected, attempting save...');
      
      try {
        console.log('[DEBUG] Getting LotteryResult model...');
        const LotteryResult = getLotteryResultModel();
        console.log('[DEBUG] Model retrieved:', LotteryResult ? 'SUCCESS' : 'NULL');
        
        if (LotteryResult) {
          // Check for existing result
          console.log('[DEBUG] Checking for existing result...');
          const startOfDay = new Date(parsedDateObj);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(parsedDateObj);
          endOfDay.setHours(23, 59, 59, 999);
          
          console.log('[DEBUG] Date range:', startOfDay, 'to', endOfDay);
          
          const existing = await LotteryResult.findOne({ 
            gameType: '539',
            drawDate: { $gte: startOfDay, $lte: endOfDay }
          });
          
          console.log('[DEBUG] Existing result:', existing ? 'FOUND' : 'NOT FOUND');
          
          if (existing) {
            console.log('[DEBUG] Result already exists for this date');
            return res.status(400).json({
              success: false,
              error: `Result for ${formattedDate} already exists`
            });
          }
          
          // Create new document
          console.log('[DEBUG] Creating new document...');
          const newDoc = new LotteryResult({
            gameType: '539',
            drawDate: parsedDateObj,
            numbers: sortedNumbers,
            source: 'manual'
          });
          
          console.log('[DEBUG] Document created:', newDoc.toObject());
          
          // Save to MongoDB
          console.log('[DEBUG] Saving to MongoDB...');
          savedDoc = await newDoc.save();
          console.log('[DEBUG] SAVE SUCCESS! ID:', savedDoc._id);
          
          // Get all results
          console.log('[DEBUG] Fetching all results...');
          const mongoResults = await LotteryResult.find({ gameType: '539' })
            .sort({ drawDate: -1 })
            .lean();
          
          console.log('[DEBUG] Found', mongoResults.length, 'total results');
          
          allResults = mongoResults.map((result, index) => ({
            _id: result._id.toString(),
            id: index,
            drawDate: formatDateString(result.drawDate),
            numbers: result.numbers
          }));
          
          // Update Excel backup
          console.log('[DEBUG] Updating Excel backup...');
          writeExcelFile(allResults);
          console.log('[DEBUG] Excel backup updated');
        } else {
          console.log('[DEBUG] LotteryResult model is null');
        }
      } catch (dbError) {
        console.error('[DEBUG] MongoDB ERROR:', dbError.message);
        console.error('[DEBUG] Error name:', dbError.name);
        console.error('[DEBUG] Error stack:', dbError.stack);
        // Continue to Excel fallback
      }
    } else {
      console.log('[DEBUG] MongoDB not connected, using Excel only');
    }
    
    // Fallback to Excel if MongoDB failed
    if (!savedDoc) {
      console.log('[DEBUG] Using Excel storage fallback...');
      const currentData = readExcelFile();
      console.log('[DEBUG] Current Excel data count:', currentData.length);
      
      // Check if date exists
      const exists = currentData.some(row => 
        formatDateString(row.drawDate) === formattedDate
      );
      
      if (exists) {
        console.log('[DEBUG] Date already exists in Excel');
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
      
      console.log('[DEBUG] Saving to Excel...');
      if (!writeExcelFile(currentData)) {
        console.log('[DEBUG] Excel save FAILED');
        return res.status(500).json({
          success: false,
          error: 'Failed to save data'
        });
      }
      
      console.log('[DEBUG] Excel save SUCCESS');
      allResults = currentData;
    }
    
    console.log('[DEBUG] Preparing response...');
    const response = {
      success: true,
      message: 'Result added successfully',
      result: {
        _id: savedDoc ? savedDoc._id.toString() : undefined,
        id: 0,
        drawDate: formattedDate,
        numbers: sortedNumbers
      },
      results: allResults,
      total: allResults.length
    };
    
    console.log('[DEBUG] Sending success response');
    console.log('[DEBUG] ========== ADD ROUTE END SUCCESS ==========');
    
    res.json(response);
    
  } catch (error) {
    console.error('[DEBUG] ========== FATAL ERROR ==========');
    console.error('[DEBUG] Error message:', error.message);
    console.error('[DEBUG] Error name:', error.name);
    console.error('[DEBUG] Error stack:', error.stack);
    console.error('[DEBUG] ========== ADD ROUTE END ERROR ==========');
    
    res.status(500).json({ 
      success: false, 
      error: error.message,
      debugInfo: {
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack.split('\n').slice(0, 5)
      }
    });
  }
});

// PUT /api/admin/historical-results/539/:id
router.put('/historical-results/539/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { drawDate, numbers } = req.body;

    console.log(`[PUT] Update ID ${id}`);

    // Validate input
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
        error: 'Numbers must be between 1 and 39'
      });
    }

    if (new Set(parsedNumbers).size !== 5) {
      return res.status(400).json({
        success: false,
        error: 'Numbers must be unique'
      });
    }

    const sortedNumbers = parsedNumbers.sort((a, b) => a - b);
    let allResults = [];
    let updated = false;

    // Try MongoDB first
    if (mongoose.connection.readyState === 1) {
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
            console.log('[SUCCESS] Updated in MongoDB');
            
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
          error: 'Result not found'
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
          error: 'Failed to save'
        });
      }

      allResults = currentData;
    }

    res.json({
      success: true,
      message: 'Updated successfully',
      results: allResults,
      total: allResults.length
    });
    
  } catch (error) {
    console.error('[ERROR] Update failed:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message 
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

    // Try MongoDB first
    if (mongoose.connection.readyState === 1) {
      try {
        const LotteryResult = getLotteryResultModel();
        
        if (LotteryResult) {
          const deletedDoc = await LotteryResult.findByIdAndDelete(id);
          
          if (deletedDoc) {
            deleted = true;
            console.log('[SUCCESS] Deleted from MongoDB');
            
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
          error: 'Result not found'
        });
      }

      currentData.splice(index, 1);
      
      currentData.forEach((row, idx) => {
        row.id = idx;
      });

      if (!writeExcelFile(currentData)) {
        return res.status(500).json({
          success: false,
          error: 'Failed to save'
        });
      }

      allResults = currentData;
    }

    res.json({
      success: true,
      message: 'Deleted successfully',
      results: allResults,
      total: allResults.length
    });
    
  } catch (error) {
    console.error('[ERROR] Delete failed:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// POST /api/admin/historical-results/539/sync
router.post('/historical-results/539/sync', async (req, res) => {
  try {
    console.log('[SYNC] Starting sync...');
    const excelResults = readExcelFile();
    
    if (mongoose.connection.readyState === 1) {
      try {
        const LotteryResult = getLotteryResultModel();
        
        if (LotteryResult) {
          // Clear existing
          await LotteryResult.deleteMany({ gameType: '539' });
          
          // Insert from Excel
          if (excelResults.length > 0) {
            const docs = excelResults.map(r => ({
              gameType: '539',
              drawDate: parseDate(r.drawDate),
              numbers: r.numbers,
              source: 'manual'
            }));
            
            await LotteryResult.insertMany(docs, { ordered: false });
            console.log(`[SUCCESS] Synced ${docs.length} to MongoDB`);
          }
        }
      } catch (dbError) {
        console.error('[WARNING] Sync failed:', dbError.message);
      }
    }
    
    res.json({
      success: true,
      message: `Synced ${excelResults.length} results`,
      results: excelResults,
      total: excelResults.length
    });
    
  } catch (error) {
    console.error('[ERROR] Sync failed:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;