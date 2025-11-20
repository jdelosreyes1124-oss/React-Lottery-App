/**
 * Scheduled Scraper Service - MongoDB Version
 * IMPROVED: Better error handling and clear user messages
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
    '539': !!scraper539?.scrapeResults,
    'mark6': !!scraperMark6?.scrapeResults,
    'lotto649': !!scraperLotto649?.scrapeResults
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
    task: null,
    lastResult: null,
    lastMessage: null
  },
  'mark6': {
    enabled: false,
    schedule: '0 */6 * * *',
    lastRun: null,
    nextRun: null,
    task: null,
    status: 'stopped',
    lastResult: null,
    lastMessage: null
  },
  'lotto649': {
    enabled: false,
    schedule: '0 */6 * * *',
    lastRun: null,
    nextRun: null,
    task: null,
    status: 'stopped',
    lastResult: null,
    lastMessage: null
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

function getGameDisplayName(gameType) {
  const names = {
    '539': '539 Lottery',
    'mark6': 'Hong Kong Mark 6',
    'lotto649': 'Taiwan Lotto 649'
  };
  return names[gameType] || gameType.toUpperCase();
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
    const maxResults = gameType === '539' ? 100 : 50; // More for 539 since it's faster
    
    // Step 1: Scrape results
    console.log(`📡 STEP 1: Scraping ${gameType.toUpperCase()} results...`);
    
    let scrapedResults;
    try {
      scrapedResults = await scraper.scrapeResults(maxResults);
    } catch (scrapeError) {
      throw new Error(`Failed to fetch data from website: ${scrapeError.message}`);
    }
    
    console.log(`\n🔍 Scraped Results Summary:`);
    console.log(`   Total scraped: ${scrapedResults.length}`);
    
    if (!scrapedResults || scrapedResults.length === 0) {
      throw new Error('No results returned from website. The website may be down or blocking requests.');
    }
    
    // Show first and last scraped results
    if (scrapedResults.length > 0) {
      const first = scrapedResults[0];
      const last = scrapedResults[scrapedResults.length - 1];
      console.log(`   First result: ${first.date} - [${first.numbers.join(', ')}]${first.bonus ? ' +' + first.bonus : ''}`);
      console.log(`   Last result: ${last.date} - [${last.numbers.join(', ')}]${last.bonus ? ' +' + last.bonus : ''}`);
    }
    
    // Step 2: Validate scraped results
    let validation = { valid: 0, invalid: 0, total: 0 };
    try {
      validation = scraper.validateResults ? scraper.validateResults(scrapedResults) : { 
        valid: scrapedResults.length, 
        invalid: 0,
        total: scrapedResults.length
      };
      console.log(`\n✅ Validation Results:`);
      console.log(`   Valid: ${validation.valid}/${validation.total}`);
      if (validation.invalid > 0) {
        console.log(`   Invalid: ${validation.invalid}`);
        if (validation.errors && validation.errors.length > 0) {
          console.log(`   First errors:`, validation.errors.slice(0, 3));
        }
      }
    } catch (validationError) {
      console.warn(`⚠️  Validation error (continuing anyway): ${validationError.message}`);
    }
    
    if (validation.valid === 0) {
      throw new Error('All scraped results failed validation. Check website format.');
    }
    
    // Step 3: Get existing dates from database
    console.log(`\n📊 STEP 2: Checking existing data in database...`);
    
    let existingDates;
    try {
      existingDates = await db.LotteryResult.find({
        gameType: gameType
      }).select('drawDate').lean();
    } catch (dbError) {
      throw new Error(`Database error: ${dbError.message}`);
    }
    
    const existingDateStrings = new Set(
      existingDates.map(d => normalizeDate(d.drawDate))
    );
    
    console.log(`   Database has ${existingDateStrings.size} existing results`);
    
    // Step 4: Filter out existing results
    const newResults = scrapedResults.filter(r => {
      const dateStr = normalizeDate(r.date || r.drawDate);
      return dateStr && !existingDateStrings.has(dateStr);
    });
    
    console.log(`   Found ${newResults.length} new results to save`);
    
    if (newResults.length === 0) {
      console.log('\n✅ Database is already up to date - no new results to save');
      
      const displayName = getGameDisplayName(gameType);
      const message = `${displayName} is already up-to-date! Database has all ${existingDateStrings.size} available results.`;
      
      state.status = 'success';
      state.lastResult = 'up-to-date';
      state.lastMessage = message;
      
      return {
        success: true,
        status: 'up-to-date',
        message: message,
        added: 0,
        skipped: scrapedResults.length,
        total: existingDateStrings.size,
        scraped: scrapedResults.length,
        upToDate: true
      };
    }
    
    // Step 5: Save new results to database
    console.log(`\n💾 STEP 3: Saving ${newResults.length} new results...`);
    
    // Get the highest numeric ID for sequential numbering
    let lastResult;
    try {
      lastResult = await db.LotteryResult.findOne({
        _id: { $type: "number" }
      })
      .sort({ _id: -1 })
      .lean();
    } catch (dbError) {
      throw new Error(`Failed to get last ID: ${dbError.message}`);
    }
    
    let nextId = (lastResult?._id || 10000) + 1;
    
    let savedCount = 0;
    let failedCount = 0;
    const errors = [];
    
    // Sort by date (newest first) - prioritize latest results
    newResults.sort((a, b) => {
      const dateA = new Date(a.date || a.drawDate);
      const dateB = new Date(b.date || b.drawDate);
      return dateB - dateA;
    });
    
    for (const result of newResults) {
      try {
        const dateStr = result.date || result.drawDate;
        const numbers = result.numbers;
        const bonus = result.bonus || null;
        
        // Validate result data
        const expectedNumberCount = gameType === '539' ? 5 : 6;
        if (!dateStr || !numbers || numbers.length !== expectedNumberCount) {
          console.log(`  ⚠️ Skipping invalid result: ${dateStr} - ${numbers?.length || 0} numbers`);
          failedCount++;
          errors.push(`Invalid data for ${dateStr}: expected ${expectedNumberCount} numbers, got ${numbers?.length || 0}`);
          continue;
        }
        
        // Create new lottery result
        const newResult = new db.LotteryResult({
          _id: nextId,
          gameType: gameType,
          drawDate: new Date(dateStr),
          numbers: numbers,
          bonus: bonus,
          source: 'web_scraper'
        });
        
        await newResult.save();
        console.log(`  ✅ Saved: ${dateStr} [${numbers.join(', ')}]${bonus ? ' +' + bonus : ''} (ID: ${nextId})`);
        savedCount++;
        nextId++;
        
      } catch (saveError) {
        console.log(`  ⚠️ Failed to save result:`, saveError.message);
        failedCount++;
        errors.push(saveError.message);
      }
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎉 Scraping Complete for ${gameType.toUpperCase()}`);
    console.log(`   ✅ Successfully saved: ${savedCount}`);
    if (failedCount > 0) {
      console.log(`   ⚠️ Failed: ${failedCount}`);
    }
    console.log(`   📊 Total in database: ${existingDateStrings.size + savedCount}`);
    console.log(`${'='.repeat(60)}\n`);
    
    // Determine final status
    const displayName = getGameDisplayName(gameType);
    let message;
    let finalStatus;
    
    if (savedCount > 0) {
      finalStatus = 'success';
      if (failedCount > 0) {
        message = `✅ Added ${savedCount} new result${savedCount !== 1 ? 's' : ''} to ${displayName}. ${failedCount} failed to save.`;
      } else {
        message = `✅ Successfully added ${savedCount} new result${savedCount !== 1 ? 's' : ''} to ${displayName}!`;
      }
      
      // Create backup after successful scrape
      try {
        await createBackup(gameType);
      } catch (backupError) {
        console.warn('⚠️  Backup failed:', backupError.message);
      }
    } else {
      finalStatus = 'partial-failure';
      message = `⚠️ No results were saved for ${displayName}. ${failedCount} result${failedCount !== 1 ? 's' : ''} failed validation.`;
    }
    
    // Update state
    state.status = finalStatus;
    state.lastResult = finalStatus;
    state.lastMessage = message;
    
    return {
      success: savedCount > 0,
      status: finalStatus,
      message: message,
      added: savedCount,
      failed: failedCount,
      skipped: scrapedResults.length - newResults.length,
      total: existingDateStrings.size + savedCount,
      scraped: scrapedResults.length,
      errors: errors.slice(0, 5), // Include first 5 errors
      upToDate: false
    };
    
  } catch (error) {
    console.error(`\n❌ Error during ${gameType} scraping:`, error.message);
    console.error('Stack trace:', error.stack);
    
    const displayName = getGameDisplayName(gameType);
    const errorMessage = `❌ Failed to update ${displayName}: ${error.message}`;
    
    state.status = 'error';
    state.lastResult = 'error';
    state.lastMessage = errorMessage;
    
    return {
      success: false,
      status: 'error',
      message: errorMessage,
      error: error.message,
      added: 0,
      failed: 0,
      total: 0
    };
  }
}

// Cron scheduler functions
function startScheduler(gameType) {
  if (!schedulerState[gameType]) {
    throw new Error(`Invalid game type: ${gameType}`);
  }

  const state = schedulerState[gameType];
  
  if (state.task) {
    console.log(`⚠️ Scheduler already running for ${gameType}`);
    return;
  }

  console.log(`🚀 Starting scheduler for ${gameType} with schedule: ${state.schedule}`);
  
  state.task = cron.schedule(state.schedule, async () => {
    console.log(`⏰ Triggered scheduled scrape for ${gameType}`);
    try {
      await runScheduledScrape(gameType);
    } catch (error) {
      console.error(`❌ Scheduled scrape failed for ${gameType}:`, error.message);
    }
  });

  state.enabled = true;
  state.status = 'scheduled';
  state.nextRun = getNextRunTime(state.schedule);
  
  console.log(`✅ Scheduler started for ${gameType}`);
  console.log(`⏭️  Next run: ${state.nextRun}`);
}

function stopScheduler(gameType) {
  if (!schedulerState[gameType]) {
    throw new Error(`Invalid game type: ${gameType}`);
  }

  const state = schedulerState[gameType];
  
  if (state.task) {
    state.task.stop();
    state.task = null;
  }

  state.enabled = false;
  state.status = 'stopped';
  state.nextRun = null;
  
  console.log(`⏹️  Scheduler stopped for ${gameType}`);
}

function getSchedulerStatus(gameType = null) {
  if (gameType) {
    if (!schedulerState[gameType]) {
      throw new Error(`Invalid game type: ${gameType}`);
    }
    return schedulerState[gameType];
  }
  
  return schedulerState;
}

function getNextRunTime(cronExpression) {
  // Simple cron parser for common patterns
  // This is a simplified version - for production, use a proper cron parser library
  const now = new Date();
  const parts = cronExpression.split(' ');
  
  // For */N hours pattern
  if (parts[1].startsWith('*/')) {
    const hours = parseInt(parts[1].substring(2));
    const nextRun = new Date(now);
    nextRun.setHours(now.getHours() + hours);
    nextRun.setMinutes(0);
    nextRun.setSeconds(0);
    return nextRun.toISOString();
  }
  
  return new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString(); // Default to 6 hours
}

async function triggerManualScrape(gameType) {
  console.log(`🎯 Manual scrape triggered for ${gameType}`);
  return await runScheduledScrape(gameType);
}

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
    status: schedulerState[gameType].status,
    lastMessage: schedulerState[gameType].lastMessage
  };
}

async function triggerScrape(gameType) {
  if (!schedulerState[gameType]) {
    throw new Error(`Invalid game type: ${gameType}`);
  }

  try {
    schedulerState[gameType].status = 'running';
    
    console.log(`🎲 Starting ${gameType} scraper...`);
    
    // Verify scraper is properly initialized
    const scraper = getScraper(gameType);
    if (!scraper || typeof scraper.scrapeResults !== 'function') {
      console.error('❌ Scraper initialization error:', scraper);
      throw new Error(`${gameType} scraper not properly initialized`);
    }
    
    // Run the scrape using the unified function
    const result = await runScheduledScrape(gameType);
    
    schedulerState[gameType].lastRun = new Date();
    
    // Return the result which includes clear messaging
    return result;
    
  } catch (error) {
    console.error(`❌ Error during ${gameType} scraping:`, error);
    
    const displayName = getGameDisplayName(gameType);
    const errorMessage = `❌ Failed to update ${displayName}: ${error.message}`;
    
    schedulerState[gameType].status = 'error';
    schedulerState[gameType].lastResult = 'error';
    schedulerState[gameType].lastMessage = errorMessage;
    
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