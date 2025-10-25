const express = require('express');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

console.log('[INFO] Historical Results routes loaded!');

const router = express.Router();

// Path to the 539 Excel file 
const EXCEL_539_PATH = path.join(__dirname, '../data/539PAST2025RESULT.xlsx');

// Helper: Convert Excel serial date to formatted date string
function excelDateToJSDate(serial) {
  if (typeof serial === 'string') {
    return serial;
  }
  
  if (typeof serial === 'number') {
    const utc_days = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;
    const date_info = new Date(utc_value * 1000);
    
    const year = date_info.getFullYear();
    const month = String(date_info.getMonth() + 1).padStart(2, '0');
    const day = String(date_info.getDate()).padStart(2, '0');
    
    return `${month}/${day}/${year}`;
  }
  
  return serial;
}

// Helper: Parse date string to Date object for MongoDB
function parseDate(dateString) {
  if (!dateString) return new Date();
  
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
}

// Helper: Format date for display
function formatDateString(dateString) {
  if (!dateString) return new Date().toLocaleDateString('en-US');
  
  const date = parseDate(dateString);
  if (isNaN(date.getTime())) {
    return dateString;
  }
  
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

// Helper: Read Excel file 
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
      const dateValue = row['Date'] || row['date'] || row['DATE'] || '';
      const numbers = [];
      
      for (let i = 1; i <= 5; i++) {
        const num = row[`Number ${i}`] || row[`Number${i}`] || 
                   row[`number ${i}`] || row[`number${i}`] || 
                   row[`Num${i}`] || row[`num${i}`] || 
                   row[i.toString()];
        if (num !== undefined && num !== null && num !== '') {
          numbers.push(parseInt(num));
        }
      }
      
      if (numbers.length === 5 && numbers.every(n => !isNaN(n))) {
        return {
          id: index,
          drawDate: excelDateToJSDate(dateValue),
          numbers: numbers
        };
      }
      return null;
    }).filter(row => row !== null);

  } catch (error) {
    console.error('Error reading Excel file:', error);
    return [];
  }
}

// Helper: Write Excel file 
function writeExcelFile(data) {
  try {
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
    console.log('[SUCCESS] Excel file updated:', EXCEL_539_PATH);
    
    return true;
  } catch (error) {
    console.error('Error writing Excel file:', error);
    return false;
  }
}

// Helper: Get LotteryResult model
function getLotteryResultModel() {
  try {
    if (mongoose.models.LotteryResult) {
      return mongoose.models.LotteryResult;
    }
    
    // Updated schema without _id field
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
    console.log('[WARNING] Could not create/get LotteryResult model:', error.message);
    return null;
  }
}

// GET /api/admin/historical-results/539
router.get('/historical-results/539', async (req, res) => {
  try {
    console.log('[INFO] Loading 539 historical results...');
    let results = [];
    let dataSource = 'excel';
    
    // Try MongoDB first if connected
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      try {
        const LotteryResult = getLotteryResultModel();
        
        if (LotteryResult) {
          const mongoResults = await LotteryResult.find({ gameType: '539' })
            .sort({ drawDate: -1 })
            .lean()
            .exec();
          
          if (mongoResults && mongoResults.length > 0) {
            console.log(`[SUCCESS] Loaded ${mongoResults.length} results from MongoDB`);
            dataSource = 'mongodb';
            
            results = mongoResults.map((result, index) => ({
              _id: result._id ? result._id.toString() : undefined,
              id: index,
              drawDate: result.drawDate instanceof Date 
                ? formatDateString(result.drawDate.toISOString())
                : result.drawDate,
              numbers: result.numbers || []
            }));
          }
        }
      } catch (mongoError) {
        console.log('[WARNING] MongoDB read failed, falling back to Excel:', mongoError.message);
      }
    }
    
    // If no MongoDB results, read from Excel
    if (results.length === 0) {
      results = readExcelFile();
      console.log(`[SUCCESS] Loaded ${results.length} results from Excel`);
      dataSource = 'excel';
    }
    
    res.json({
      success: true,
      results: results,
      total: results.length,
      dataSource: dataSource
    });
    
  } catch (error) {
    console.error('[ERROR] Failed loading results:', error);
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
    console.log('[INFO] Adding new result - Request body:', req.body);
    
    let { drawDate, numbers } = req.body;
    
    // If numbers not provided as array, check for individual number fields
    if (!numbers || !Array.isArray(numbers)) {
      const extractedNumbers = [];
      for (let i = 1; i <= 5; i++) {
        const num = req.body[`number${i}`] || req.body[`number_${i}`] || req.body[`num${i}`];
        if (num !== undefined && num !== null && num !== '') {
          extractedNumbers.push(parseInt(num));
        }
      }
      
      if (extractedNumbers.length === 5) {
        numbers = extractedNumbers;
        console.log('[INFO] Extracted numbers from individual fields:', numbers);
      }
    }

    // Validate draw date
    if (!drawDate) {
      console.log('[ERROR] Draw date is missing');
      return res.status(400).json({
        success: false,
        error: 'Draw date is required'
      });
    }

    // Validate numbers
    if (!numbers || !Array.isArray(numbers) || numbers.length !== 5) {
      console.log('[ERROR] Invalid numbers:', numbers);
      return res.status(400).json({
        success: false,
        error: 'Exactly 5 numbers are required'
      });
    }

    // Ensure numbers are integers
    const parsedNumbers = numbers.map(n => parseInt(n));
    console.log('[INFO] Parsed numbers:', parsedNumbers);

    // Validate number range
    if (parsedNumbers.some(n => isNaN(n) || n < 1 || n > 39)) {
      console.log('[ERROR] Numbers out of range:', parsedNumbers);
      return res.status(400).json({
        success: false,
        error: 'All numbers must be between 1 and 39'
      });
    }

    // Check for duplicate numbers
    if (new Set(parsedNumbers).size !== 5) {
      console.log('[ERROR] Duplicate numbers found:', parsedNumbers);
      return res.status(400).json({
        success: false,
        error: 'Numbers must be unique (no duplicates allowed)'
      });
    }

    // Sort numbers
    const sortedNumbers = parsedNumbers.sort((a, b) => a - b);
    const formattedDate = formatDateString(drawDate);
    
    let savedToMongoDB = false;
    let allResults = [];
    let newDocId = null;

    // Try to save to MongoDB first
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      try {
        const LotteryResult = getLotteryResultModel();
        
        if (LotteryResult) {
          // Check for existing result with same date
          const parsedDateObj = parseDate(drawDate);
          const startOfDay = new Date(parsedDateObj);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(parsedDateObj);
          endOfDay.setHours(23, 59, 59, 999);
          
          const existing = await LotteryResult.findOne({ 
            gameType: '539',
            drawDate: {
              $gte: startOfDay,
              $lte: endOfDay
            }
          });
          
          if (existing) {
            console.log('[WARNING] Result already exists for date:', formattedDate);
            return res.status(400).json({
              success: false,
              error: 'A result for this date already exists'
            });
          }
          
          // Create new document - MongoDB will auto-generate _id
          const newDoc = new LotteryResult({
            gameType: '539',
            drawDate: parsedDateObj,
            numbers: sortedNumbers,
            source: 'manual'
          });
          
          // Save to MongoDB
          const savedDoc = await newDoc.save();
          savedToMongoDB = true;
          newDocId = savedDoc._id.toString();
          console.log('[SUCCESS] Saved to MongoDB with _id:', newDocId);
          
          // Get all results from MongoDB
          const mongoResults = await LotteryResult.find({ gameType: '539' })
            .sort({ drawDate: -1 })
            .lean()
            .exec();
          
          allResults = mongoResults.map((result, index) => ({
            _id: result._id ? result._id.toString() : undefined,
            id: index,
            drawDate: result.drawDate instanceof Date 
              ? formatDateString(result.drawDate.toISOString())
              : result.drawDate,
            numbers: result.numbers
          }));
          
          // Also update Excel as backup
          const excelData = allResults.map(r => ({
            id: r.id,
            drawDate: r.drawDate,
            numbers: r.numbers
          }));
          writeExcelFile(excelData);
        }
      } catch (mongoError) {
        console.error('[WARNING] MongoDB save failed:', mongoError);
        console.error('MongoDB error details:', mongoError.message);
        savedToMongoDB = false;
      }
    } else {
      console.log('[INFO] MongoDB not connected, using Excel only');
    }
    
    // If MongoDB failed or not connected, use Excel
    if (!savedToMongoDB) {
      // Read current Excel data
      const currentData = readExcelFile();
      
      // Check if date already exists
      const dateExists = currentData.some(row => {
        const rowDate = formatDateString(row.drawDate);
        return rowDate === formattedDate;
      });
      
      if (dateExists) {
        console.log('[WARNING] Result already exists in Excel for date:', formattedDate);
        return res.status(400).json({
          success: false,
          error: 'A result for this date already exists'
        });
      }
      
      // Create new result
      const newResult = {
        id: 0,
        drawDate: formattedDate,
        numbers: sortedNumbers
      };
      
      // Add to beginning
      currentData.unshift(newResult);
      
      // Re-index
      currentData.forEach((row, idx) => {
        row.id = idx;
      });
      
      // Write to Excel
      if (!writeExcelFile(currentData)) {
        console.log('[ERROR] Failed to write to Excel file');
        return res.status(500).json({
          success: false,
          error: 'Failed to save data to Excel file'
        });
      }
      
      allResults = currentData;
      console.log(`[SUCCESS] Added to Excel: ${formattedDate} - ${sortedNumbers.join(', ')}`);
    }
    
    // Return success response
    res.json({
      success: true,
      message: 'Result added successfully',
      result: {
        _id: newDocId,
        id: 0,
        drawDate: formattedDate,
        numbers: sortedNumbers
      },
      results: allResults,
      total: allResults.length
    });
    
  } catch (error) {
    console.error('[ERROR] Failed to add result:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Internal server error'
    });
  }
});

// PUT /api/admin/historical-results/539/:id
router.put('/historical-results/539/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { drawDate, numbers } = req.body;

    console.log(`[INFO] Updating result ID ${id}:`, req.body);

    // Validate input
    if (!drawDate || !numbers || !Array.isArray(numbers) || numbers.length !== 5) {
      return res.status(400).json({
        success: false,
        error: 'Invalid data. Need drawDate and 5 numbers'
      });
    }

    const parsedNumbers = numbers.map(n => parseInt(n));

    if (parsedNumbers.some(n => isNaN(n) || n < 1 || n > 39)) {
      return res.status(400).json({
        success: false,
        error: 'All numbers must be between 1 and 39'
      });
    }

    if (new Set(parsedNumbers).size !== 5) {
      return res.status(400).json({
        success: false,
        error: 'Numbers must be unique'
      });
    }

    const sortedNumbers = parsedNumbers.sort((a, b) => a - b);
    const formattedDate = formatDateString(drawDate);
    let updated = false;
    let allResults = [];

    // Try MongoDB first
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      try {
        const LotteryResult = getLotteryResultModel();
        
        if (LotteryResult) {
          // MongoDB uses ObjectId, not numeric ID
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
              .lean()
              .exec();
            
            allResults = mongoResults.map((result, index) => ({
              _id: result._id ? result._id.toString() : undefined,
              id: index,
              drawDate: result.drawDate instanceof Date 
                ? formatDateString(result.drawDate.toISOString())
                : result.drawDate,
              numbers: result.numbers
            }));
            
            writeExcelFile(allResults);
          }
        }
      } catch (mongoError) {
        console.log('[WARNING] MongoDB update failed:', mongoError.message);
      }
    }

    // Fallback to Excel if MongoDB failed
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
        ...currentData[index],
        drawDate: formattedDate,
        numbers: sortedNumbers
      };

      if (!writeExcelFile(currentData)) {
        return res.status(500).json({
          success: false,
          error: 'Failed to write to Excel file'
        });
      }

      allResults = currentData;
      console.log(`[SUCCESS] Updated in Excel: ${resultId}`);
    }

    res.json({
      success: true,
      message: 'Result updated successfully',
      results: allResults,
      total: allResults.length
    });
    
  } catch (error) {
    console.error('[ERROR] Failed to update result:', error);
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

    console.log(`[INFO] Deleting result ID ${id}`);

    let deleted = false;
    let allResults = [];

    // Try MongoDB first
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      try {
        const LotteryResult = getLotteryResultModel();
        
        if (LotteryResult) {
          // Try to delete by ObjectId
          const deletedDoc = await LotteryResult.findByIdAndDelete(id);
          
          if (deletedDoc) {
            deleted = true;
            console.log('[SUCCESS] Deleted from MongoDB');
            
            const mongoResults = await LotteryResult.find({ gameType: '539' })
              .sort({ drawDate: -1 })
              .lean()
              .exec();
            
            allResults = mongoResults.map((result, index) => ({
              _id: result._id ? result._id.toString() : undefined,
              id: index,
              drawDate: result.drawDate instanceof Date 
                ? formatDateString(result.drawDate.toISOString())
                : result.drawDate,
              numbers: result.numbers
            }));
            
            writeExcelFile(allResults);
          }
        }
      } catch (mongoError) {
        console.log('[WARNING] MongoDB delete failed:', mongoError.message);
      }
    }

    // Fallback to Excel if MongoDB failed
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
          error: 'Failed to write to Excel file'
        });
      }

      allResults = currentData;
      console.log(`[SUCCESS] Deleted from Excel: ${resultId}`);
    }

    res.json({
      success: true,
      message: 'Result deleted successfully',
      results: allResults,
      total: allResults.length
    });
    
  } catch (error) {
    console.error('[ERROR] Failed to delete result:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// POST /api/admin/historical-results/539/sync
router.post('/historical-results/539/sync', async (req, res) => {
  try {
    console.log('[INFO] Syncing data...');
    const excelResults = readExcelFile();
    let syncedResults = excelResults;
    
    // Sync with MongoDB if connected
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      try {
        const LotteryResult = getLotteryResultModel();
        
        if (LotteryResult) {
          await LotteryResult.deleteMany({ gameType: '539' });
          
          if (excelResults.length > 0) {
            const mongoDocuments = excelResults.map(r => ({
              gameType: '539',
              drawDate: parseDate(r.drawDate),
              numbers: r.numbers,
              source: 'manual'
            }));
            
            await LotteryResult.insertMany(mongoDocuments, { ordered: false });
            console.log(`[SUCCESS] Synced ${mongoDocuments.length} results to MongoDB`);
            
            const mongoResults = await LotteryResult.find({ gameType: '539' })
              .sort({ drawDate: -1 })
              .lean()
              .exec();
            
            syncedResults = mongoResults.map((result, index) => ({
              _id: result._id ? result._id.toString() : undefined,
              id: index,
              drawDate: result.drawDate instanceof Date 
                ? formatDateString(result.drawDate.toISOString())
                : result.drawDate,
              numbers: result.numbers
            }));
          }
        }
      } catch (mongoError) {
        console.error('[WARNING] MongoDB sync failed:', mongoError.message);
      }
    }
    
    console.log(`[SUCCESS] Sync complete: ${syncedResults.length} results`);
    
    res.json({
      success: true,
      message: `Synced ${syncedResults.length} results`,
      results: syncedResults,
      total: syncedResults.length
    });
    
  } catch (error) {
    console.error('[ERROR] Sync failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;