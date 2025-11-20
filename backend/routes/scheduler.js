const express = require('express');
const router = express.Router();
const scheduledScraper = require('../services/scheduledScraper');

// GET /api/admin/scheduler/status/:gameType
router.get('/scheduler/status/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;
    
    if (!gameType) {
      return res.status(400).json({
        success: false,
        error: 'Game type is required'
      });
    }

    const status = scheduledScraper.getStatus(gameType);
    
    res.json({
      success: true,
      status: status,
      serverTime: new Date().toISOString()
    });
  } catch (error) {
    console.error('[SCHEDULER] Status error:', error);
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Internal server error',
      serverTime: new Date().toISOString()
    });
  }
});

// POST /api/admin/scheduler/trigger/:gameType
router.post('/scheduler/trigger/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;
    
    if (!gameType) {
      return res.status(400).json({
        success: false,
        error: 'Game type is required'
      });
    }
    
    console.log(`[SCHEDULER] Manual trigger requested for ${gameType}`);
    
    // Trigger the scrape
    const result = await scheduledScraper.triggerScrape(gameType);
    
    // The result object now contains detailed information
    console.log(`[SCHEDULER] Scrape completed for ${gameType}:`, {
      status: result.status,
      added: result.added,
      total: result.total
    });
    
    // Return comprehensive response
    res.json({
      success: result.success !== false, // Handle both true and 'up-to-date' status
      status: result.status,
      message: result.message || `Scraper completed for ${gameType}`,
      data: {
        added: result.added || 0,
        skipped: result.skipped || 0,
        failed: result.failed || 0,
        total: result.total || 0,
        scraped: result.scraped || 0,
        upToDate: result.upToDate || false
      },
      errors: result.errors || [],
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[SCHEDULER] Trigger error:', error);
    
    // Return error with proper structure
    res.status(500).json({
      success: false,
      status: 'error',
      message: error.message || 'An error occurred while scraping',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// POST /api/admin/scheduler/enable/:gameType
router.post('/scheduler/enable/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;
    
    if (!gameType) {
      return res.status(400).json({
        success: false,
        error: 'Game type is required'
      });
    }
    
    scheduledScraper.enableScheduler(gameType);
    
    res.json({
      success: true,
      message: `Scheduler enabled for ${gameType}`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[SCHEDULER] Enable error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// POST /api/admin/scheduler/disable/:gameType
router.post('/scheduler/disable/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;
    
    if (!gameType) {
      return res.status(400).json({
        success: false,
        error: 'Game type is required'
      });
    }
    
    scheduledScraper.disableScheduler(gameType);
    
    res.json({
      success: true,
      message: `Scheduler disabled for ${gameType}`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[SCHEDULER] Disable error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;