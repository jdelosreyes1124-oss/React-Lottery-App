const express = require('express');
const router = express.Router();
const dbService = require('../services/databaseService');
const db = require('../models_mongoose');
const axios = require('axios');

// Magayo API Configuration
const MAGAYO_API_URL = process.env.MAGAYO_API_URL || 'https://www.magayo.com/api/tickets.php';
const MAGAYO_API_KEY = process.env.MAGAYO_API_KEY || 'your-api-key-here';
const MAGAYO_TIMEOUT = 5000;

const GAME_CODE_MAP = {
  '539': 'tw_dailycash539',
  'mark6': 'hk_mark6',
  'lotto649': 'tw_lotto649'
};

// Helper Function: Call Magayo API
async function getMagayoPrediction(gameType, period, extended = false) {
  try {
    console.log('Attempting to get prediction from Magayo API...');
    
    const magayoGameCode = GAME_CODE_MAP[gameType];
    if (!magayoGameCode) {
      throw new Error(`No Magayo game code mapping for ${gameType}`);
    }

    const apiUrl = `${MAGAYO_API_URL}?api_key=${MAGAYO_API_KEY}&game=${magayoGameCode}&tickets=1`;
    
    const response = await axios.get(apiUrl, {
      timeout: MAGAYO_TIMEOUT
    });

    if (response.data.error && response.data.error > 0) {
      throw new Error(`Magayo API error code: ${response.data.error}`);
    }

    if (response.data && response.data.tickets && response.data.tickets.length > 0) {
      const ticketString = response.data.tickets[0].ticket;
      const parts = ticketString.split(',');
      const numbers = [];
      let bonus = null;

      parts.forEach(part => {
        if (part.startsWith('+')) {
          bonus = parseInt(part.substring(1));
        } else {
          numbers.push(parseInt(part));
        }
      });

      console.log('Successfully received prediction from Magayo API');
      
      const prediction = {
        numbers: numbers.sort((a, b) => a - b),
        confidence: 0.85,
        timestamp: new Date().toISOString(),
        algorithms: ['Magayo AI'],
        analysisPeriod: period,
        extended: extended,
        metadata: {
          dataSource: 'Magayo API',
          predictionType: extended ? 'Extended Prediction' : 'Standard Prediction',
          source: 'magayo-api'
        }
      };

      if (bonus !== null) {
        prediction.bonus = bonus;
      }

      return {
        success: true,
        prediction,
        source: 'magayo-api'
      };
    }

    throw new Error('Invalid response format from Magayo API');
  } catch (error) {
    console.log('Magayo API failed:', error.message);
    return {
      success: false,
      error: error.message,
      source: 'magayo-api'
    };
  }
}

// Helper Function: Local Algorithm Prediction
async function getLocalPrediction(gameType, period, extended = false, frequency) {
  console.log('Using local algorithm for prediction...');
  
  const gameConfig = {
    '539': { numbers: extended ? 8 : 5, max: 39, hasBonus: false },
    'mark6': { numbers: 6, max: 49, hasBonus: true },
    'lotto649': { numbers: 6, max: 49, hasBonus: true }
  };
  
  const config = gameConfig[gameType];
  const numbers = [];
  const candidates = [...frequency.mainNumbers];
  
  while (numbers.length < config.numbers && candidates.length > 0) {
    const weightedIndex = Math.floor(Math.random() * Math.min(10, candidates.length));
    const selected = candidates.splice(weightedIndex, 1)[0];
    if (selected) {
      numbers.push(selected.number);
    }
  }
  
  while (numbers.length < config.numbers) {
    const num = Math.floor(Math.random() * config.max) + 1;
    if (!numbers.includes(num)) {
      numbers.push(num);
    }
  }
  
  numbers.sort((a, b) => a - b);

  const prediction = {
    numbers,
    confidence: 0.75 + (frequency.totalDraws > 10 ? 0.05 : 0),
    timestamp: new Date().toISOString(),
    algorithms: ['AI', 'Statistical', 'Pattern', 'Frequency'],
    analysisPeriod: period,
    extended: extended,
    metadata: {
      dataSource: 'Database Analysis',
      predictionType: extended ? 'Extended Prediction' : 'Standard Prediction',
      totalDrawsAnalyzed: frequency.totalDraws,
      source: 'local-algorithm'
    }
  };

  if (config.hasBonus) {
    if (frequency.bonusNumbers && frequency.bonusNumbers.length > 0) {
      const bonusIdx = Math.floor(Math.random() * Math.min(5, frequency.bonusNumbers.length));
      prediction.bonus = frequency.bonusNumbers[bonusIdx].number;
    } else {
      let bonus;
      do {
        bonus = Math.floor(Math.random() * config.max) + 1;
      } while (numbers.includes(bonus));
      prediction.bonus = bonus;
    }
  }

  return {
    success: true,
    prediction,
    source: 'local-algorithm'
  };
}

// GET /api/predictions/status
router.get('/status', async (req, res) => {
  let magayoStatus = 'unknown';
  let magayoMessage = '';
  let responseTime = null;
  
  try {
    const startTime = Date.now();
    const testUrl = `${MAGAYO_API_URL}?api_key=${MAGAYO_API_KEY}&game=us_powerball&tickets=1`;
    const response = await axios.get(testUrl, { timeout: 3000 });
    responseTime = Date.now() - startTime;
    
    if (response.data && response.data.error === 0) {
      magayoStatus = 'connected';
      magayoMessage = 'API is responding normally';
    } else {
      magayoStatus = 'error';
      magayoMessage = `API error code: ${response.data?.error || 'unknown'}`;
    }
  } catch (error) {
    magayoStatus = 'unavailable';
    magayoMessage = error.message;
  }

  res.json({
    success: true,
    status: {
      aiActive: true,
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      database: 'connected',
      magayoApi: {
        status: magayoStatus,
        message: magayoMessage,
        responseTime: responseTime ? `${responseTime}ms` : null,
        apiUrl: MAGAYO_API_URL,
        hasApiKey: !!MAGAYO_API_KEY && MAGAYO_API_KEY !== 'your-api-key-here'
      },
      fallbackAvailable: true
    }
  });
});

// GET /api/predictions/periods
router.get('/periods', (req, res) => {
  res.json({
    success: true,
    periods: [
      { value: '1week', label: '1 Week' },
      { value: '1month', label: '1 Month' },
      { value: '3months', label: '3 Months' },
      { value: 'all', label: 'All Data' }
    ]
  });
});

// GET /api/predictions/hot-cold/:gameType
router.get('/hot-cold/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;
    const { period = '1month' } = req.query;
    
    console.log('Hot-Cold request for:', gameType, 'period:', period);
    
    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type'
      });
    }

    const daysMap = {
      '1week': 7,
      '1month': 30,
      '3months': 90,
      'all': 365
    };
    
    const days = daysMap[period] || 30;
    const hotCold = await dbService.getHotColdNumbers(gameType, days);

    res.json({
      success: true,
      ...hotCold,
      period
    });
  } catch (error) {
    console.error('Error getting hot-cold numbers:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/predictions/frequency/:gameType
router.get('/frequency/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;
    const { period = '1month' } = req.query;
    
    console.log('Frequency request for:', gameType, 'period:', period);
    
    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type'
      });
    }

    const daysMap = {
      '1week': 7,
      '1month': 30,
      '3months': 90,
      'all': 365
    };
    
    const days = daysMap[period] || 30;
    const frequency = await dbService.getNumberFrequency(gameType, days);

    res.json({
      success: true,
      analysis: {
        hot: frequency.mainNumbers.slice(0, 10),
        cold: frequency.mainNumbers.slice(-10).reverse(),
        totalDrawsAnalyzed: frequency.totalDraws,
        period: frequency.period,
        dateRange: {
          from: frequency.startDate,
          to: frequency.endDate
        },
        bonusFrequency: frequency.bonusNumbers
      }
    });
  } catch (error) {
    console.error('Error getting frequency:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/predictions/past-7-days/:gameType
router.get('/past-7-days/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;
    
    console.log('=== PAST 7 DAYS ANALYSIS START ===');
    console.log('Game Type:', gameType);
    
    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type'
      });
    }

    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const todayStr = today.toISOString().split('T')[0];
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    console.log('Date range:', sevenDaysAgoStr, 'to', todayStr);

    const results = await db.LotteryResult.find({
      gameType: gameType,
      drawDate: {
        $gte: sevenDaysAgoStr,
        $lte: todayStr
      }
    }).sort({ drawDate: -1 });

    console.log('Results found:', results.length);

    if (results.length === 0) {
      console.log('No results in past 7 days, returning empty data');
      return res.json({
        success: true,
        message: 'No draws found in the past 7 days',
        totalDraws: 0,
        dateRange: {
          from: sevenDaysAgoStr,
          to: todayStr
        },
        topNumbers: []
      });
    }

    const frequencyMap = {};
    const maxNumber = gameType === '539' ? 39 : 49;
    
    for (let i = 1; i <= maxNumber; i++) {
      frequencyMap[i] = 0;
    }

    results.forEach(result => {
      if (result.numbers && Array.isArray(result.numbers)) {
        result.numbers.forEach(num => {
          if (frequencyMap[num] !== undefined) {
            frequencyMap[num]++;
          }
        });
      }
    });

    const topNumbers = Object.entries(frequencyMap)
      .map(([number, frequency]) => ({
        number: parseInt(number),
        frequency,
        percentage: ((frequency / results.length) * 100).toFixed(1)
      }))
      .filter(item => item.frequency > 0)
      .sort((a, b) => b.frequency - a.frequency);

    console.log('Top 5 numbers:', topNumbers.slice(0, 5).map(n => `${n.number}(${n.frequency})`).join(', '));

    res.json({
      success: true,
      totalDraws: results.length,
      dateRange: {
        from: sevenDaysAgoStr,
        to: todayStr
      },
      topNumbers,
      gameType
    });

    console.log('=== PAST 7 DAYS ANALYSIS END ===\n');
  } catch (error) {
    console.error('Error getting past 7 days analysis:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to analyze past 7 days data'
    });
  }
});

// GET /api/predictions/all-past-results/:gameType
router.get('/all-past-results/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;
    
    console.log('=== ALL PAST RESULTS ANALYSIS START ===');
    console.log('Game Type:', gameType);
    
    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type'
      });
    }

    const results = await db.LotteryResult.find({
      gameType: gameType
    }).sort({ drawDate: -1 });

    console.log('Total results found:', results.length);

    if (results.length === 0) {
      console.log('No results found, returning empty data');
      return res.json({
        success: true,
        message: 'No draws found in database',
        totalDraws: 0,
        dateRange: {
          from: null,
          to: null
        },
        topNumbers: []
      });
    }

    const dates = results.map(r => r.drawDate).filter(d => d);
    const oldestDate = dates[dates.length - 1];
    const newestDate = dates[0];

    console.log('Date range:', oldestDate, 'to', newestDate);

    const frequencyMap = {};
    const maxNumber = gameType === '539' ? 39 : 49;
    
    for (let i = 1; i <= maxNumber; i++) {
      frequencyMap[i] = 0;
    }

    results.forEach(result => {
      if (result.numbers && Array.isArray(result.numbers)) {
        result.numbers.forEach(num => {
          if (frequencyMap[num] !== undefined) {
            frequencyMap[num]++;
          }
        });
      }
    });

    const topNumbers = Object.entries(frequencyMap)
      .map(([number, frequency]) => ({
        number: parseInt(number),
        frequency,
        percentage: ((frequency / results.length) * 100).toFixed(1)
      }))
      .filter(item => item.frequency > 0)
      .sort((a, b) => b.frequency - a.frequency);

    console.log('Top 5 numbers:', topNumbers.slice(0, 5).map(n => `${n.number}(${n.frequency})`).join(', '));

    res.json({
      success: true,
      totalDraws: results.length,
      dateRange: {
        from: oldestDate,
        to: newestDate
      },
      topNumbers,
      gameType
    });

    console.log('=== ALL PAST RESULTS ANALYSIS END ===\n');
  } catch (error) {
    console.error('Error getting all past results analysis:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to analyze all past results'
    });
  }
});

// PUBLIC ROUTE - No admin authentication required
// GET /api/predictions/public-results/:gameType
router.get('/public-results/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;
    const { limit = 999999 } = req.query;
    
    console.log('Public results request for:', gameType);
    
    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type'
      });
    }
    
    const results = await db.LotteryResult.find({ gameType })
      .limit(parseInt(limit))
      .sort({ drawDate: -1 })
      .lean();
    
    console.log(`Found ${results.length} results for ${gameType}`);
    
    res.json({
      success: true,
      results: results.map(r => ({
        id: r._id,
        drawDate: r.drawDate,
        numbers: r.numbers,
        bonus: r.bonus
      })),
      totalCount: results.length
    });
  } catch (error) {
    console.error('Error fetching public results:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch results'
    });
  }
});

// POST /api/predictions/:gameType
router.post('/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;
    const { period = '1month', extended = false } = req.body;
    
    console.log('Prediction request for gameType:', gameType);
    console.log('Period:', period, 'Extended:', extended);

    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      console.log('Invalid game type received:', gameType);
      return res.status(400).json({
        success: false,
        error: `Invalid game type: ${gameType}. Must be 539, mark6, or lotto649`
      });
    }

    const daysMap = {
      '1week': 7,
      '1month': 30,
      '3months': 90,
      'all': 365
    };
    
    const days = daysMap[period] || 30;
    const frequency = await dbService.getNumberFrequency(gameType, days);
    
    let predictionResult;
    let predictionSource;

    const magayoResult = await getMagayoPrediction(gameType, period, extended);
    
    if (magayoResult.success) {
      predictionResult = magayoResult.prediction;
      predictionSource = 'magayo-api';
      console.log('Using Magayo API prediction');
    } else {
      console.log('Magayo API failed, falling back to local algorithm');
      const localResult = await getLocalPrediction(gameType, period, extended, frequency);
      predictionResult = localResult.prediction;
      predictionSource = 'local-algorithm';
    }

    if (!predictionResult.metadata) {
      predictionResult.metadata = {};
    }
    predictionResult.metadata.predictionSource = predictionSource;
    predictionResult.metadata.fallbackUsed = predictionSource === 'local-algorithm';

    if (req.session?.user) {
      await dbService.savePrediction({
        user_id: req.session.user.id,
        game_type: gameType,
        predicted_numbers: predictionResult.numbers,
        bonus_prediction: predictionResult.bonus,
        confidence_score: predictionResult.confidence,
        algorithms_used: predictionResult.algorithms || ['AI'],
        analysis_period: period,
        prediction_type: extended ? 'extended' : 'standard',
        metadata: predictionResult.metadata
      });
    }

    console.log('Generated prediction:', predictionResult.numbers, 'from', predictionSource);

    res.json({
      success: true,
      prediction: predictionResult
    });
  } catch (error) {
    console.error('Error generating prediction:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/predictions/:gameType/automation
router.post('/:gameType/automation', async (req, res) => {
  try {
    const { gameType } = req.params;
    const { period = '1month', multiplier = 1 } = req.body;
    
    console.log('Automation request for:', gameType, 'multiplier:', multiplier);
    
    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type'
      });
    }
    
    const daysMap = {
      '1week': 7,
      '1month': 30,
      '3months': 90,
      'all': 365
    };
    
    const days = daysMap[period] || 30;
    const frequency = await dbService.getNumberFrequency(gameType, days);
    
    const allNumbers = [];
    for (let i = 0; i < multiplier; i++) {
      frequency.mainNumbers.forEach(f => {
        for (let j = 0; j < f.frequency; j++) {
          allNumbers.push(f.number);
        }
      });
    }
    
    const finalFrequency = {};
    allNumbers.forEach(num => {
      finalFrequency[num] = (finalFrequency[num] || 0) + 1;
    });
    
    const topNumbers = Object.entries(finalFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([num]) => parseInt(num));

    res.json({
      success: true,
      results: {
        topNumbers,
        iterations: multiplier,
        frequencyData: Object.entries(finalFrequency)
          .map(([num, freq]) => ({ number: parseInt(num), frequency: freq }))
          .sort((a, b) => b.frequency - a.frequency),
        metadata: {
          totalIterations: multiplier,
          successfulIterations: multiplier,
          timestamp: new Date().toISOString(),
          period
        }
      }
    });
  } catch (error) {
    console.error('Error in automation:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/predictions/history
router.get('/history', async (req, res) => {
  try {
    if (!req.session?.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    const { gameType, limit = 10 } = req.query;
    
    const predictions = await dbService.getUserPredictions(
      req.session.user.id,
      { limit: parseInt(limit), gameType }
    );
    
    res.json({
      success: true,
      predictions
    });
  } catch (error) {
    console.error('Error getting prediction history:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;