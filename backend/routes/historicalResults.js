const express = require('express');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

console.log('🔍 Historical Results routes loaded!');

const router = express.Router();

// Test route
router.get('/test', (req, res) => {
  res.json({ success: true, message: 'Historical routes working!' });
});

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
    
    return `${year}-${month}-${day}`;
  }
  
  return serial;
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
      // Try different column name variations
      const dateValue = row['Date'] || row['date'] || row['DATE'] || '';
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
    console.log('✅ Excel file updated:', EXCEL_539_PATH);
    
    return true;
  } catch (error) {
    console.error('Error writing Excel file:', error);
    return false;
  }
}

// GET /api/admin/historical-results/539
router.get('/historical-results/539', (req, res) => {
  try {
    console.log('📊 Loading 539 historical results...');
    const results = readExcelFile();
    
    console.log(`✅ Loaded ${results.length} results from Excel`);
    
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
router.post('/historical-results/539/add', (req, res) => {
  try {
    console.log('📝 Adding new result:', req.body);
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

    // Read current data
    const currentData = readExcelFile();

    // Check if date already exists
    const dateExists = currentData.some(row => row.drawDate === drawDate);
    if (dateExists) {
      return res.status(400).json({
        success: false,
        error: 'A result for this date already exists'
      });
    }

    // Create new result
    const newResult = {
      id: currentData.length,
      drawDate,
      numbers: parsedNumbers.sort((a, b) => a - b) // Sort numbers
    };

    // Add to beginning of array (most recent first)
    currentData.unshift(newResult);

    // Re-index all results
    currentData.forEach((row, idx) => {
      row.id = idx;
    });

    // Write to Excel
    if (writeExcelFile(currentData)) {
      console.log(`✅ Added result: ${drawDate} - ${parsedNumbers.join(', ')}`);
      
      // Return the updated list of results
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
router.put('/historical-results/539/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { drawDate, numbers } = req.body;
    const resultId = parseInt(id);

    console.log(`📝 Updating result ID ${resultId}:`, req.body);

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

    const currentData = readExcelFile();
    const index = currentData.findIndex(r => r.id === resultId);
    
    if (index === -1) {
      return res.status(404).json({
        success: false,
        error: 'Result not found'
      });
    }

    // Update the result
    currentData[index] = {
      id: resultId,
      drawDate,
      numbers: parsedNumbers.sort((a, b) => a - b)
    };

    if (writeExcelFile(currentData)) {
      console.log(`✅ Updated result ID: ${resultId}`);
      
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
router.delete('/historical-results/539/:id', (req, res) => {
  try {
    const { id } = req.params;
    const resultId = parseInt(id);

    console.log(`🗑️ Deleting result ID ${resultId}`);

    const currentData = readExcelFile();
    const index = currentData.findIndex(r => r.id === resultId);
    
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
      console.log(`✅ Deleted result ID: ${resultId}`);
      
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
router.post('/historical-results/539/sync', (req, res) => {
  try {
    console.log('🔄 Syncing from Excel file...');
    const results = readExcelFile();
    
    console.log(`✅ Synced from Excel: ${results.length} results loaded`);
    
    res.json({
      success: true,
      message: `Synced ${results.length} results from Excel`,
      results: results,
      total: results.length
    });
  } catch (error) {
    console.error('Error syncing from Excel:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;