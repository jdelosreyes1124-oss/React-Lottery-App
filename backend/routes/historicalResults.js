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
router.post('/historical-results/539/add', async (req, res) => {
  try {
    console.log('[POST] Add request received');
    console.log('[POST] Body:', JSON.stringify(req.body));
    
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
    const parsedNumbers = numbers.map(n => parseInt(n));
    
    for (let i = 0; i < parsedNumbers.length; i++) {
      const num = parsedNumbers[i];
      if (isNaN(num) || num < 1 || num > 39) {
        return res.status(400).json({
          success: false,
          error: `Number ${i+1} must be between 1 and 39`
        });
      }
    }
    
    // Check for duplicates
    if (new Set(parsedNumbers).size !== 5) {
      return res.status(400).json({
        success: false,
        error: 'All numbers must be unique'
      });
    }
    
    const sortedNumbers = parsedNumbers.sort((a, b) => a - b);
    const formattedDate = formatDateString(drawDate);
    const parsedDateObj = parseDate(drawDate);
    
    console.log('[INFO] Date:', formattedDate);
    console.log('[INFO] Numbers:', sortedNumbers);
    
    let savedDoc = null;
    let allResults = [];
    
    // Try to save to MongoDB
    if (mongoose.connection.readyState === 1) {
      try {
        const LotteryResult = getLotteryResultModel();
        
        if (LotteryResult) {
          // Check for existing result
          const startOfDay = new Date(parsedDateObj);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(parsedDateObj);
          endOfDay.setHours(23, 59, 59, 999);
          
          const existing = await LotteryResult.findOne({ 
            gameType: '539',
            drawDate: { $gte: startOfDay, $lte: endOfDay }
          });
          
          if (existing) {
            console.log('[WARNING] Date already exists');
            return res.status(400).json({
              success: false,
              error: `Result for ${formattedDate} already exists`
            });
          }
          
          // Create new document
          const newDoc = new LotteryResult({
            gameType: '539',
            drawDate: parsedDateObj,
            numbers: sortedNumbers,
            source: 'manual'
          });
          
          // Save to MongoDB
          savedDoc = await newDoc.save();
          console.log('[SUCCESS] Saved to MongoDB, ID:', savedDoc._id);
          
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
        console.error('[ERROR] MongoDB save failed:', dbError.message);
        // Continue to Excel fallback
      }
    }
    
    // Fallback to Excel if MongoDB failed
    if (!savedDoc) {
      console.log('[INFO] Using Excel storage');
      const currentData = readExcelFile();
      
      // Check if date exists
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
      
      if (!writeExcelFile(currentData)) {
        return res.status(500).json({
          success: false,
          error: 'Failed to save data'
        });
      }
      
      allResults = currentData;
    }
    
    console.log('[SUCCESS] Result added');
    
    res.json({
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
    });
    
  } catch (error) {
    console.error('[ERROR] Add failed:', error.message);
    console.error('[ERROR] Stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      error: error.message
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