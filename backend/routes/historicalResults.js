console.log('🔥🔥🔥 HISTORICAL RESULTS ROUTE LOADED - ISO FORMAT VERSION 🔥🔥🔥');

const express = require('express');
const mongoose = require('mongoose');
const { ObjectId } = require('mongoose').Types;
const LotteryResult = require('../models_mongoose/LotteryResult');

console.log('[INFO] Historical Results routes loaded!');

const router = express.Router();

// Helper: Check if MongoDB is available
function isMongoDBAvailable() {
  const isConnected = mongoose.connection && mongoose.connection.readyState === 1;
  console.log(`[MongoDB Status] Connected: ${isConnected}, ReadyState: ${mongoose.connection?.readyState}`);
  return isConnected;
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

// Helper function to sync MongoDB with Excel (remove items from MongoDB that don't exist in Excel)
async function syncMongoDBWithExcel() {
  if (!isMongoDBAvailable()) {
    return { success: false, message: 'MongoDB not available' };
  }

  try {
    const collection = mongoose.connection.db.collection('lottery_results');
    const excelData = readExcelFile();
    
    // Get all Excel dates for comparison
    const excelDates = excelData.map(record => formatDateString(record.drawDate));
    
    // Get all MongoDB records
    const mongoRecords = await collection.find({ gameType: '539' }).toArray();
    
    let deleted = 0;
    let kept = 0;
    
    // Check each MongoDB record
    for (const mongoRecord of mongoRecords) {
      const mongoDate = formatDateString(mongoRecord.drawDate);
      
      // If this date doesn't exist in Excel, delete it from MongoDB
      if (!excelDates.includes(mongoDate)) {
        await collection.deleteOne({ _id: mongoRecord._id });
        deleted++;
        console.log(`[SYNC] Deleted orphaned MongoDB record for date: ${mongoDate}`);
      } else {
        kept++;
      }
    }
    
    // Now add any Excel records that are missing in MongoDB
    let added = 0;
    for (const excelRecord of excelData) {
      const parsedDate = parseDate(excelRecord.drawDate);
      const startOfDay = new Date(parsedDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(parsedDate);
      endOfDay.setHours(23, 59, 59, 999);
      
      const existing = await collection.findOne({
        gameType: '539',
        drawDate: {
          $gte: startOfDay,
          $lte: endOfDay
        }
      });
      
      if (!existing) {
        const newId = new ObjectId();
        await collection.insertOne({
          _id: newId,
          gameType: '539',
          drawDate: parsedDate,
          numbers: excelRecord.numbers,
          source: 'excel_sync',
          metadata: {
            syncedAt: new Date()
          },
          createdAt: new Date(),
          updatedAt: new Date()
        });
        added++;
        console.log(`[SYNC] Added missing record for date: ${excelRecord.drawDate}`);
      }
    }
    
    return {
      success: true,
      deleted: deleted,
      kept: kept,
      added: added,
      totalMongo: kept + added,
      totalExcel: excelData.length
    };
    
  } catch (error) {
    console.error('[SYNC] Error syncing MongoDB with Excel:', error);
    return { success: false, error: error.message };
  }
}

// SYNC FUNCTION: Sync single record from Excel to MongoDB
async function syncRecordToMongoDB(record) {
  if (!isMongoDBAvailable()) {
    console.log('[SYNC] MongoDB not available');
    return null;
  }

  try {
    const collection = mongoose.connection.db.collection('lottery_results');
    
    // Parse the date properly
    const parsedDate = parseDate(record.drawDate);
    
    // Check if already exists
    const startOfDay = new Date(parsedDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(parsedDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    const existing = await collection.findOne({
      gameType: '539',
      drawDate: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    });
    
    if (existing) {
      console.log('[SYNC] Record already exists in MongoDB');
      return existing._id.toString();
    }
    
    // Create new document
    const newId = new ObjectId();
    const documentData = {
      _id: newId,
      gameType: '539',
      drawDate: parsedDate,
      numbers: record.numbers,
      source: 'admin',
      metadata: {
        addedBy: 'admin',
        addedAt: new Date(),
        syncedFromExcel: true
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Insert into MongoDB
    const insertResult = await collection.insertOne(documentData);
    
    if (insertResult.acknowledged) {
      console.log('[SYNC] Successfully synced to MongoDB:', insertResult.insertedId);
      return insertResult.insertedId.toString();
    }
    
    return null;
  } catch (error) {
    console.error('[SYNC] Failed to sync to MongoDB:', error.message);
    return null;
  }
}

// GET /api/admin/historical-results/539
router.get('/historical-results/539', async (req, res) => {
  try {
    console.log('[GET] Loading results from MongoDB...');
    
    const results = await LotteryResult.find({ gameType: '539' })
      .sort({ drawDate: -1 })
      .lean();
      
    console.log('[GET] Sample result:', JSON.stringify(results[0], null, 2));
    
    const formattedResults = results.map((result, index) => {
      // Ensure drawDate is a proper Date object
      const date = new Date(result.drawDate);
      return {
        id: index,
        drawDate: date.toISOString().split('T')[0], // Return YYYY-MM-DD format for proper sorting
        numbers: result.numbers
      };
    });
    
    console.log(`[GET] Returning ${results.length} results from MongoDB`);
    
    res.json({
      success: true,
      results: formattedResults,
      total: formattedResults.length
    });
    
  } catch (error) {
    console.error('[GET] Error:', error);
    res.status(500).json({ 
      success: false, 
      results: [],
      total: 0,
      message: error.message
    });
  }
});

// POST /api/admin/historical-results/539/add
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
    
    // ✅ FIX: Parse date without mutating it for the range query
    const parsedDate = new Date(drawDate);
    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format. Please use YYYY-MM-DD format'
      });
    }
    
    // ✅ FIX: Create separate date objects for range queries - DO NOT MUTATE parsedDate
    const startOfDay = new Date(parsedDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(parsedDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    // Check for existing record using the separate date objects
    const existingResult = await LotteryResult.findOne({
      gameType: '539',
      drawDate: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    });

    if (existingResult) {
      return res.status(400).json({
        success: false,
        error: `Result for ${parsedDate.toLocaleDateString('en-US')} already exists`
      });
    }

    // Find the highest numeric _id to generate the next one
    const lastResult = await LotteryResult.findOne({
      _id: { $type: "number" }
    })
    .sort({ _id: -1 })
    .lean();
    
    const nextId = (lastResult?._id || 10010) + 1;
    console.log('[ADD] Last numeric ID:', lastResult?._id);
    console.log('[ADD] Generating next ID:', nextId);

    // ✅ FIX: Now save with the original parsedDate (still at 12:00:00)
    const newResult = new LotteryResult({
      _id: nextId,
      gameType: '539',
      drawDate: parsedDate,
      numbers: sortedNumbers,
      source: 'admin'
    });
    
    try {
      await newResult.save();
      console.log('[ADD] New result saved with ID:', newResult._id);
    } catch (saveError) {
      console.error('[ADD] Save error:', saveError);
      throw saveError;
    }
    
    // Get updated results
    const allResults = await LotteryResult.find({ gameType: '539' })
      .sort({ drawDate: -1 })
      .lean();

    const formattedResults = allResults.map((result, index) => ({
      id: index,
      drawDate: new Date(result.drawDate).toISOString().split('T')[0],
      numbers: result.numbers
    }));

    res.json({
      success: true,
      message: 'Result added successfully',
      result: {
        _id: newResult._id,
        id: 0,
        drawDate: parsedDate.toISOString().split('T')[0],
        numbers: sortedNumbers
      },
      results: formattedResults,
      total: formattedResults.length
    });
    
  } catch (error) {
    console.error('[ERROR] Add failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error',
      message: error.message
    });
  }
});

// DELETE /api/admin/historical-results/539/:id
router.delete('/historical-results/539/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`[DELETE] Delete request for ID: ${id}`);

    let deletedResult;
    
    // Handle both index-based and MongoDB ObjectId-based deletion
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      // MongoDB ObjectId
      deletedResult = await LotteryResult.findByIdAndDelete(id);
    } else {
      // Index-based deletion
      const allResults = await LotteryResult.find({ gameType: '539' })
        .sort({ drawDate: -1 });
      
      const index = parseInt(id);
      if (isNaN(index) || index < 0 || index >= allResults.length) {
        return res.status(404).json({
          success: false,
          error: 'Result not found'
        });
      }
      
      deletedResult = await LotteryResult.findByIdAndDelete(allResults[index]._id);
    }

    if (!deletedResult) {
      return res.status(404).json({
        success: false,
        error: 'Result not found'
      });
    }

    // Get updated results after deletion
    const updatedResults = await LotteryResult.find({ gameType: '539' })
      .sort({ drawDate: -1 })
      .lean();

    console.log(`[DELETE] Operation complete. Remaining records: ${updatedResults.length}`);

    const formattedResults = updatedResults.map((result, index) => ({
      id: index,
      drawDate: new Date(result.drawDate).toISOString().split('T')[0],
      numbers: result.numbers
    }));

    res.json({
      success: true,
      message: 'Result deleted successfully',
      deletedItem: {
        id: id,
        drawDate: new Date(deletedResult.drawDate).toISOString().split('T')[0],
        numbers: deletedResult.numbers
      },
      results: formattedResults,
      total: formattedResults.length
    });
  } catch (error) {
    console.error('[DELETE] Error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete result',
      message: error.message
    });
  }
});

// POST /api/admin/historical-results/539/sync - Manual sync from Excel to MongoDB
router.post('/historical-results/539/sync', async (req, res) => {
  try {
    console.log('[SYNC] Manual sync requested...');
    
    if (!isMongoDBAvailable()) {
      return res.status(503).json({
        success: false,
        error: 'MongoDB is not connected',
        message: 'Cannot sync to cloud database at this time'
      });
    }
    
    const result = await syncMongoDBWithExcel();
    
    res.json({
      success: result.success,
      message: result.success ? 
        `Sync completed: ${result.deleted} deleted, ${result.added} added, ${result.kept} kept` :
        'Sync failed',
      stats: result
    });
    
  } catch (error) {
    console.error('[ERROR] Sync failed:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Sync failed',
      message: error.message
    });
  }
});

// POST /api/admin/historical-results/539/force-sync - Force complete sync
router.post('/historical-results/539/force-sync', async (req, res) => {
  try {
    console.log('[FORCE-SYNC] Starting complete sync...');
    
    if (!isMongoDBAvailable()) {
      return res.status(503).json({
        success: false,
        error: 'MongoDB not connected'
      });
    }
    
    const collection = mongoose.connection.db.collection('lottery_results');
    
    // Step 1: Clear all MongoDB 539 records
    const deleteResult = await collection.deleteMany({ gameType: '539' });
    console.log(`[FORCE-SYNC] Deleted ${deleteResult.deletedCount} records from MongoDB`);
    
    // Step 2: Read Excel data
    const excelData = readExcelFile();
    console.log(`[FORCE-SYNC] Found ${excelData.length} records in Excel`);
    
    // Step 3: Insert all Excel records into MongoDB
    let inserted = 0;
    let failed = 0;
    
    for (const record of excelData) {
      try {
        const newId = new ObjectId();
        await collection.insertOne({
          _id: newId,
          gameType: '539',
          drawDate: parseDate(record.drawDate),
          numbers: record.numbers,
          source: 'force_sync',
          metadata: {
            syncedAt: new Date(),
            originalIndex: record.id
          },
          createdAt: new Date(),
          updatedAt: new Date()
        });
        inserted++;
      } catch (err) {
        console.error(`[FORCE-SYNC] Failed to insert record:`, err.message);
        failed++;
      }
    }
    
    console.log(`[FORCE-SYNC] Complete: ${inserted} inserted, ${failed} failed`);
    
    res.json({
      success: true,
      message: 'Force sync completed',
      stats: {
        deletedFromMongo: deleteResult.deletedCount,
        insertedToMongo: inserted,
        failedInserts: failed,
        totalExcelRecords: excelData.length,
        finalMongoCount: inserted
      }
    });
    
  } catch (error) {
    console.error('[FORCE-SYNC] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Force sync failed',
      message: error.message
    });
  }
});

// GET /api/admin/historical-results/539/status - Check sync status
router.get('/historical-results/539/status', async (req, res) => {
  try {
    let mongoCount = 0;
    let excelCount = 0;
    let mongoConnected = false;
    
    // Check MongoDB
    if (isMongoDBAvailable()) {
      mongoConnected = true;
      const collection = mongoose.connection.db.collection('lottery_results');
      mongoCount = await collection.countDocuments({ gameType: '539' });
    }
    
    // Check Excel
    const excelData = readExcelFile();
    excelCount = excelData.length;
    
    res.json({
      success: true,
      mongodb: {
        connected: mongoConnected,
        count: mongoCount
      },
      excel: {
        exists: fs.existsSync(EXCEL_539_PATH),
        count: excelCount
      },
      syncNeeded: mongoConnected && (excelCount !== mongoCount),
      message: mongoConnected 
        ? `MongoDB: ${mongoCount} records, Excel: ${excelCount} records`
        : 'MongoDB not connected, using Excel storage'
    });
    
  } catch (error) {
    console.error('[ERROR] Status check failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get status'
    });
  }
});

// PUT /api/admin/historical-results/539/:id - Update a result
router.put('/historical-results/539/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { drawDate, numbers } = req.body;
    
    console.log(`[PUT] Update request for ID: ${id}`);
    
    // Validate input
    if (!drawDate || !numbers || !Array.isArray(numbers) || numbers.length !== 5) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input data'
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
        error: 'All numbers must be unique'
      });
    }
    
    const sortedNumbers = parsedNumbers.sort((a, b) => a - b);
    const formattedDate = formatDateString(parseDate(drawDate));
    
    // Read current data
    const currentData = readExcelFile();
    
    // Find and update
    const index = parseInt(id);
    if (isNaN(index) || index < 0 || index >= currentData.length) {
      return res.status(404).json({
        success: false,
        error: 'Result not found'
      });
    }
    
    currentData[index] = {
      id: index,
      drawDate: formattedDate,
      numbers: sortedNumbers
    };
    
    // Save to Excel
    if (!writeExcelFile(currentData)) {
      return res.status(500).json({
        success: false,
        error: 'Failed to save changes'
      });
    }
    
    res.json({
      success: true,
      message: 'Result updated successfully',
      results: currentData,
      total: currentData.length
    });
    
  } catch (error) {
    console.error('[ERROR] Update failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update result',
      message: error.message
    });
  }
});

module.exports = router;