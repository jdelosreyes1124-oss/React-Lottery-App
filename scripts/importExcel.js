require('dotenv').config();
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const db = require('../models_mongoose');

async function importFromExcel() {
  try {
    await db.connectDB();
    console.log('Connected to MongoDB Atlas');
    
    const excelFiles = {
      '539': path.join(__dirname, '../data/539PAST2025RESULT.xlsx'),
      'mark6': path.join(__dirname, '../data/MARK6PAST2025RESULT.xlsx'),
      'lotto649': path.join(__dirname, '../data/LOTTO649PAST2025RESULT.xlsx')
    };
    
    let totalImported = 0;
    
    for (const [gameType, filePath] of Object.entries(excelFiles)) {
      if (!fs.existsSync(filePath)) {
        console.log(`❌ File not found: ${filePath}`);
        continue;
      }
      
      console.log(`\n📂 Reading ${gameType} from ${path.basename(filePath)}`);
      
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      
      console.log(`   Found ${jsonData.length} rows`);
      
      let imported = 0;
      let skipped = 0;
      
      // Get highest ID
      const lastResult = await db.LotteryResult.findOne().sort({ _id: -1 });
      let nextId = lastResult ? lastResult._id + 1 : 1;
      
      for (const row of jsonData) {
        try {
          // Extract numbers from various column formats
          const numbers = [];
          for (let i = 1; i <= 8; i++) {
            const value = row[`Number ${i}`] || row[`Number${i}`] || row[`Num ${i}`] || row[`Num${i}`];
            if (value !== undefined && value !== null && !isNaN(value)) {
              numbers.push(parseInt(value));
            }
          }
          
          // Get date
          let drawDate = row.Date || row.date || row.DATE || row['Draw Date'];
          if (typeof drawDate === 'number') {
            // Excel serial date
            const d = new Date((drawDate - 25569) * 86400 * 1000);
            drawDate = d.toISOString().split('T')[0];
          }
          
          // Get bonus
          const bonus = row.Bonus || row.bonus || row.BONUS || null;
          
          if (!drawDate || numbers.length === 0) {
            skipped++;
            continue;
          }
          
          // Check if already exists
          const existing = await db.LotteryResult.findOne({
            gameType,
            drawDate
          });
          
          if (existing) {
            skipped++;
            continue;
          }
          
          // Create new result
          const result = new db.LotteryResult({
            _id: nextId++,
            gameType,
            drawDate,
            numbers: numbers.slice(0, gameType === '539' ? 5 : 6),
            bonus: gameType !== '539' ? bonus : null,
            source: 'excel_import'
          });
          
          await result.save();
          imported++;
          
        } catch (err) {
          console.error(`Error processing row:`, err.message);
        }
      }
      
      console.log(`   ✅ Imported: ${imported}, Skipped: ${skipped}`);
      totalImported += imported;
    }
    
    console.log(`\n✅ Total imported: ${totalImported}`);
    
    // Verify
    const count = await db.LotteryResult.countDocuments();
    console.log(`📊 Total results in MongoDB: ${count}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

importFromExcel();