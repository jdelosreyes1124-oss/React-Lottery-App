// Fixed version - addresses the Mongoose _id error
// This version properly handles the Mongoose model lifecycle

const router = require('express').Router();
const { LotteryResult } = require('../models');  // Import from your models/index.js

// Add new result
router.post('/admin/historical-results/:gameType/add', async (req, res) => {
  console.log('Adding new result:', req.body);
  
  try {
    const { gameType } = req.params;
    const { drawDate, numbers, bonus } = req.body;
    
    // Input validation
    if (!drawDate || !numbers || !Array.isArray(numbers)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input data'
      });
    }
    
    // Validate numbers based on game type
    const gameConfig = {
      '539': { count: 5, max: 39, hasBonus: false },
      'mark6': { count: 6, max: 49, hasBonus: true },
      'lotto649': { count: 6, max: 49, hasBonus: true }
    };
    
    const config = gameConfig[gameType];
    if (!config) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type'
      });
    }
    
    // Validate number count
    if (numbers.length !== config.count) {
      return res.status(400).json({
        success: false,
        error: `${gameType} requires exactly ${config.count} numbers`
      });
    }
    
    // Validate number range
    const invalidNumbers = numbers.filter(n => n < 1 || n > config.max);
    if (invalidNumbers.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Numbers must be between 1 and ${config.max}`
      });
    }
    
    // Check for duplicates
    if (new Set(numbers).size !== numbers.length) {
      return res.status(400).json({
        success: false,
        error: 'Duplicate numbers are not allowed'
      });
    }
    
    // Parse the date properly
    let parsedDate;
    if (typeof drawDate === 'string') {
      // Handle YYYY-MM-DD format from React
      if (drawDate.includes('-')) {
        parsedDate = new Date(drawDate + 'T12:00:00.000Z');
      } 
      // Handle MM/DD/YYYY format
      else if (drawDate.includes('/')) {
        const [month, day, year] = drawDate.split('/');
        parsedDate = new Date(year, parseInt(month) - 1, day, 12, 0, 0);
      } 
      else {
        parsedDate = new Date(drawDate);
      }
    } else {
      parsedDate = new Date(drawDate);
    }
    
    // Validate the date
    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format'
      });
    }
    
    // Check for existing result
    const startOfDay = new Date(parsedDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(parsedDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    const existingResult = await LotteryResult.findOne({
      gameType: gameType,
      drawDate: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    });
    
    if (existingResult) {
      return res.status(400).json({
        success: false,
        error: `Result already exists for ${parsedDate.toLocaleDateString()}`
      });
    }
    
    // Create new result - FIX: Don't reuse the model, create fresh instance
    const newResultData = {
      gameType: gameType,
      drawDate: parsedDate,
      numbers: numbers.sort((a, b) => a - b),
      source: 'admin'
    };
    
    // Add bonus if applicable
    if (config.hasBonus && bonus) {
      newResultData.bonus = bonus;
    }
    
    // Add metadata
    newResultData.metadata = {
      addedBy: req.session?.user?.username || 'admin',
      addedAt: new Date(),
      ipAddress: req.ip
    };
    
    console.log('Creating document with data:', newResultData);
    
    // Create and save the document
    const result = new LotteryResult(newResultData);
    const savedResult = await result.save();
    
    console.log('✅ Successfully saved result:', savedResult._id);
    
    // Get updated results list
    const allResults = await LotteryResult.find({ gameType })
      .sort({ drawDate: -1 })
      .limit(50)
      .lean();
    
    // Format results for response
    const formattedResults = allResults.map((r, index) => ({
      _id: r._id.toString(),
      id: index,
      drawDate: r.drawDate.toLocaleDateString(),
      numbers: r.numbers,
      bonus: r.bonus
    }));
    
    res.json({
      success: true,
      message: 'Result added successfully',
      result: {
        _id: savedResult._id.toString(),
        drawDate: savedResult.drawDate.toLocaleDateString(),
        numbers: savedResult.numbers,
        bonus: savedResult.bonus
      },
      results: formattedResults,
      total: formattedResults.length
    });
    
  } catch (error) {
    console.error('Error adding historical result:', error);
    
    // Handle specific MongoDB errors
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        error: 'Duplicate entry detected'
      });
    }
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: 'Validation failed: ' + error.message
      });
    }
    
    // Generic error response
    res.status(500).json({
      success: false,
      error: 'Failed to add result',
      message: error.message
    });
  }
});

// Get historical results
router.get('/admin/historical-results/:gameType', async (req, res) => {
  console.log(`📊 Fetching historical results - Game: ${req.params.gameType}, Page: ${req.query.page || 1}, Limit: ${req.query.limit || 50}`);
  
  try {
    const { gameType } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    
    // Get total count
    const total = await LotteryResult.countDocuments({ gameType });
    
    // Get paginated results
    const results = await LotteryResult.find({ gameType })
      .sort({ drawDate: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    // Format results
    const formattedResults = results.map((r, index) => ({
      _id: r._id.toString(),
      id: skip + index,
      drawDate: r.drawDate.toLocaleDateString(),
      numbers: r.numbers,
      bonus: r.bonus
    }));
    
    console.log(`✅ Found ${formattedResults.length} results out of ${total} total`);
    
    res.json({
      success: true,
      results: formattedResults,
      total: total,
      page: page,
      totalPages: Math.ceil(total / limit)
    });
    
  } catch (error) {
    console.error('Error fetching historical results:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch results',
      message: error.message
    });
  }
});

// Delete historical result
router.delete('/admin/historical-results/:gameType/:id', async (req, res) => {
  console.log(`Deleting result: ${req.params.id}`);
  
  try {
    const { gameType, id } = req.params;
    
    const result = await LotteryResult.findOneAndDelete({
      _id: id,
      gameType: gameType
    });
    
    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Result not found'
      });
    }
    
    // Get updated results
    const allResults = await LotteryResult.find({ gameType })
      .sort({ drawDate: -1 })
      .limit(50)
      .lean();
    
    const formattedResults = allResults.map((r, index) => ({
      _id: r._id.toString(),
      id: index,
      drawDate: r.drawDate.toLocaleDateString(),
      numbers: r.numbers,
      bonus: r.bonus
    }));
    
    res.json({
      success: true,
      message: 'Result deleted successfully',
      results: formattedResults,
      total: formattedResults.length
    });
    
  } catch (error) {
    console.error('Error deleting result:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete result',
      message: error.message
    });
  }
});

module.exports = router;