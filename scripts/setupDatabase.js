require('dotenv').config();
const db = require('../models');
const bcrypt = require('bcryptjs');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function setupDatabase() {
  try {
    console.log('=====================================');
    console.log('🔧 DATABASE SETUP SCRIPT');
    console.log('=====================================');
    console.log('Database:', process.env.DB_NAME);
    console.log('Host:', process.env.DB_HOST);
    console.log('Port:', process.env.DB_PORT);
    console.log('=====================================\n');
    
    // Test connection 
    console.log('🔄 Testing database connection...');
    await db.sequelize.authenticate();
    console.log('✅ Database connection successful\n');
    
    // Ask for confirmation before creating tables 
    const createTables = await question('Do you want to create/update database tables? (yes/no): ');
    
    if (createTables.toLowerCase() === 'yes') {
      console.log('🔄 Creating database tables...');
      
      // Use force: false to avoid dropping existing tables 
      // Use alter: true to update existing tables with new columns
      await db.sequelize.sync({ alter: true });
      
      console.log('✅ Database tables created/updated\n');
    }
    
    // Create default admin user
    const createAdmin = await question('Do you want to create a default admin user? (yes/no): ');
    
    if (createAdmin.toLowerCase() === 'yes') {
      const username = await question('Admin username (default: admin): ') || 'admin';
      const password = await question('Admin password (default: admin123): ') || 'admin123';
      const email = await question('Admin email (optional): ') || null;
      
      console.log('\n🔄 Creating admin user...');
      
      const [admin, created] = await db.User.findOrCreate({
        where: { username },
        defaults: {
          username,
          password, // Will be hashed automatically by the model hook 
          email,
          role: 'admin',
          is_active: true
        }
      });
      
      if (created) {
        console.log(`✅ Admin user created successfully`);
        console.log(`   Username: ${username}`);
        console.log(`   Password: ${password}`);
        console.log(`   Role: admin`);
      } else {
        console.log('ℹ️  Admin user already exists');
        
        const updatePassword = await question('Do you want to update the password? (yes/no): ');
        if (updatePassword.toLowerCase() === 'yes') {
          await admin.update({ password });
          console.log('✅ Password updated');
        }
      }
    }
    
    // Import Excel data if requested
    const importData = await question('\nDo you want to import existing Excel data? (yes/no): ');
    
    if (importData.toLowerCase() === 'yes') {
      console.log('\n🔄 Importing Excel data...');
      await importExcelData();
    }
    
    // Display summary 
    console.log('\n=====================================');
    console.log('📊 DATABASE SETUP SUMMARY');
    console.log('=====================================');
    
    const stats = await getDbStats();
    console.log(`Users: ${stats.users}`);
    console.log(`Lottery Results:`);
    console.log(`  - 539: ${stats.results539}`);
    console.log(`  - Mark6: ${stats.resultsMark6}`);
    console.log(`  - Lotto649: ${stats.resultsLotto649}`);
    console.log(`Total Predictions: ${stats.predictions}`);
    console.log(`Admin Logs: ${stats.logs}`);
    console.log('=====================================');
    
    console.log('\n✅ Database setup complete!');
    console.log('You can now start the server with: npm start\n');
    
    rl.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Database setup failed:', error);
    rl.close();
    process.exit(1);
  }
}

async function importExcelData() {
  const XLSX = require('xlsx');
  const fs = require('fs');
  const path = require('path');
  
  const dataDir = path.join(__dirname, '../data');
  
  if (!fs.existsSync(dataDir)) {
    console.log('   ⚠️  Data directory not found');
    return;
  }
  
  const files = {
    '539': ['539PAST2025RESULT.xlsx', '539.xlsx'],
    'mark6': ['MARK6PAST2025RESULT.xlsx', 'mark6.xlsx'],
    'lotto649': ['LOTTO649PAST2025RESULT.xlsx', 'lotto649.xlsx']
  };
  
  for (const [gameType, filenames] of Object.entries(files)) {
    let filepath = null;
    
    // Try to find the file 
    for (const filename of filenames) {
      const testPath = path.join(dataDir, filename);
      if (fs.existsSync(testPath)) {
        filepath = testPath;
        break;
      }
    }
    
    if (!filepath) {
      console.log(`   ⚠️  No Excel file found for ${gameType}`);
      continue;
    }
    
    console.log(`   📂 Processing ${path.basename(filepath)}...`);
    
    try {
      const workbook = XLSX.readFile(filepath);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(worksheet);
      
      let imported = 0;
      let skipped = 0;
      
      for (const row of data) {
        try {
          // Extract numbers from various column formats
          const numbers = [];
          for (let i = 1; i <= 8; i++) {
            const value = row[`Number ${i}`] || 
                         row[`Number${i}`] || 
                         row[`Num ${i}`] || 
                         row[`Num${i}`];
            if (value !== undefined && value !== null) {
              numbers.push(parseInt(value));
            }
          }
          
          // Skip if no numbers found 
          if (numbers.length === 0) continue;
          
          // Get draw date
          let drawDate = row.Date || row.date || row.DATE || row['Draw Date'];
          if (typeof drawDate === 'number') {
            // Excel serial date 
            const d = new Date((drawDate - 25569) * 86400 * 1000);
            drawDate = d.toISOString().split('T')[0];
          } else if (drawDate) {
            drawDate = new Date(drawDate).toISOString().split('T')[0];
          } else {
            continue;
          }
          
          // Create or update record
          const [result, created] = await db.LotteryResult.findOrCreate({
            where: {
              game_type: gameType,
              draw_date: drawDate
            },
            defaults: {
              game_type: gameType,
              draw_date: drawDate,
              numbers: numbers.slice(0, gameType === '539' ? 5 : 6),
              bonus: gameType !== '539' ? (row.Bonus || row.bonus || null) : null,
              source: 'excel_import'
            }
          });
          
          if (created) {
            imported++;
          } else {
            skipped++;
          }
        } catch (err) {
          // Skip invalid rows
        }
      }
      
      console.log(`   ✅ ${gameType}: ${imported} imported, ${skipped} skipped`);
    } catch (err) {
      console.log(`   ❌ Error processing ${gameType}: ${err.message}`);
    }
  }
}

async function getDbStats() {
  try {
    const [users, results539, resultsMark6, resultsLotto649, predictions, logs] = await Promise.all([
      db.User.count(),
      db.LotteryResult.count({ where: { game_type: '539' } }),
      db.LotteryResult.count({ where: { game_type: 'mark6' } }),
      db.LotteryResult.count({ where: { game_type: 'lotto649' } }),
      db.Prediction.count(),
      db.AdminLog.count()
    ]);
    
    return { users, results539, resultsMark6, resultsLotto649, predictions, logs };
  } catch (error) {
    return { users: 0, results539: 0, resultsMark6: 0, resultsLotto649: 0, predictions: 0, logs: 0 };
  }
}

// Run setup
setupDatabase();