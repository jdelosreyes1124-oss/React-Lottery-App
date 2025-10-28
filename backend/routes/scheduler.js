const express = require('express');
const router = express.Router();
const scheduledScraper = require('../services/scheduledScraper');

// GET /api/admin/scheduler/status/:gameType
router.get('/scheduler/status/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;
    const status = scheduledScraper.getStatus(gameType);
    res.json({
      success: true,
      status: status
    });
  } catch (error) {
    console.error('[SCHEDULER] Status error:', error);
    res.status(500).json({
      success: false,
      error: error.message
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