const express = require('express');
const router = express.Router();
const scheduledScraper = require('../services/scheduledScraper');

// GET /api/admin/scheduler/status/:gameType
router.get('/scheduler/status/:gameType', async (req, res) => {
  // Rely on global CORS middleware. Do not set wildcard origin here because
  // the frontend uses credentials: 'include' and the Access-Control-Allow-Origin
  // header must be a specific origin in that case.

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
    await scheduledScraper.triggerScrape(gameType);
    res.json({
      success: true,
      message: `Scraper triggered for ${gameType}`
    });
  } catch (error) {
    console.error('[SCHEDULER] Trigger error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/admin/scheduler/enable/:gameType
router.post('/scheduler/enable/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;
    scheduledScraper.enableScheduler(gameType);
    res.json({
      success: true,
      message: `Scheduler enabled for ${gameType}`
    });
  } catch (error) {
    console.error('[SCHEDULER] Enable error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/admin/scheduler/disable/:gameType
router.post('/scheduler/disable/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;
    scheduledScraper.disableScheduler(gameType);
    res.json({
      success: true,
      message: `Scheduler disabled for ${gameType}`
    });
  } catch (error) {
    console.error('[SCHEDULER] Disable error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;