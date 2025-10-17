const express = require('express');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

console.log('📁 Historical Results routes loaded!');

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

    return jsonData.map((row, index) => ({
      id: index,
      drawDate: excelDateToJSDate(row['Date'] || row['date'] || ''),
      numbers: [
        row['Number1'] || row['Number 1'] || row['number1'] || row['number 1'],
        row['Number2'] || row['Number 2'] || row['number2'] || row['number 2'],
        row['Number3'] || row['Number 3'] || row['number3'] || row['number 3'],
        row['Number4'] || row['Number 4'] || row['number4'] || row['number 4'],
        row['Number5'] || row['Number 5'] || row['number5'] || row['number 5']
      ].filter(n => n !== undefined && n !== null && n !== '')
    })).filter(row => row.numbers.length === 5);

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
    const results = readExcelFile();
    
    res.json({
      success: true,
      results: results
    });
  } catch (error) {
    console.error('Error loading results:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/admin/historical-results/539/add n
router.post('/historical-results/539/add', (req, res) => {
  try {
    const { drawDate, numbers } = req.body;

    if (!drawDate || !numbers || numbers.length !== 5) {
      return res.status(400).json({
        success: false,
        error: 'Invalid data. Need drawDate and 5 numbers'
      });
    }

    if (numbers.some(n => n < 1 || n > 39)) {
      return res.status(400).json({
        success: false,
        error: 'All numbers must be between 1 and 39'
      });
    }

    if (new Set(numbers).size !== 5) {
      return res.status(400).json({
        success: false,
        error: 'Numbers must be unique'
      });
    }

    const currentData = readExcelFile();

    const newResult = {
      id: currentData.length,
      drawDate,
      numbers
    };

    currentData.unshift(newResult);

    if (writeExcelFile(currentData)) {
      console.log(`✅ Added result: ${drawDate} - ${numbers.join(', ')}`);
      
      res.json({
        success: true,
        message: 'Result added successfully',
        result: newResult
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to write to Excel file'
      });
    }
  } catch (error) {
    console.error('Error adding result:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
 
// DELETE /api/admin/historical-results/539/:id 
router.delete('/historical-results/539/:id', (req, res) => {
  try {
    const { id } = req.params;
    const resultId = parseInt(id);

    const currentData = readExcelFile();
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

    if (writeExcelFile(currentData)) {
      console.log(`✅ Deleted result ID: ${resultId}`);
      
      res.json({
        success: true,
        message: 'Result deleted successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to write to Excel file'
      });
    }
  } catch (error) {
    console.error('Error deleting result:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/admin/historical-results/539/sync 
router.post('/historical-results/539/sync', (req, res) => {
  try {
    const results = readExcelFile();
    
    console.log(`✅ Synced from Excel: ${results.length} results loaded`);
    
    res.json({
      success: true,
      message: `Synced ${results.length} results from Excel`,
      results: results
    });
  } catch (error) {
    console.error('Error syncing from Excel:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;