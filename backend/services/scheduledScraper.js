/**
 * Scheduled Scraper Service
 * services/scheduledScraper.js
 */

const cron = require('node-cron');
const scraper539 = require('./scraper');
const scraperMark6 = require('./scraperMark6');
const scraperLotto649 = require('./scraperLotto649');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Configuration
const EXCEL_PATHS = {
  '539': path.join(__dirname, '../data/539PAST2025RESULT.xlsx'),
  'mark6': path.join(__dirname, '../data/MARK6PAST2025RESULT.xlsx'),
  'lotto649': path.join(__dirname, '../data/LOTTO649PAST2025RESULT.xlsx')
};

// Backup configuration
const BACKUP_CONFIG = {
  maxBackups: 5, // Keep only the last 10 backups per game type
  autoCleanup: true // Enable automatic cleanup
};

// Scheduler state
const schedulerState = {
  '539': {
    enabled: false,
    schedule: '0 */6 * * *', // Every 6 hours by default
    lastRun: null,
    nextRun: null,
    task: null,
    status: 'stopped',
    lastResult: null
  },
  'mark6': {
    enabled: false,
    schedule: '0 */6 * * *', // Every 6 hours by default
    lastRun: null,
    nextRun: null,
    task: null,
    status: 'stopped',
    lastResult: null
  },
  'lotto649': {
    enabled: false,
    schedule: '0 */6 * * *', // Every 6 hours by default
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
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
  } catch (e) {
    return null;
  }
}

function formatScrapedResult(result, gameType) {
  const formatted = { Date: result.date };
  
  if (gameType === '539') {
    for (let i = 0; i < 5; i++) {
      formatted[`Number ${i + 1}`] = result.numbers[i];
    }
  } else if (gameType === 'mark6' || gameType === 'lotto649') {
    for (let i = 0; i < 6; i++) {
      formatted[`Number ${i + 1}`] = result.numbers[i];
    }
    if (result.bonus) formatted.Bonus = result.bonus;
  }
  
  return formatted;
}

function getScraper(gameType) {
  if (gameType === 'mark6') return scraperMark6;
  if (gameType === 'lotto649') return scraperLotto649;
  return scraper539;
}

/**
 * Clean up old backup files, keeping only the most recent ones
 * @param {string} gameType - The game type ('539' or 'mark6')
 * @param {number} maxBackups - Maximum number of backups to keep
 */
function cleanupOldBackups(gameType, maxBackups = BACKUP_CONFIG.maxBackups) {
  try {
    const dataDir = path.dirname(EXCEL_PATHS[gameType]);
    
    if (!fs.existsSync(dataDir)) {
      return { deleted: 0, kept: 0 };
    }
    
    // Get all backup files for this game type
    const backupPattern = new RegExp(`^${gameType}-auto-backup-\\d+\\.xlsx$`);
    const files = fs.readdirSync(dataDir)
      .filter(file => backupPattern.test(file))
      .map(file => ({
        name: file,
        path: path.join(dataDir, file),
        timestamp: parseInt(file.match(/\d+/)[0])
      }))
      .sort((a, b) => b.timestamp - a.timestamp); // Sort by timestamp, newest first
    
    // Keep only the most recent backups
    const toKeep = files.slice(0, maxBackups);
    const toDelete = files.slice(maxBackups);
    
    // Delete old backups
    let deletedCount = 0;
    toDelete.forEach(file => {
      try {
        fs.unlinkSync(file.path);
        console.log(`🗑️  Deleted old backup: ${file.name}`);
        deletedCount++;
      } catch (err) {
        console.error(`❌ Failed to delete backup ${file.name}:`, err.message);
      }
    });
    
    console.log(`📦 Backup cleanup for ${gameType.toUpperCase()}: ${deletedCount} deleted, ${toKeep.length} kept`);
    
    return {
      deleted: deletedCount,
      kept: toKeep.length,
      totalBefore: files.length
    };
    
  } catch (error) {
    console.error(`❌ Backup cleanup failed for ${gameType.toUpperCase()}:`, error.message);
    return { deleted: 0, kept: 0, error: error.message };
  }
}

// Main scraping function
async function runScheduledScrape(gameType) {
  console.log(`\n🤖 [Scheduled] Starting automatic scrape for ${gameType.toUpperCase()}...`);
  
  const state = schedulerState[gameType];
  state.status = 'running';
  state.lastRun = new Date().toISOString();
  
  try {
    const scraper = getScraper(gameType);
    const maxResults = 50; // Fetch last 50 results
    
    const scrapedResults = await scraper.scrapeResults(maxResults);
    
    if (scrapedResults.length === 0) {
      throw new Error('No results scraped');
    }
    
    const validation = scraper.validateResults(scrapedResults);
    
    if (validation.valid === 0) {
      throw new Error('No valid results found');
    }
    
    // Update Excel file
    const EXCEL_DATA_PATH = EXCEL_PATHS[gameType];
    let workbook;
    
    if (fs.existsSync(EXCEL_DATA_PATH)) {
      workbook = XLSX.readFile(EXCEL_DATA_PATH);
    } else {
      workbook = XLSX.utils.book_new();
    }
    
    const sheetName = 'Results';
    let existingData = [];
    
    if (workbook.SheetNames.includes(sheetName)) {
      const worksheet = workbook.Sheets[sheetName];
      existingData = XLSX.utils.sheet_to_json(worksheet);
    }
    
    const existingDates = new Set(
      existingData.map(row => normalizeDate(row.Date)).filter(Boolean)
    );
    
    let addedCount = 0;
    let skippedCount = 0;
    const expectedNumberCount = gameType === '539' ? 5 : 6;
    
    scrapedResults.forEach(result => {
      if (!result.numbers || result.numbers.length !== expectedNumberCount) {
        skippedCount++;
        return;
      }
      
      const normalizedDate = normalizeDate(result.date);
      
      if (existingDates.has(normalizedDate)) {
        skippedCount++;
        return;
      }
      
      existingData.push(formatScrapedResult(result, gameType));
      addedCount++;
    });
    
    // Sort by date (newest first)
    existingData.sort((a, b) => {
      const dateA = new Date(a.Date || 0);
      const dateB = new Date(b.Date || 0);
      return dateB - dateA;
    });
    
    const newWorksheet = XLSX.utils.json_to_sheet(existingData);
    
    if (workbook.SheetNames.includes(sheetName)) {
      workbook.Sheets[sheetName] = newWorksheet;
    } else {
      XLSX.utils.book_append_sheet(workbook, newWorksheet, sheetName);
    }
    
    // Create backup before saving
    const dataDir = path.dirname(EXCEL_DATA_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    let backupInfo = null;
    if (fs.existsSync(EXCEL_DATA_PATH)) {
      const backupPath = path.join(dataDir, `${gameType}-auto-backup-${Date.now()}.xlsx`);
      fs.copyFileSync(EXCEL_DATA_PATH, backupPath);
      console.log(`💾 Backup created: ${path.basename(backupPath)}`);
      
      // Clean up old backups if auto-cleanup is enabled
      if (BACKUP_CONFIG.autoCleanup) {
        backupInfo = cleanupOldBackups(gameType, BACKUP_CONFIG.maxBackups);
      }
    }
    
    XLSX.writeFile(workbook, EXCEL_DATA_PATH);
    
    const result = {
      success: true,
      scraped: scrapedResults.length,
      added: addedCount,
      skipped: skippedCount,
      total: existingData.length,
      validation,
      backupCleanup: backupInfo,
      timestamp: new Date().toISOString()
    };
    
    state.status = 'idle';
    state.lastResult = result;
    
    console.log(`✅ [Scheduled] ${gameType.toUpperCase()} scrape complete: ${addedCount} added, ${skippedCount} skipped`);
    
    return result;
    
  } catch (error) {
    console.error(`❌ [Scheduled] ${gameType.toUpperCase()} scrape failed:`, error.message);
    
    const result = {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
    
    state.status = 'error';
    state.lastResult = result;
    
    return result;
  }
}

// Start scheduler for a game type
function startScheduler(gameType, schedule = '0 */6 * * *') {
  if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
    throw new Error('Invalid game type');
  }
  
  const state = schedulerState[gameType];
  
  // Stop existing task if running
  if (state.task) {
    state.task.stop();
  }
  
  // Validate cron expression
  if (!cron.validate(schedule)) {
    throw new Error('Invalid cron expression');
  }
  
  // Create new cron task
  state.task = cron.schedule(schedule, async () => {
    await runScheduledScrape(gameType);
  });
  
  state.enabled = true;
  state.schedule = schedule;
  state.status = 'idle';
  
  // Calculate next run
  const cronTime = cron.schedule(schedule, () => {});
  state.nextRun = cronTime.nextDate().toISOString();
  cronTime.stop();
  
  console.log(`✅ Scheduler started for ${gameType.toUpperCase()} - Schedule: ${schedule}`);
  console.log(`   Next run: ${state.nextRun}`);
  
  return {
    success: true,
    message: `Scheduler started for ${gameType.toUpperCase()}`,
    schedule,
    nextRun: state.nextRun
  };
}

// Stop scheduler
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

// Get scheduler status
function getSchedulerStatus(gameType = null) {
  if (gameType) {
    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      throw new Error('Invalid game type');
    }
    return schedulerState[gameType];
  }
  
  return schedulerState;
}

// Manual trigger
async function triggerManualScrape(gameType) {
  if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
    throw new Error('Invalid game type');
  }
  
  console.log(`🔧 Manual scrape triggered for ${gameType.toUpperCase()}`);
  return await runScheduledScrape(gameType);
}

// Get backup configuration
function getBackupConfig() {
  return { ...BACKUP_CONFIG };
}

// Update backup configuration
function setBackupConfig(config) {
  if (config.maxBackups !== undefined) {
    if (typeof config.maxBackups !== 'number' || config.maxBackups < 1) {
      throw new Error('maxBackups must be a positive number');
    }
    BACKUP_CONFIG.maxBackups = config.maxBackups;
  }
  
  if (config.autoCleanup !== undefined) {
    if (typeof config.autoCleanup !== 'boolean') {
      throw new Error('autoCleanup must be a boolean');
    }
    BACKUP_CONFIG.autoCleanup = config.autoCleanup;
  }
  
  console.log(`⚙️  Backup config updated:`, BACKUP_CONFIG);
  
  return { ...BACKUP_CONFIG };
}

// Manually trigger backup cleanup
function manualBackupCleanup(gameType = null) {
  if (gameType) {
    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      throw new Error('Invalid game type');
    }
    return cleanupOldBackups(gameType, BACKUP_CONFIG.maxBackups);
  }
  
  // Clean up all game types
  const results = {
    '539': cleanupOldBackups('539', BACKUP_CONFIG.maxBackups),
    'mark6': cleanupOldBackups('mark6', BACKUP_CONFIG.maxBackups),
    'lotto649': cleanupOldBackups('lotto649', BACKUP_CONFIG.maxBackups)
  };
  
  return results;
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

module.exports = {
  startScheduler,
  stopScheduler,
  getSchedulerStatus,
  triggerManualScrape,
  getBackupConfig,
  setBackupConfig,
  manualBackupCleanup,
  SCHEDULE_PRESETS
};