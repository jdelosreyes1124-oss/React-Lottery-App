const express = require('express');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { ObjectId } = require('mongoose').Types;

console.log('[INFO] Historical Results routes loaded!');

const router = express.Router();

// Path to the 539 Excel file 
const EXCEL_539_PATH = path.join(__dirname, '../data/539PAST2025RESULT.xlsx');

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

// SYNC ALL: Sync all Excel records to MongoDB
async function syncAllToMongoDB() {
  if (!isMongoDBAvailable()) {
    console.log('[SYNC ALL] MongoDB not available');
    return { success: false, message: 'MongoDB not connected' };
  }

  try {
    const excelData = readExcelFile();
    const collection = mongoose.connection.db.collection('lottery_results');
    
    let synced = 0;
    let skipped = 0;
    let failed = 0;
    
    for (const record of excelData) {
      try {
        const parsedDate = parseDate(record.drawDate);
        
        // Check if exists
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
          // Insert new record
          const newId = new ObjectId();
          const documentData = {
            _id: newId,
            gameType: '539',
            drawDate: parsedDate,
            numbers: record.numbers,
            source: 'excel_sync',
            metadata: {
              syncedAt: new Date(),
              originalIndex: record.id
            },
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          await collection.insertOne(documentData);
          synced++;
          console.log(`[SYNC] Synced record for ${record.drawDate}`);
        } else {
          skipped++;
        }
      } catch (err) {
        failed++;
        console.error(`[SYNC] Failed to sync record:`, err.message);
      }
    }
    
    return {
      success: true,
      message: `Sync completed: ${synced} added, ${skipped} skipped, ${failed} failed`,
      stats: { synced, skipped, failed, total: excelData.length }
    };
    
  } catch (error) {
    console.error('[SYNC ALL] Error:', error);
    return { success: false, message: error.message };
  }
}

// GET /api/admin/historical-results/539
router.get('/historical-results/539', async (req, res) => {
  try {
    console.log('[GET] Loading results...');
    let results = [];
    let source = 'none';
    
    // Try MongoDB first
    if (isMongoDBAvailable()) {
      try {
        const collection = mongoose.connection.db.collection('lottery_results');
        const mongoResults = await collection.find({ gameType: '539' })
          .sort({ drawDate: -1 })
          .toArray();
        
        if (mongoResults && mongoResults.length > 0) {
          results = mongoResults.map((result, index) => ({
            _id: result._id ? result._id.toString() : undefined,
            id: index,
            drawDate: formatDateString(result.drawDate),
            numbers: result.numbers || []
          }));
          source = 'mongodb';
          console.log(`[INFO] Loaded ${results.length} from MongoDB`);
        }
      } catch (dbError) {
        console.log('[WARNING] MongoDB query failed:', dbError.message);
      }
    }
    
    // Fallback to Excel
    if (results.length === 0) {
      results = readExcelFile();
      source = results.length > 0 ? 'excel' : 'none';
      console.log(`[INFO] Using Excel data (${results.length} results)`);
    }
    
    res.json({
      success: true,
      results: results,
      total: results.length,
      source: source
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

// POST /api/admin/historical-results/539/add - HYBRID APPROACH
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
    const formattedDate = formatDateString(parseDate(drawDate));
    
    // STEP 1: Always save to Excel first (this works reliably)
    console.log('[INFO] Saving to Excel first...');
    
    const currentData = readExcelFile();
    
    // Check for existing in Excel
    const exists = currentData.some(row => 
      formatDateString(row.drawDate) === formattedDate
    );
    
    if (exists) {
      return res.status(400).json({
        success: false,
        error: `Result for ${formattedDate} already exists`
      });
    }
    
    // Add new result to Excel
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
        error: 'Failed to save data'
      });
    }
    
    console.log('[SUCCESS] Saved to Excel');
    
    // STEP 2: Try to sync to MongoDB in the background (non-blocking)
    let mongoId = null;
    
    if (isMongoDBAvailable()) {
      console.log('[INFO] Attempting background sync to MongoDB...');
      
      // Don't await - let it happen in background
      syncRecordToMongoDB(newResult).then(id => {
        if (id) {
          console.log('[BACKGROUND] Successfully synced to MongoDB:', id);
        } else {
          console.log('[BACKGROUND] MongoDB sync failed, but data is safe in Excel');
        }
      }).catch(err => {
        console.error('[BACKGROUND] MongoDB sync error:', err.message);
      });
    }
    
    // Return success immediately (Excel save was successful)
    res.json({
      success: true,
      message: 'Result added successfully (saved to Excel, syncing to cloud)',
      result: {
        _id: mongoId,
        id: 0,
        drawDate: formattedDate,
        numbers: sortedNumbers
      },
      results: currentData,
      total: currentData.length
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
    
    const result = await syncAllToMongoDB();
    
    res.json(result);
    
  } catch (error) {
    console.error('[ERROR] Sync failed:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Sync failed',
      message: error.message
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
    if (isMongoDBAvailable()) {
      try {
        const collection = mongoose.connection.db.collection('lottery_results');
        
        // Try to delete from MongoDB
        if (id.match(/^[0-9a-fA-F]{24}$/)) {
          const deleteResult = await collection.deleteOne({ _id: new ObjectId(id) });
          if (deleteResult.deletedCount > 0) {
            deleted = true;
            console.log('[INFO] Deleted from MongoDB');
          }
        }
        
        // Get updated results from MongoDB
        if (deleted) {
          const mongoResults = await collection.find({ gameType: '539' })
            .sort({ drawDate: -1 })
            .toArray();
          
          allResults = mongoResults.map((result, index) => ({
            _id: result._id.toString(),
            id: index,
            drawDate: formatDateString(result.drawDate),
            numbers: result.numbers
          }));
          
          // Update Excel to match MongoDB
          writeExcelFile(allResults);
        }
      } catch (dbError) {
        console.log('[WARNING] MongoDB delete failed:', dbError.message);
      }
    }

    // If not deleted from MongoDB, try Excel
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
          error: 'Failed to delete'
        });
      }

      allResults = currentData;
      deleted = true;
    }

    if (deleted) {
      res.json({
        success: true,
        message: 'Result deleted successfully',
        results: allResults,
        total: allResults.length
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Result not found'
      });
    }
    
  } catch (error) {
    console.error('[ERROR] Delete failed:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Delete failed'
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
      syncNeeded: mongoConnected && (excelCount > mongoCount),
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

module.exports = router;