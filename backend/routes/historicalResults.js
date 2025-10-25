const express = require('express');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

console.log('[INFO] Historical Results routes loaded!');

const router = express.Router();

// Path to the 539 Excel file 
const EXCEL_539_PATH = path.join(__dirname, '../data/539PAST2025RESULT.xlsx');

// Import mongoose only if available - FIXED ERROR HANDLING
let mongoose = null;
let LotteryResultModel = null;

try {
  mongoose = require('mongoose');
  console.log('[INFO] Mongoose module loaded');
  
  // Only try to create model if mongoose is connected
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    // Check if model already exists
    if (mongoose.models && mongoose.models.LotteryResult) {
      LotteryResultModel = mongoose.models.LotteryResult;
      console.log('[INFO] Using existing LotteryResult model');
    } else {
      // Create the schema and model
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
      
      lotteryResultSchema.index({ gameType: 1, drawDate: -1 });
      
      try {
        LotteryResultModel = mongoose.model('LotteryResult', lotteryResultSchema);
        console.log('[INFO] Created new LotteryResult model');
      } catch (modelError) {
        console.log('[WARNING] Could not create model:', modelError.message);
      }
    }
  } else {
    console.log('[WARNING] MongoDB not connected - will use Excel file only');
  }
} catch (error) {
  console.log('[WARNING] Mongoose not available or error loading:', error.message);
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
    // Handle MM/DD/YYYY format
    if (typeof dateString === 'string' && dateString.includes('/')) {
      const parts = dateString.split('/');
      if (parts.length === 3) {
        const month = parseInt(parts[0]) - 1;
        const day = parseInt(parts[1]);
        const year = parseInt(parts[2]);
        return new Date(year, month, day, 12, 0, 0); // Set to noon to avoid timezone issues
      }
    }
    
    // Handle YYYY-MM-DD format
    if (typeof dateString === 'string' && dateString.includes('-')) {
      return new Date(dateString + 'T12:00:00');
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
  
  console.log(`[DEBUG] MongoDB Available: ${available}, ReadyState: ${mongoose?.connection?.readyState}, Model: ${!!LotteryResultModel}`);
  return available;
}

// ============================================
// AUTO-SYNC FUNCTIONALITY
// ============================================

async function syncExcelToMongoDB(excelData) {
  if (!isMongoDBAvailable()) {
    console.log('[SYNC] MongoDB not available, skipping sync');
    return false;
  }

  try {
    console.log('[SYNC] Starting Excel to MongoDB sync...');
    
    let synced = 0;
    let skipped = 0;
    let failed = 0;

    for (const record of excelData) {
      try {
        const drawDate = parseDate(record.drawDate);
        
        // Check if record already exists in MongoDB
        const existingRecord = await LotteryResultModel.findOne({
          gameType: '539',
          drawDate: {
            $gte: new Date(drawDate.setHours(0, 0, 0, 0)),
            $lt: new Date(drawDate.setHours(23, 59, 59, 999))
          }
        });

        if (!existingRecord) {
          // Create new record in MongoDB
          const newRecord = new LotteryResultModel({
            gameType: '539',
            drawDate: parseDate(record.drawDate),
            numbers: record.numbers,
            source: 'excel_sync',
            metadata: {
              syncedAt: new Date(),
              syncedFrom: 'excel',
              originalId: record.id
            }
          });

          await newRecord.save();
          synced++;
          console.log(`[SYNC] Added record for ${record.drawDate}`);
        } else {
          skipped++;
        }
      } catch (recordError) {
        console.error(`[SYNC] Failed to sync record:`, recordError.message);
        failed++;
      }
    }

    console.log(`[SYNC] Completed: ${synced} synced, ${skipped} skipped, ${failed} failed`);
    return true;

  } catch (error) {
    console.error('[SYNC] Excel to MongoDB sync failed:', error.message);
    return false;
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

// Helper: Write Excel file with auto-sync to MongoDB
function writeExcelFile(data, skipSync = false) {
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
    
    // AUTO-SYNC: Whenever we write to Excel, also sync to MongoDB
    if (!skipSync && isMongoDBAvailable()) {
      console.log('[AUTO-SYNC] Triggering automatic sync to MongoDB...');
      syncExcelToMongoDB(data).then(success => {
        if (success) {
          console.log('[AUTO-SYNC] Successfully synced Excel changes to MongoDB');
        } else {
          console.log('[AUTO-SYNC] Sync to MongoDB was not fully successful');
        }
      }).catch(error => {
        console.error('[AUTO-SYNC] Sync error:', error.message);
      });
    }
    
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
    let dataSource = 'none';
    
    // Try MongoDB first if available
    if (isMongoDBAvailable()) {
      try {
        const mongoResults = await LotteryResultModel.find({ gameType: '539' })
          .sort({ drawDate: -1 })
          .lean();
        
        if (mongoResults && mongoResults.length > 0) {
          results = mongoResults.map((result, index) => ({
            _id: result._id ? result._id.toString() : undefined,
            id: index,
            drawDate: formatDateString(result.drawDate),
            numbers: result.numbers || []
          }));
          dataSource = 'mongodb';
          console.log(`[INFO] Loaded ${results.length} from MongoDB`);
        }
      } catch (dbError) {
        console.log('[WARNING] MongoDB query failed:', dbError.message);
      }
    }
    
    // Use Excel if MongoDB didn't work or no results
    if (dataSource === 'none' || results.length === 0) {
      results = readExcelFile();
      dataSource = results.length > 0 ? 'excel' : 'none';
      console.log(`[INFO] Using Excel data (${results.length} results)`);
      
      // If we got data from Excel and MongoDB is available, sync it
      if (results.length > 0 && isMongoDBAvailable()) {
        console.log('[INFO] Found Excel data, triggering background sync to MongoDB...');
        syncExcelToMongoDB(results);
      }
    }
    
    res.json({
      success: true,
      results: results,
      total: results.length,
      dataSource: dataSource,
      mongoAvailable: isMongoDBAvailable()
    });
    
  } catch (error) {
    console.error('[ERROR] GET failed:', error);
    res.json({ 
      success: true, 
      results: [],
      total: 0,
      message: 'No results found',
      dataSource: 'none'
    });
  }
});

// POST /api/admin/historical-results/539/add - FIXED VERSION
router.post('/historical-results/539/add', async (req, res) => {
  console.log('[POST] Add request received');
  console.log('[INFO] Request body:', JSON.stringify(req.body, null, 2));
  
  try {
    const { drawDate, numbers } = req.body;
    
    // Validate input data
    if (!drawDate) {
      return res.status(400).json({
        success: false,
        error: 'Draw date is required'
      });
    }
    
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
    const parsedDate = parseDate(drawDate);
    
    console.log('[INFO] Processed data:', {
      formattedDate,
      sortedNumbers,
      parsedDate: parsedDate.toISOString()
    });
    
    let allResults = [];
    let mongoId = null;
    let dataSource = 'excel';
    let savedToMongo = false;
    
    // Try MongoDB first if available
    if (isMongoDBAvailable()) {
      console.log('[INFO] Attempting MongoDB save...');
      
      try {
        // Check for existing record with date range query
        const startOfDay = new Date(parsedDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(parsedDate);
        endOfDay.setHours(23, 59, 59, 999);
        
        const existing = await LotteryResultModel.findOne({
          gameType: '539',
          drawDate: {
            $gte: startOfDay,
            $lt: endOfDay
          }
        });
        
        if (existing) {
          console.log('[INFO] Record already exists in MongoDB');
          return res.status(400).json({
            success: false,
            error: `Result for ${formattedDate} already exists`
          });
        }
        
        // Create new document
        const newResult = new LotteryResultModel({
          gameType: '539',
          drawDate: parsedDate,
          numbers: sortedNumbers,
          source: 'admin',
          metadata: {
            addedBy: 'admin',
            addedAt: new Date()
          }
        });
        
        const saved = await newResult.save();
        mongoId = saved._id.toString();
        savedToMongo = true;
        dataSource = 'mongodb';
        console.log('[SUCCESS] Saved to MongoDB with ID:', mongoId);
        
        // Get all results
        const mongoResults = await LotteryResultModel.find({ gameType: '539' })
          .sort({ drawDate: -1 })
          .lean();
        
        allResults = mongoResults.map((result, index) => ({
          _id: result._id.toString(),
          id: index,
          drawDate: formatDateString(result.drawDate),
          numbers: result.numbers
        }));
        
        // Update Excel as backup
        writeExcelFile(allResults, true);
        
      } catch (dbError) {
        console.error('[ERROR] MongoDB operation failed:', dbError);
        savedToMongo = false;
        // Continue to Excel fallback
      }
    } else {
      console.log('[INFO] MongoDB not available, using Excel');
    }
    
    // Fallback to Excel if MongoDB failed
    if (!savedToMongo) {
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
      
      // Save (will auto-sync to MongoDB if available)
      if (!writeExcelFile(currentData)) {
        return res.status(500).json({
          success: false,
          error: 'Failed to save data'
        });
      }
      
      allResults = currentData;
      dataSource = 'excel';
      console.log('[SUCCESS] Saved to Excel');
    }
    
    // Return success
    res.json({
      success: true,
      message: `Result added successfully to ${dataSource}`,
      result: {
        _id: mongoId,
        id: 0,
        drawDate: formattedDate,
        numbers: sortedNumbers
      },
      results: allResults,
      total: allResults.length,
      dataSource: dataSource,
      mongoAvailable: isMongoDBAvailable()
    });
    
  } catch (error) {
    console.error('[CRITICAL ERROR] Add route error:', error);
    console.error('[CRITICAL ERROR] Stack:', error.stack);
    
    res.status(500).json({ 
      success: false, 
      error: 'Server error occurred',
      message: error.message
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
    let dataSource = 'excel';

    // Try MongoDB
    if (isMongoDBAvailable()) {
      try {
        const updatedDoc = await LotteryResultModel.findByIdAndUpdate(
          id,
          {
            drawDate: parseDate(drawDate),
            numbers: sortedNumbers,
            metadata: {
              lastUpdatedAt: new Date(),
              updatedBy: 'admin'
            }
          },
          { new: true }
        );
        
        if (updatedDoc) {
          updated = true;
          dataSource = 'mongodb';
          const mongoResults = await LotteryResultModel.find({ gameType: '539' })
            .sort({ drawDate: -1 })
            .lean();
          
          allResults = mongoResults.map((result, index) => ({
            _id: result._id.toString(),
            id: index,
            drawDate: formatDateString(result.drawDate),
            numbers: result.numbers
          }));
          
          writeExcelFile(allResults, true);
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
      dataSource = 'excel';
    }

    res.json({
      success: true,
      message: `Updated in ${dataSource}`,
      results: allResults,
      total: allResults.length,
      dataSource: dataSource,
      mongoAvailable: isMongoDBAvailable()
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
    let dataSource = 'excel';

    // Try MongoDB
    if (isMongoDBAvailable()) {
      try {
        const deletedDoc = await LotteryResultModel.findByIdAndDelete(id);
        
        if (deletedDoc) {
          deleted = true;
          dataSource = 'mongodb';
          const mongoResults = await LotteryResultModel.find({ gameType: '539' })
            .sort({ drawDate: -1 })
            .lean();
          
          allResults = mongoResults.map((result, index) => ({
            _id: result._id.toString(),
            id: index,
            drawDate: formatDateString(result.drawDate),
            numbers: result.numbers
          }));
          
          writeExcelFile(allResults, true);
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
      dataSource = 'excel';
    }

    res.json({
      success: true,
      message: `Deleted from ${dataSource}`,
      results: allResults,
      total: allResults.length,
      dataSource: dataSource,
      mongoAvailable: isMongoDBAvailable()
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
    console.log('[SYNC] Manual sync requested...');
    
    const { direction = 'excel-to-mongo' } = req.body;
    
    let syncResult = false;
    let message = '';
    
    if (direction === 'excel-to-mongo' && isMongoDBAvailable()) {
      const excelData = readExcelFile();
      if (excelData.length > 0) {
        syncResult = await syncExcelToMongoDB(excelData);
        message = syncResult ? 'Successfully synced to MongoDB' : 'Sync failed';
      } else {
        message = 'No Excel data to sync';
      }
    } else if (!isMongoDBAvailable()) {
      message = 'MongoDB not available';
    }
    
    const results = readExcelFile();
    
    res.json({
      success: true,
      message: message,
      syncResult: syncResult,
      results: results,
      total: results.length,
      mongoAvailable: isMongoDBAvailable()
    });
    
  } catch (error) {
    console.error('[ERROR] Sync failed:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Sync failed'
    });
  }
});

// GET /api/admin/historical-results/539/status
router.get('/historical-results/539/status', async (req, res) => {
  try {
    let mongoCount = 0;
    let mongoStatus = 'disconnected';
    
    if (isMongoDBAvailable()) {
      try {
        mongoCount = await LotteryResultModel.countDocuments({ gameType: '539' });
        mongoStatus = 'connected';
      } catch (error) {
        mongoStatus = 'error';
      }
    }
    
    const excelData = readExcelFile();
    
    res.json({
      success: true,
      mongodb: {
        available: isMongoDBAvailable(),
        status: mongoStatus,
        count: mongoCount
      },
      excel: {
        exists: fs.existsSync(EXCEL_539_PATH),
        count: excelData.length
      },
      syncRecommended: mongoCount !== excelData.length && isMongoDBAvailable()
    });
    
  } catch (error) {
    console.error('[ERROR] Status check failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get status'
    });
  }
});

module.exports = router;