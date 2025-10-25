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

// Helper: Check if MongoDB is available and connected
function isMongoDBAvailable() {
  return mongoose && 
         mongoose.connection && 
         mongoose.connection.readyState === 1 && 
         LotteryResultModel;
}

// ============================================
// AUTO-SYNC FUNCTIONALITY
// ============================================

/**
 * Automatically sync Excel data to MongoDB
 * This function is called whenever we write to Excel
 */
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
        // Check if record already exists in MongoDB
        const existingRecord = await LotteryResultModel.findOne({
          gameType: '539',
          drawDate: parseDate(record.drawDate)
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
          // Update existing record if numbers are different
          const numbersMatch = JSON.stringify(existingRecord.numbers.sort()) === 
                              JSON.stringify(record.numbers.sort());
          
          if (!numbersMatch) {
            existingRecord.numbers = record.numbers;
            existingRecord.metadata = {
              ...existingRecord.metadata,
              lastSyncedAt: new Date(),
              syncedFrom: 'excel'
            };
            await existingRecord.save();
            synced++;
            console.log(`[SYNC] Updated record for ${record.drawDate}`);
          } else {
            skipped++;
          }
        }
      } catch (recordError) {
        console.error(`[SYNC] Failed to sync record for ${record.drawDate}:`, recordError.message);
        failed++;
      }
    }

    console.log(`[SYNC] Sync completed: ${synced} synced, ${skipped} skipped, ${failed} failed`);
    return true;

  } catch (error) {
    console.error('[SYNC] Excel to MongoDB sync failed:', error.message);
    return false;
  }
}

/**
 * Sync MongoDB data to Excel (reverse sync)
 * Useful when MongoDB has data that Excel doesn't
 */
async function syncMongoDBToExcel() {
  if (!isMongoDBAvailable()) {
    return false;
  }

  try {
    console.log('[SYNC] Starting MongoDB to Excel sync...');
    
    // Get all MongoDB records
    const mongoRecords = await LotteryResultModel.find({ gameType: '539' })
      .sort({ drawDate: -1 })
      .lean();

    if (!mongoRecords || mongoRecords.length === 0) {
      console.log('[SYNC] No MongoDB records to sync');
      return false;
    }

    // Convert to Excel format
    const excelData = mongoRecords.map((record, index) => ({
      id: index,
      drawDate: formatDateString(record.drawDate),
      numbers: record.numbers || []
    }));

    // Write to Excel
    const success = writeExcelFile(excelData);
    
    if (success) {
      console.log(`[SYNC] Successfully synced ${excelData.length} records from MongoDB to Excel`);
    }
    
    return success;

  } catch (error) {
    console.error('[SYNC] MongoDB to Excel sync failed:', error.message);
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
      // If Excel doesn't exist but MongoDB has data, create Excel from MongoDB
      if (isMongoDBAvailable()) {
        console.log('[INFO] Excel file not found, attempting to create from MongoDB...');
        syncMongoDBToExcel();
        
        // If sync was successful, the file should now exist
        if (fs.existsSync(EXCEL_539_PATH)) {
          return readExcelFile(); // Recursive call to read the newly created file
        }
      }
      
      // Create empty Excel file if no MongoDB data
      const emptyWorkbook = XLSX.utils.book_new();
      const emptySheet = XLSX.utils.aoa_to_sheet([
        ['Date', 'Number 1', 'Number 2', 'Number 3', 'Number 4', 'Number 5']
      ]);
      XLSX.utils.book_append_sheet(emptyWorkbook, emptySheet, 'Results');
      XLSX.writeFile(emptyWorkbook, EXCEL_539_PATH);
      console.log('[INFO] Created new empty Excel file');
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
          console.log('[AUTO-SYNC] Failed to sync to MongoDB, but Excel saved successfully');
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
    let usesMongoDB = false;
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
          usesMongoDB = true;
          dataSource = 'mongodb';
          console.log(`[INFO] Loaded ${results.length} from MongoDB`);
        }
      } catch (dbError) {
        console.log('[WARNING] MongoDB query failed:', dbError.message);
      }
    }
    
    // Use Excel if MongoDB didn't work or no results
    if (!usesMongoDB || results.length === 0) {
      results = readExcelFile();
      dataSource = results.length > 0 ? 'excel' : 'none';
      console.log(`[INFO] Using Excel data (${results.length} results)`);
      
      // If we got data from Excel and MongoDB is available, sync it
      if (results.length > 0 && isMongoDBAvailable() && !usesMongoDB) {
        console.log('[INFO] Found Excel data while MongoDB is available, triggering sync...');
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
    // Return empty results instead of error
    res.json({ 
      success: true, 
      results: [],
      total: 0,
      message: 'No results found',
      dataSource: 'none'
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
    let allResults = [];
    let mongoId = null;
    let dataSource = 'excel';
    
    // Try MongoDB first if available
    let savedToMongo = false;
    if (isMongoDBAvailable()) {
      try {
        // Check if already exists
        const existing = await LotteryResultModel.findOne({
          gameType: '539',
          drawDate: parseDate(drawDate)
        });
        
        if (existing) {
          return res.status(400).json({
            success: false,
            error: `Result for ${formattedDate} already exists in database`
          });
        }
        
        // Create new document
        const newResult = new LotteryResultModel({
          gameType: '539',
          drawDate: parseDate(drawDate),
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
        console.log('[SUCCESS] Saved to MongoDB');
        
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
        
        // Also update Excel file for backup (with skipSync flag to avoid circular sync)
        writeExcelFile(allResults, true);
        
      } catch (dbError) {
        console.log('[WARNING] MongoDB save failed:', dbError.message);
        savedToMongo = false;
      }
    }
    
    // If MongoDB failed or not available, use Excel
    if (!savedToMongo) {
      const currentData = readExcelFile();
      
      // Check for existing
      const exists = currentData.some(row => 
        formatDateString(row.drawDate) === formattedDate
      );
      
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
      
      // Save to Excel (this will auto-sync to MongoDB if available)
      if (!writeExcelFile(currentData)) {
        return res.status(500).json({
          success: false,
          error: 'Failed to save data'
        });
      }
      
      allResults = currentData;
      dataSource = 'excel';
      console.log('[SUCCESS] Saved to Excel (will auto-sync to MongoDB if available)');
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
    console.error('[ERROR] Add failed:', error.message);
    console.error('[ERROR] Stack:', error.stack);
    
    // Try to provide a helpful response even on error
    res.status(500).json({ 
      success: false, 
      error: 'Server error. Please try again.',
      details: error.message
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
          
          // Update Excel as backup (with skipSync flag)
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

      // Save to Excel (will auto-sync to MongoDB)
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
          
          // Update Excel as backup (with skipSync flag)
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

      // Save to Excel (will auto-sync to MongoDB)
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
    
    const { direction = 'both' } = req.body; // 'excel-to-mongo', 'mongo-to-excel', 'both'
    
    let syncResults = {
      excelToMongo: false,
      mongoToExcel: false,
      message: ''
    };
    
    if (direction === 'excel-to-mongo' || direction === 'both') {
      const excelData = readExcelFile();
      if (excelData.length > 0) {
        syncResults.excelToMongo = await syncExcelToMongoDB(excelData);
      }
    }
    
    if (direction === 'mongo-to-excel' || direction === 'both') {
      syncResults.mongoToExcel = await syncMongoDBToExcel();
    }
    
    // Get final results
    const results = readExcelFile();
    
    if (syncResults.excelToMongo || syncResults.mongoToExcel) {
      syncResults.message = 'Sync completed successfully';
    } else {
      syncResults.message = 'Sync not performed (MongoDB not available or no data)';
    }
    
    res.json({
      success: true,
      message: syncResults.message,
      syncResults: syncResults,
      results: results,
      total: results.length,
      mongoAvailable: isMongoDBAvailable()
    });
    
  } catch (error) {
    console.error('[ERROR] Manual sync failed:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Sync failed',
      details: error.message
    });
  }
});

// GET /api/admin/historical-results/539/status
router.get('/historical-results/539/status', async (req, res) => {
  try {
    let mongoCount = 0;
    let excelCount = 0;
    let mongoStatus = 'disconnected';
    
    // Check MongoDB
    if (isMongoDBAvailable()) {
      try {
        mongoCount = await LotteryResultModel.countDocuments({ gameType: '539' });
        mongoStatus = 'connected';
      } catch (error) {
        mongoStatus = 'error';
      }
    }
    
    // Check Excel
    const excelData = readExcelFile();
    excelCount = excelData.length;
    
    res.json({
      success: true,
      status: {
        mongodb: {
          connected: isMongoDBAvailable(),
          status: mongoStatus,
          recordCount: mongoCount
        },
        excel: {
          exists: fs.existsSync(EXCEL_539_PATH),
          recordCount: excelCount,
          path: EXCEL_539_PATH
        },
        syncRecommended: mongoCount !== excelCount && isMongoDBAvailable()
      }
    });
    
  } catch (error) {
    console.error('[ERROR] Status check failed:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get status'
    });
  }
});

module.exports = router;