/**
 * Scheduled Scraper Service - MongoDB Version
 * This version skips all existing dates to avoid ID type conflicts
 * services/scheduledScraper.js
 */

const cron = require('node-cron');
const db = require('../models_mongoose');
const dbService = require('./databaseService');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Scraper imports
const scraper539 = require('./scraper539');
const scraperMark6 = require('./scraperMark6');
const scraperLotto649 = require('./scraperLotto649');

console.log('✅ Scrapers loaded:', {
    '539': !!scraper539?.scrapeLatestResults,
    'mark6': !!scraperMark6?.scrapeLatestResults,
    'lotto649': !!scraperLotto649?.scrapeLatestResults
});

// Backup configuration (now exports from MongoDB to Excel)
const BACKUP_DIR = path.join(__dirname, '../backups');
const BACKUP_CONFIG = {
  maxBackups: 5,
  autoCleanup: true,
  enabled: true
};

// Scheduler state
const schedulerState = {
  '539': {
    enabled: false,
    lastRun: null,
    nextRun: null,
    status: 'stopped',
    schedule: '0 */6 * * *',
    lastRun: null,
    nextRun: null,
    task: null,
    status: 'stopped',
    lastResult: null
  },
  'mark6': {
    enabled: false,
    schedule: '0 */6 * * *',
    lastRun: null,
    nextRun: null,
    task: null,
    status: 'stopped',
    lastResult: null
  },
  'lotto649': {
    enabled: false,
    schedule: '0 */6 * * *',
    lastRun: null,
    nextRun: null,
    task: null,
    status: 'stopped',
    lastResult: null
  }
};

// Helper functions
function normalizeDate(date) {
  if (!date) return null;
  
  try {
    let dateObj;
    
    // Handle different input types
    if (date instanceof Date) {
      dateObj = date;
    } else if (typeof date === 'string') {
      // Remove any time component if present
      const dateOnly = date.split('T')[0];
      // Handle both YYYY-MM-DD and YYYY/MM/DD formats
      const normalized = dateOnly.replace(/\//g, '-');
      // Create date at noon UTC to avoid timezone issues
      dateObj = new Date(normalized + 'T12:00:00Z');
    } else {
      return null;
    }
    
    // Check if valid date
    if (isNaN(dateObj.getTime())) return null;
    
    // Return YYYY-MM-DD format
    const year = dateObj.getUTCFullYear();
    const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getUTCDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  } catch (e) {
    console.error('Error normalizing date:', date, e.message);
    return null;
  }
}

function getScraper(gameType) {
  if (gameType === 'mark6') return scraperMark6;
  if (gameType === 'lotto649') return scraperLotto649;
  return scraper539;
}

/**
 * Create Excel backup from MongoDB data
 */
async function createBackup(gameType) {
  try {
    if (!BACKUP_CONFIG.enabled) return null;
    
    // Ensure backup directory exists
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    
    // Get data from MongoDB
    const results = await db.LotteryResult
      .find({ gameType })
      .sort({ drawDate: -1 })
      .limit(10000)
      .lean();
    
    if (results.length === 0) {
      console.log(`📭 No data to backup for ${gameType}`);
      return null;
    }
    
    // Convert to Excel format
    const excelData = results.map(r => {
      const row = { Date: normalizeDate(r.drawDate) || r.drawDate };
      r.numbers.forEach((num, idx) => {
        row[`Number ${idx + 1}`] = num;
      });
      if (r.bonus) row.Bonus = r.bonus;
      return row;
    });
    
    // Create workbook
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Results');
    
    // Save backup
    const backupFile = `${gameType}-backup-${Date.now()}.xlsx`;
    const backupPath = path.join(BACKUP_DIR, backupFile);
    XLSX.writeFile(workbook, backupPath);
    
    console.log(`💾 Backup created: ${backupFile}`);
    
    // Clean up old backups
    if (BACKUP_CONFIG.autoCleanup) {
      cleanupOldBackups(gameType);
    }
    
    return backupPath;
  } catch (error) {
    console.error(`❌ Backup failed for ${gameType}:`, error.message);
    return null;
  }
}

/**
 * Clean up old backup files
 */
function cleanupOldBackups(gameType) {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return { deleted: 0, kept: 0 };
    
    const backupPattern = new RegExp(`^${gameType}-backup-\\d+\\.xlsx$`);
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(file => backupPattern.test(file))
      .map(file => ({
        name: file,
        path: path.join(BACKUP_DIR, file),
        timestamp: parseInt(file.match(/\d+/)[0])
      }))
      .sort((a, b) => b.timestamp - a.timestamp);
    
    const toKeep = files.slice(0, BACKUP_CONFIG.maxBackups);
    const toDelete = files.slice(BACKUP_CONFIG.maxBackups);
    
    let deletedCount = 0;
    toDelete.forEach(file => {
      try {
        fs.unlinkSync(file.path);
        console.log(`🗑️  Deleted old backup: ${file.name}`);
        deletedCount++;
      } catch (err) {
        console.error(`Failed to delete ${file.name}:`, err.message);
      }
    });
    
    return { deleted: deletedCount, kept: toKeep.length };
  } catch (error) {
    console.error(`Cleanup failed for ${gameType}:`, error.message);
    return { deleted: 0, kept: 0 };
  }
}

/**
 * Main scraping function - Skips all existing dates to avoid ID conflicts
 */
async function runScheduledScrape(gameType) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🤖 [Scheduled] Starting automatic scrape for ${gameType.toUpperCase()}`);
  console.log(`📅 Current time: ${new Date().toISOString()}`);
  console.log(`${'='.repeat(60)}\n`);
  
  const state = schedulerState[gameType];
  state.status = 'running';
  state.lastRun = new Date().toISOString();
  
  try {
    const scraper = getScraper(gameType);
    const maxResults = 50;
    
    // Step 1: Scrape results
    console.log(`📡 STEP 1: Scraping ${gameType.toUpperCase()} results...`);
    const scrapedResults = await scraper.scrapeResults(maxResults);
    
    console.log(`\n🔍 Scraped Results Summary:`);
    console.log(`   Total scraped: ${scrapedResults.length}`);
    
    if (scrapedResults.length === 0) {
      throw new Error('No results scraped from website');
    }
    
    // Show first and last scraped results
    if (scrapedResults.length > 0) {
      console.log(`   First result: ${scrapedResults[0].date} - [${scrapedResults[0].numbers.join(', ')}]`);
      console.log(`   Last result: ${scrapedResults[scrapedResults.length - 1].date} - [${scrapedResults[scrapedResults.length - 1].numbers.join(', ')}]`);
    }
    
    // Step 2: Validate scraped results
    const validation = scraper.validateResults(scrapedResults);
    console.log(`\n✅ Validation Results:`, validation);
    
    if (validation.valid === 0) {
      throw new Error('No valid results found after validation');
    }
    
    // Step 3: Get ALL existing dates from database (regardless of ID type)
    console.log(`\n📊 STEP 2: Checking database...`);
    const existingCount = await db.LotteryResult.countDocuments({ gameType });
    console.log(`   Current records in database: ${existingCount}`);
    
    // Get all existing dates for this game type
    const existingRecords = await db.LotteryResult
      .find({ gameType })
      .select('drawDate')
      .lean();
    
    // Create a Set of existing dates (normalized to YYYY-MM-DD format)
    const existingDates = new Set();
    existingRecords.forEach(record => {
      const normalizedDate = normalizeDate(record.drawDate);
      if (normalizedDate) {
        existingDates.add(normalizedDate);
      }
    });
    
    console.log(`   Found ${existingDates.size} unique dates in database`);
    
    // Step 4: Process ONLY NEW dates (skip all existing)
    console.log(`\n🔄 STEP 3: Processing scraped results...`);
    
    let addedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const expectedNumberCount = gameType === '539' ? 5 : 6;
    const newDates = [];
    
    for (let i = 0; i < scrapedResults.length; i++) {
      const result = scrapedResults[i];
      
      // Validate number count
      if (!result.numbers || result.numbers.length !== expectedNumberCount) {
        console.log(`   ⚠️ Invalid number count for result ${i + 1}`);
        errorCount++;
        continue;
      }
      
      // Normalize the scraped date
      const scrapedDateNorm = normalizeDate(result.date);
      
      if (!scrapedDateNorm) {
        console.log(`   ⚠️ Invalid date format: ${result.date}`);
        errorCount++;
        continue;
      }
      
      // SKIP if this date already exists in database
      if (existingDates.has(scrapedDateNorm)) {
        skippedCount++;
        // Only log first few skips to avoid spam
        if (skippedCount <= 3) {
          console.log(`   ⏭️ Skipping existing date: ${scrapedDateNorm}`);
        }
        continue;
      }
      
      // This is a NEW date - try to save it
      try {
        const dataToSave = {
          gameType: gameType,
          drawDate: scrapedDateNorm,
          numbers: result.numbers.sort((a, b) => a - b),
          bonus: result.bonus || null,
          source: 'web_scraper'
        };
        
        const savedResult = await dbService.addLotteryResult(dataToSave);
        
        if (savedResult) {
          console.log(`   ✅ Added NEW: ${scrapedDateNorm} - [${result.numbers.join(', ')}]`);
          addedCount++;
          newDates.push(scrapedDateNorm);
          // Add to existing dates set to prevent duplicates in same run
          existingDates.add(scrapedDateNorm);
        } else {
          console.log(`   ❌ Failed to save new date: ${scrapedDateNorm}`);
          errorCount++;
        }
        
      } catch (err) {
        // Only log actual save errors, not ID generation errors for existing dates
        if (!err.message.includes('Cast to Number failed')) {
          console.error(`   ❌ Error saving ${scrapedDateNorm}: ${err.message}`);
        }
        errorCount++;
      }
    }
    
    // Step 5: Create backup
    console.log(`\n💾 STEP 4: Creating backup...`);
    const backupPath = await createBackup(gameType);
    
    // Step 6: Record scheduler run
    const success = addedCount > 0 || skippedCount > 0;
    await dbService.recordSchedulerRun(gameType, success, addedCount);
    
    // Get final count
    const finalCount = await db.LotteryResult.countDocuments({ gameType });
    
    // Prepare result summary
    const result = {
      success: true,
      scraped: scrapedResults.length,
      added: addedCount,
      skipped: skippedCount,
      errors: errorCount,
      total: finalCount,
      validation,
      backup: backupPath ? path.basename(backupPath) : null,
      timestamp: new Date().toISOString()
    };
    
    // Update state
    state.status = 'idle';
    state.lastResult = result;
    
    // Final summary
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📈 SCRAPE SUMMARY for ${gameType.toUpperCase()}:`);
    console.log(`   ✅ NEW records added: ${addedCount}`);
    if (addedCount > 0 && newDates.length <= 10) {
      console.log(`   📅 New dates: ${newDates.join(', ')}`);
    }
    console.log(`   ⏭️ Existing dates skipped: ${skippedCount}`);
    console.log(`   ⚠️ Errors: ${errorCount}`);
    console.log(`   📊 Total in database: ${finalCount}`);
    
    if (backupPath) {
      console.log(`   💾 Backup saved: ${path.basename(backupPath)}`);
    }
    
    // User-friendly message
    if (addedCount === 0 && skippedCount > 0) {
      console.log(`\n   ℹ️ No new lottery draws found. All ${skippedCount} results already exist in database.`);
    } else if (addedCount > 0) {
      console.log(`\n   🎉 Found ${addedCount} new lottery draw(s)!`);
    }
    
    console.log(`${'='.repeat(60)}\n`);
    
    return result;
    
  } catch (error) {
    console.error(`\n❌ [Scheduled] ${gameType.toUpperCase()} scrape failed:`);
    console.error(`   Error: ${error.message}`);
    
    // Record failure
    try {
      await dbService.recordSchedulerRun(gameType, false, 0, error.message);
    } catch (dbError) {
      console.error('   Failed to record error in DB:', dbError.message);
    }
    
    const result = {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
    
    state.status = 'error';
    state.lastResult = result;
    
    console.log(`${'='.repeat(60)}\n`);
    
    return result;
  }
}

/**
 * Start scheduler for a game type
 */
function startScheduler(gameType, schedule = '0 */6 * * *') {
  if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
    throw new Error('Invalid game type');
  }
  
  const state = schedulerState[gameType];
  
  if (state.task) {
    state.task.stop();
  }
  
  if (!cron.validate(schedule)) {
    throw new Error('Invalid cron expression');
  }
  
  state.task = cron.schedule(schedule, async () => {
    await runScheduledScrape(gameType);
  });
  
  state.enabled = true;
  state.schedule = schedule;
  state.status = 'idle';
  
  // Calculate next run time
  const cronTime = cron.schedule(schedule, () => {});
  state.nextRun = new Date();
  cronTime.stop();
  
  console.log(`✅ Scheduler started for ${gameType.toUpperCase()} - Schedule: ${schedule}`);
  
  return {
    success: true,
    message: `Scheduler started for ${gameType.toUpperCase()}`,
    schedule,
    nextRun: state.nextRun
  };
}

/**
 * Stop scheduler
 */
function stopScheduler(gameType) {
  if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
    throw new Error('Invalid game type');
  }
  
  const state = schedulerState[gameType];
  
  if (state.task) {
    state.task.stop();
    state.task = null;
  }
  
  state.enabled = false;
  state.status = 'stopped';
  state.nextRun = null;
  
  console.log(`🛑 Scheduler stopped for ${gameType.toUpperCase()}`);
  
  return {
    success: true,
    message: `Scheduler stopped for ${gameType.toUpperCase()}`
  };
}

/**
 * Get scheduler status
 */
function getSchedulerStatus(gameType = null) {
  if (gameType) {
    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      throw new Error('Invalid game type');
    }
    return schedulerState[gameType];
  }
  
  return schedulerState;
}

/**
 * Manual trigger
 */
async function triggerManualScrape(gameType) {
  if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
    throw new Error('Invalid game type');
  }
  
  console.log(`🔧 Manual scrape triggered for ${gameType.toUpperCase()}`);
  return await runScheduledScrape(gameType);
}

/**
 * Export data from MongoDB to Excel
 */
async function exportToExcel(gameType) {
  try {
    const results = await db.LotteryResult
      .find({ gameType })
      .sort({ drawDate: -1 })
      .lean();
    
    if (results.length === 0) {
      return { success: false, error: 'No data to export' };
    }
    
    const excelData = results.map(r => {
      const row = { Date: normalizeDate(r.drawDate) || r.drawDate };
      r.numbers.forEach((num, idx) => {
        row[`Number ${idx + 1}`] = num;
      });
      if (r.bonus) row.Bonus = r.bonus;
      return row;
    });
    
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    XLSX.utils.book_append_sheet(workbook, worksheet, gameType.toUpperCase());
    
    const exportDir = path.join(__dirname, '../exports');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }
    
    const filename = `${gameType}-export-${Date.now()}.xlsx`;
    const filepath = path.join(exportDir, filename);
    XLSX.writeFile(workbook, filepath);
    
    return {
      success: true,
      filename,
      filepath,
      count: results.length
    };
  } catch (error) {
    console.error(`Export failed for ${gameType}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Predefined schedule presets
const SCHEDULE_PRESETS = {
  'every-hour': '0 * * * *',
  'every-3-hours': '0 */3 * * *',
  'every-6-hours': '0 */6 * * *',
  'every-12-hours': '0 */12 * * *',
  'daily-midnight': '0 0 * * *',
  'daily-noon': '0 12 * * *',
  'twice-daily': '0 0,12 * * *'
};

// Public API methods for scheduler routes
function getStatus(gameType) {
  if (!schedulerState[gameType]) {
    throw new Error(`Invalid game type: ${gameType}`);
  }
  return {
    ...schedulerState[gameType],
    lastRun: schedulerState[gameType].lastRun,
    nextRun: schedulerState[gameType].nextRun,
    status: schedulerState[gameType].status
  };
}

async function triggerScrape(gameType) {
  if (!schedulerState[gameType]) {
    throw new Error(`Invalid game type: ${gameType}`);
  }

  try {
    schedulerState[gameType].status = 'running';
    let results;
    
    switch (gameType) {
      case '539':
        try {
          console.log('🎲 Starting 539 scraper...');
          
          // Verify scraper is properly initialized with required methods
          if (!scraper539 || typeof scraper539.scrapeLatestResults !== 'function') {
            console.error('❌ Scraper initialization error:', scraper539);
            throw new Error('539 scraper not properly initialized');
          }
          
          results = await scraper539.scrapeLatestResults();
          console.log('📊 Scraping completed:', results);
          
          // Save results to database
          if (results && results.length > 0) {
            const result = results[0];
            const { drawDate, numbers } = result;
            
            // Validate result data
            if (!drawDate || !numbers || numbers.length !== 5) {
              throw new Error('Invalid scraped data format');
            }
            
            // Find the highest numeric _id
            const lastResult = await db.LotteryResult.findOne({
              _id: { $type: "number" }
            })
            .sort({ _id: -1 })
            .lean();
            
            const nextId = (lastResult?._id || 10010) + 1;
            
            // Check for existing result on the same date
            const existingResult = await db.LotteryResult.findOne({
              gameType: '539',
              drawDate: new Date(drawDate)
            });

            if (existingResult) {
              console.log('⚠️ Result for date already exists:', drawDate);
              throw new Error(`Result for ${drawDate} already exists`);
            }
            
            // Create new lottery result
            const newResult = new db.LotteryResult({
              _id: nextId,
              gameType: '539',
              drawDate: new Date(drawDate),
              numbers: numbers,
              source: 'web_scraper'
            });
            
            await newResult.save();
            console.log('✅ Saved new result with ID:', nextId);
            
            // Update scheduler state
            schedulerState[gameType].lastRun = new Date();
            schedulerState[gameType].status = 'success';
          } else {
            throw new Error('No results returned from scraper');
          }
        } catch (error) {
          console.error('❌ Error during 539 scraping/saving:', error);
          schedulerState[gameType].status = 'error';
          schedulerState[gameType].lastError = error.message;
          throw error;
        }
        break;
        
      case 'mark6':
        results = await scraperMark6.scrapeLatestResults();
        break;
      case 'lotto649':
        results = await scraperLotto649.scrapeLatestResults();
        break;
      default:
        throw new Error(`Unsupported game type: ${gameType}`);
    }

    schedulerState[gameType].lastRun = new Date();
    schedulerState[gameType].status = 'success';
    return results;
  } catch (error) {
    schedulerState[gameType].status = 'error';
    throw error;
  }
}

function enableScheduler(gameType) {
  if (!schedulerState[gameType]) {
    throw new Error(`Invalid game type: ${gameType}`);
  }
  schedulerState[gameType].enabled = true;
  schedulerState[gameType].status = 'enabled';
}

function disableScheduler(gameType) {
  if (!schedulerState[gameType]) {
    throw new Error(`Invalid game type: ${gameType}`);
  }
  schedulerState[gameType].enabled = false;
  schedulerState[gameType].status = 'disabled';
}

module.exports = {
  startScheduler,
  stopScheduler,
  getSchedulerStatus,
  triggerManualScrape,
  exportToExcel,
  createBackup,
  // New exports for scheduler routes
  getStatus,
  triggerScrape,
  enableScheduler,
  disableScheduler,
  cleanupOldBackups,
  SCHEDULE_PRESETS
};