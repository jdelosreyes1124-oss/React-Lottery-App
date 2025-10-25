const express = require('express');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

console.log('[INFO] Historical Results routes loaded!');

const router = express.Router();

// Import the LotteryResult model if it exists
let LotteryResult;
try {
  LotteryResult = mongoose.model('LotteryResult');
} catch (error) {
  // Model doesn't exist yet, we'll define it when needed
  LotteryResult = null;
}

// Test route
router.get('/test', (req, res) => {
  res.json({ success: true, message: 'Historical routes working!' });
});

// Path to the 539 Excel file 
const EXCEL_539_PATH = path.join(__dirname, '../data/539PAST2025RESULT.xlsx');

// Helper: Generate unique numeric ID for MongoDB _id field
let lastGeneratedId = Date.now();
function generateNumericId() {
  // Generate a unique numeric ID based on timestamp
  // This ensures uniqueness even for rapid successive calls
  lastGeneratedId++;
  return lastGeneratedId;
}

// Helper: Convert Excel serial date to formatted date string
function excelDateToJSDate(serial) {
  if (typeof serial === 'string') {
    // If it's already a string date, parse it
    if (serial.includes('-') || serial.includes('/')) {
      return serial;
    }
    return serial;
  }
  
  if (typeof serial === 'number') {
    const utc_days = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;
    const date_info = new Date(utc_value * 1000);
    
    const year = date_info.getFullYear();
    const month = String(date_info.getMonth() + 1).padStart(2, '0');
    const day = String(date_info.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  }
  
  return serial;
}

// Helper: Parse date string to Date object
function parseDate(dateString) {
  if (!dateString) return new Date();
  
  // Handle various date formats
  if (dateString.includes('/')) {
    const parts = dateString.split('/');
    if (parts.length === 3) {
      // Assume MM/DD/YYYY format
      return new Date(parts[2], parts[0] - 1, parts[1]);
    }
  } else if (dateString.includes('-')) {
    // Assume YYYY-MM-DD format
    return new Date(dateString);
  }
  
  return new Date(dateString);
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
        ['Date', 'Number 1', 'Number 2', 'Number 3', 'Number 4', 'Number 5', 'ID']
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
      // Try different column name variations
      const dateValue = row['Date'] || row['date'] || row['DATE'] || '';
      const idValue = row['ID'] || row['_id'] || row['id'];
      const numbers = [];
      
      // Try different naming patterns for numbers
      for (let i = 1; i <= 5; i++) {
        const num = row[`Number ${i}`] || row[`Number${i}`] || 
                   row[`number ${i}`] || row[`number${i}`] || 
                   row[`Num${i}`] || row[`num${i}`] || 
                   row[i.toString()];
        if (num !== undefined && num !== null && num !== '') {
          numbers.push(parseInt(num));
        }
      }
      
      // Only return rows with valid data
      if (numbers.length === 5 && numbers.every(n => !isNaN(n))) {
        const numericId = idValue ? parseInt(idValue) : generateNumericId();
        return {
          _id: numericId,  // Numeric _id for MongoDB compatibility
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
      'Number 5': row.numbers[4],
      'ID': row._id || row.id
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

// GET /api/admin/historical-results/539
router.get('/historical-results/539', async (req, res) => {
  try {
    console.log('[INFO] Loading 539 historical results...');
    
    // Try to load from MongoDB first if available
    if (mongoose.connection.readyState === 1 && LotteryResult) {
      try {
        const mongoResults = await LotteryResult.find({ gameType: '539' })
          .sort({ drawDate: -1 })
          .lean();
        
        if (mongoResults && mongoResults.length > 0) {
          console.log(`[SUCCESS] Loaded ${mongoResults.length} results from MongoDB`);
          
          // Format results to match expected structure
          const formattedResults = mongoResults.map((result, index) => ({
            _id: result._id,
            id: index,
            drawDate: result.drawDate instanceof Date 
              ? result.drawDate.toISOString().split('T')[0]
              : result.drawDate,
            numbers: result.numbers
          }));
          
          return res.json({
            success: true,
            results: formattedResults,
            total: formattedResults.length
          });
        }
      } catch (mongoError) {
        console.log('[WARNING] MongoDB read failed, falling back to Excel:', mongoError.message);
      }
    }
    
    // Fallback to Excel file
    const results = readExcelFile();
    console.log(`[SUCCESS] Loaded ${results.length} results from Excel`);
    
    res.json({
      success: true,
      results: results,
      total: results.length
    });
  } catch (error) {
    console.error('Error loading results:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// POST /api/admin/historical-results/539/add
router.post('/historical-results/539/add', async (req, res) => {
  try {
    console.log('[INFO] Adding new result:', req.body);
    const { drawDate, numbers } = req.body;

    // Validate input
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

    // Ensure numbers are integers
    const parsedNumbers = numbers.map(n => parseInt(n));

    // Validate number range
    if (parsedNumbers.some(n => isNaN(n) || n < 1 || n > 39)) {
      return res.status(400).json({
        success: false,
        error: 'All numbers must be between 1 and 39'
      });
    }

    // Check for duplicates
    if (new Set(parsedNumbers).size !== 5) {
      return res.status(400).json({
        success: false,
        error: 'Numbers must be unique'
      });
    }

    // Generate numeric ID for MongoDB
    const newId = generateNumericId();
    
    // Create new result with proper _id
    const newResult = {
      _id: newId,  // Numeric _id for MongoDB
      id: 0,  // Will be updated when adding to array
      drawDate,
      numbers: parsedNumbers.sort((a, b) => a - b) // Sort numbers
    };

    // Save to MongoDB if available
    if (mongoose.connection.readyState === 1) {
      try {
        // Ensure model exists
        if (!LotteryResult) {
          const lotteryResultSchema = new mongoose.Schema({
            _id: Number,
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
          
          LotteryResult = mongoose.model('LotteryResult', lotteryResultSchema, 'lottery_results');
        }

        // Check if date already exists in MongoDB
        const existingResult = await LotteryResult.findOne({ 
          gameType: '539', 
          drawDate: parseDate(drawDate) 
        });
        
        if (existingResult) {
          return res.status(400).json({
            success: false,
            error: 'A result for this date already exists'
          });
        }

        // Create MongoDB document
        const mongoDoc = new LotteryResult({
          _id: newId,
          gameType: '539',
          drawDate: parseDate(drawDate),
          numbers: parsedNumbers.sort((a, b) => a - b),
          source: 'manual'
        });
        
        await mongoDoc.save();
        console.log('[SUCCESS] Saved to MongoDB with _id:', newId);
        
        // Get all results from MongoDB to return
        const allResults = await LotteryResult.find({ gameType: '539' })
          .sort({ drawDate: -1 })
          .lean();
        
        const formattedResults = allResults.map((result, index) => ({
          _id: result._id,
          id: index,
          drawDate: result.drawDate instanceof Date 
            ? result.drawDate.toISOString().split('T')[0]
            : result.drawDate,
          numbers: result.numbers
        }));
        
        // Also save to Excel for backup
        writeExcelFile(formattedResults);
        
        return res.json({
          success: true,
          message: 'Result added successfully',
          result: newResult,
          results: formattedResults,
          total: formattedResults.length
        });
        
      } catch (mongoError) {
        console.error('[ERROR] MongoDB save failed:', mongoError);
        // Continue to Excel fallback
      }
    }

    // Fallback: Read current data from Excel
    const currentData = readExcelFile();

    // Check if date already exists
    const dateExists = currentData.some(row => row.drawDate === drawDate);
    if (dateExists) {
      return res.status(400).json({
        success: false,
        error: 'A result for this date already exists'
      });
    }

    // Add to beginning of array (most recent first)
    currentData.unshift(newResult);

    // Re-index all results
    currentData.forEach((row, idx) => {
      row.id = idx;
    });

    // Write to Excel
    if (writeExcelFile(currentData)) {
      console.log(`[SUCCESS] Added result to Excel: ${drawDate} - ${parsedNumbers.join(', ')}`);
      
      res.json({
        success: true,
        message: 'Result added successfully',
        result: newResult,
        results: currentData,
        total: currentData.length
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to write to Excel file'
      });
    }
  } catch (error) {
    console.error('Error adding result:', error);
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
    const resultId = parseInt(id);

    console.log(`[INFO] Updating result ID ${resultId}:`, req.body);

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

    // Try MongoDB first
    if (mongoose.connection.readyState === 1 && LotteryResult) {
      try {
        const updatedDoc = await LotteryResult.findOneAndUpdate(
          { _id: resultId, gameType: '539' },
          {
            drawDate: parseDate(drawDate),
            numbers: parsedNumbers.sort((a, b) => a - b)
          },
          { new: true }
        );
        
        if (updatedDoc) {
          console.log('[SUCCESS] Updated in MongoDB');
          
          // Get all results
          const allResults = await LotteryResult.find({ gameType: '539' })
            .sort({ drawDate: -1 })
            .lean();
          
          const formattedResults = allResults.map((result, index) => ({
            _id: result._id,
            id: index,
            drawDate: result.drawDate instanceof Date 
              ? result.drawDate.toISOString().split('T')[0]
              : result.drawDate,
            numbers: result.numbers
          }));
          
          // Update Excel backup
          writeExcelFile(formattedResults);
          
          return res.json({
            success: true,
            message: 'Result updated successfully',
            result: formattedResults.find(r => r._id === resultId),
            results: formattedResults,
            total: formattedResults.length
          });
        }
      } catch (mongoError) {
        console.log('[WARNING] MongoDB update failed:', mongoError.message);
      }
    }

    // Fallback to Excel
    const currentData = readExcelFile();
    const index = currentData.findIndex(r => r.id === resultId || r._id === resultId);
    
    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: 'Result not found'
      });
    }

    // Update the result
    currentData[index] = {
      ...currentData[index],
      drawDate,
      numbers: parsedNumbers.sort((a, b) => a - b)
    };

    if (writeExcelFile(currentData)) {
      console.log(`[SUCCESS] Updated result ID: ${resultId}`);
      
      res.json({
        success: true,
        message: 'Result updated successfully',
        result: currentData[index],
        results: currentData,
        total: currentData.length
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to write to Excel file'
      });
    }
  } catch (error) {
    console.error('Error updating result:', error);
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
    const resultId = parseInt(id);

    console.log(`[INFO] Deleting result ID ${resultId}`);

    // Try MongoDB first
    if (mongoose.connection.readyState === 1 && LotteryResult) {
      try {
        const deleted = await LotteryResult.findOneAndDelete({ 
          _id: resultId, 
          gameType: '539' 
        });
        
        if (deleted) {
          console.log('[SUCCESS] Deleted from MongoDB');
          
          // Get remaining results
          const allResults = await LotteryResult.find({ gameType: '539' })
            .sort({ drawDate: -1 })
            .lean();
          
          const formattedResults = allResults.map((result, index) => ({
            _id: result._id,
            id: index,
            drawDate: result.drawDate instanceof Date 
              ? result.drawDate.toISOString().split('T')[0]
              : result.drawDate,
            numbers: result.numbers
          }));
          
          // Update Excel backup
          writeExcelFile(formattedResults);
          
          return res.json({
            success: true,
            message: 'Result deleted successfully',
            results: formattedResults,
            total: formattedResults.length
          });
        }
      } catch (mongoError) {
        console.log('[WARNING] MongoDB delete failed:', mongoError.message);
      }
    }

    // Fallback to Excel
    const currentData = readExcelFile();
    const index = currentData.findIndex(r => r.id === resultId || r._id === resultId);
    
    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: 'Result not found'
      });
    }

    // Remove the result
    currentData.splice(index, 1);

    // Re-index remaining results
    currentData.forEach((row, idx) => {
      row.id = idx;
    });

    if (writeExcelFile(currentData)) {
      console.log(`[SUCCESS] Deleted result ID: ${resultId}`);
      
      res.json({
        success: true,
        message: 'Result deleted successfully',
        results: currentData,
        total: currentData.length
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to write to Excel file'
      });
    }
  } catch (error) {
    console.error('Error deleting result:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// POST /api/admin/historical-results/539/sync
router.post('/historical-results/539/sync', async (req, res) => {
  try {
    console.log('[INFO] Syncing from Excel file...');
    const excelResults = readExcelFile();
    
    // Sync with MongoDB if connected
    if (mongoose.connection.readyState === 1 && LotteryResult) {
      try {
        // Clear existing MongoDB data for 539
        await LotteryResult.deleteMany({ gameType: '539' });
        
        // Insert all results from Excel
        const mongoDocuments = excelResults.map(r => ({
          _id: r._id || generateNumericId(),
          gameType: '539',
          drawDate: parseDate(r.drawDate),
          numbers: r.numbers,
          source: 'manual'
        }));
        
        if (mongoDocuments.length > 0) {
          await LotteryResult.insertMany(mongoDocuments, { ordered: false });
          console.log(`[SUCCESS] Synced ${mongoDocuments.length} results to MongoDB`);
        }
        
        // Get fresh data from MongoDB
        const syncedResults = await LotteryResult.find({ gameType: '539' })
          .sort({ drawDate: -1 })
          .lean();
        
        const formattedResults = syncedResults.map((result, index) => ({
          _id: result._id,
          id: index,
          drawDate: result.drawDate instanceof Date 
            ? result.drawDate.toISOString().split('T')[0]
            : result.drawDate,
          numbers: result.numbers
        }));
        
        return res.json({
          success: true,
          message: `Synced ${formattedResults.length} results`,
          results: formattedResults,
          total: formattedResults.length
        });
        
      } catch (mongoError) {
        console.error('[WARNING] MongoDB sync failed:', mongoError.message);
      }
    }
    
    // Return Excel results if MongoDB not available
    console.log(`[SUCCESS] Loaded from Excel: ${excelResults.length} results`);
    
    res.json({
      success: true,
      message: `Synced ${excelResults.length} results from Excel`,
      results: excelResults,
      total: excelResults.length
    });
  } catch (error) {
    console.error('Error syncing:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;