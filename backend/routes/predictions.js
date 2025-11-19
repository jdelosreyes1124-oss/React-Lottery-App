const express = require('express');
const router = express.Router();
const dbService = require('../services/databaseService');
const db = require('../models_mongoose');
const axios = require('axios');

// Magayo API Configuration
const MAGAYO_API_URL = process.env.MAGAYO_API_URL || 'https://www.magayo.com/api/tickets.php';
const MAGAYO_API_KEY = process.env.MAGAYO_API_KEY || 'xgvyUbyjQVSBtrHpXA';
const MAGAYO_TIMEOUT = 5000;

const GAME_CODE_MAP = {
  '539': 'tw_daily',
  'mark6': 'hk_mark6',
  'lotto649': 'tw_lotto'
};

// Helper Function: Call Magayo API
async function getMagayoPrediction(gameType, period, extended = false) {
  try {
    console.log('\n📄 [MAGAYO] Attempting to get prediction from Magayo API...');
    console.log(`📊 [MAGAYO] Game Type: ${gameType}, Period: ${period}, Extended: ${extended}`);
    
    const magayoGameCode = GAME_CODE_MAP[gameType];
    if (!magayoGameCode) {
      throw new Error(`No Magayo game code mapping for ${gameType}`);
    }

    console.log(`🎮 [MAGAYO] Using game code: ${magayoGameCode}`);

    const apiUrl = `${MAGAYO_API_URL}?api_key=${MAGAYO_API_KEY}&game=${magayoGameCode}&tickets=1`;
    
    const startTime = Date.now();
    const response = await axios.get(apiUrl, {
      timeout: MAGAYO_TIMEOUT
    });
    const responseTime = Date.now() - startTime;
    
    console.log(`⏱️  [MAGAYO] Response received in ${responseTime}ms`);

    if (response.data.error && response.data.error > 0) {
      throw new Error(`Magayo API error code: ${response.data.error}`);
    }

    if (response.data && response.data.tickets && response.data.tickets.length > 0) {
      const ticketString = response.data.tickets[0].ticket;
      console.log(`🎫 [MAGAYO] Ticket received: ${ticketString}`);
      
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

      console.log(`✅ [MAGAYO] Successfully parsed prediction`);
      console.log(`🔢 [MAGAYO] Numbers: [${numbers.sort((a, b) => a - b).join(', ')}]`);
      if (bonus !== null) {
        console.log(`🎁 [MAGAYO] Bonus: ${bonus}`);
      }
      
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
          source: 'magayo-api',
          responseTime: `${responseTime}ms`
        }
      };

      // CRITICAL FIX: For games with bonus numbers, ensure bonus is always set
      if (bonus !== null) {
        prediction.bonus = bonus;
      } else if (gameType === 'mark6' || gameType === 'lotto649') {
        // If Magayo didn't provide bonus but game needs one, generate it
        const maxNum = 49;
        let generatedBonus;
        do {
          generatedBonus = Math.floor(Math.random() * maxNum) + 1;
        } while (numbers.includes(generatedBonus));
        prediction.bonus = generatedBonus;
        console.log(`🎁 [MAGAYO] Generated bonus (not in API response): ${generatedBonus}`);
      }

      console.log(`✅ [MAGAYO] SUCCESS - Prediction ready for use\n`);

      return {
        success: true,
        prediction,
        source: 'magayo-api'
      };
    }

    throw new Error('Invalid response format from Magayo API');
  } catch (error) {
    console.log(`❌ [MAGAYO] FAILED - ${error.message}`);
    console.log(`⚠️  [MAGAYO] Will fallback to local algorithm\n`);
    return {
      success: false,
      error: error.message,
      source: 'magayo-api'
    };
  }
}

// Helper Function: Local Algorithm Prediction
async function getLocalPrediction(gameType, period, extended = false, frequency) {
  console.log('\n🔄 [LOCAL] Using local algorithm for prediction...');
  console.log(`📊 [LOCAL] Game Type: ${gameType}, Period: ${period}, Extended: ${extended}`);
  
const gameConfig = {
  '539': { numbers: 8, max: 39, hasBonus: false },  // Always 8 numbers
  'mark6': { numbers: 6, max: 49, hasBonus: true },
  'lotto649': { numbers: 6, max: 49, hasBonus: true }
};
  
  const config = gameConfig[gameType];
  const numbers = [];
  
  // Create a pool of ALL numbers with weights
  const allNumbers = [];
  for (let i = 1; i <= config.max; i++) {
    // Find frequency for this number
    const freqData = frequency.mainNumbers.find(f => f.number === i);
    const weight = freqData ? freqData.count : 1; // Use count if available, else 1
    allNumbers.push({ number: i, weight });
  }
  
  // Sort by weight for weighted selection
  allNumbers.sort((a, b) => b.weight - a.weight);
  
  console.log(`📈 [LOCAL] Loaded frequency data from ${frequency.totalDraws} draws`);
  
  // Select numbers with weighted probability
  while (numbers.length < config.numbers) {
    // Use power function for weighted selection (higher weight = higher chance)
    const weightedIndex = Math.floor(Math.pow(Math.random(), 2) * allNumbers.length);
    const selected = allNumbers[weightedIndex];
    
    if (!numbers.includes(selected.number)) {
      numbers.push(selected.number);
    }
  }
  
  numbers.sort((a, b) => a - b);

  console.log(`🔢 [LOCAL] Generated numbers: [${numbers.join(', ')}]`);

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

  if (prediction.bonus) {
    console.log(`🎁 [LOCAL] Bonus: ${prediction.bonus}`);
  }

  console.log(`✅ [LOCAL] SUCCESS - Prediction ready\n`);

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
  
  console.log('\n📡 [STATUS] Checking Magayo API status...');
  
  try {
    const startTime = Date.now();
    const testUrl = `${MAGAYO_API_URL}?api_key=${MAGAYO_API_KEY}&game=us_powerball&tickets=1`;
    const response = await axios.get(testUrl, { timeout: 3000 });
    responseTime = Date.now() - startTime;
    
    console.log(`⏱️  [STATUS] Response time: ${responseTime}ms`);
    
    if (response.data && response.data.error === 0) {
      magayoStatus = 'connected';
      magayoMessage = 'API is responding normally';
      console.log(`✅ [STATUS] Magayo API is CONNECTED`);
    } else {
      magayoStatus = 'error';
      magayoMessage = `API error code: ${response.data?.error || 'unknown'}`;
      console.log(`⚠️  [STATUS] Magayo API returned error: ${magayoMessage}`);
    }
  } catch (error) {
    magayoStatus = 'unavailable';
    magayoMessage = error.message;
    console.log(`❌ [STATUS] Magayo API is UNAVAILABLE: ${error.message}`);
  }

  console.log('');

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
      ...frequency,
      period
    });
  } catch (error) {
    console.error('Error getting frequency data:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/predictions/patterns/:gameType
router.get('/patterns/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;
    const { period = '1month' } = req.query;
    
    console.log('Patterns request for:', gameType, 'period:', period);
    
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
    const patterns = await dbService.getPatterns(gameType, days);
    
    res.json({
      success: true,
      ...patterns,
      period
    });
  } catch (error) {
    console.error('Error getting patterns:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/predictions/due-numbers/:gameType
router.get('/due-numbers/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;
    
    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type'
      });
    }

    const dueNumbers = await dbService.getDueNumbers(gameType, 10);
    
    res.json({
      success: true,
      dueNumbers
    });
  } catch (error) {
    console.error('Error getting due numbers:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/predictions/consecutive-patterns/:gameType
router.get('/consecutive-patterns/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;
    const { period = '1month' } = req.query;
    
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
    const patterns = await dbService.getConsecutivePatterns(gameType, days);
    
    res.json({
      success: true,
      ...patterns,
      period
    });
  } catch (error) {
    console.error('Error getting consecutive patterns:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/predictions/sum-range/:gameType
router.get('/sum-range/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;
    const { period = '1month' } = req.query;
    
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
    const sumRange = await dbService.getSumRangeAnalysis(gameType, days);
    
    res.json({
      success: true,
      ...sumRange,
      period
    });
  } catch (error) {
    console.error('Error getting sum range analysis:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/predictions/gap-analysis/:gameType
router.get('/gap-analysis/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;
    const { period = '1month' } = req.query;
    
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
    const gapAnalysis = await dbService.getGapAnalysis(gameType, days);
    
    res.json({
      success: true,
      ...gapAnalysis,
      period
    });
  } catch (error) {
    console.error('Error getting gap analysis:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/predictions/statistical-analysis/:gameType
router.get('/statistical-analysis/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;
    const { period = '1month' } = req.query;
    
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
    const stats = await dbService.getStatisticalAnalysis(gameType, days);
    
    res.json({
      success: true,
      ...stats,
      period
    });
  } catch (error) {
    console.error('Error getting statistical analysis:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/predictions/public/results/:gameType
router.get('/public/results/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;
    const { limit = 10 } = req.query;
    
    console.log('Public results request for:', gameType, 'limit:', limit);
    
    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type'
      });
    }
    
    const modelMap = {
      '539': db.LotteryResult539,
      'mark6': db.LotteryResultMark6,
      'lotto649': db.LotteryResultLotto649
    };
    
    const Model = modelMap[gameType];
    const results = await Model.find()
      .sort({ drawDate: -1 })
      .limit(parseInt(limit))
      .select('drawDate numbers bonus');
    
    res.json({
      success: true,
      gameType,
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
    
    console.log('\n');
    console.log('═'.repeat(60));
    console.log('🎯 PREDICTION REQUEST START');
    console.log('═'.repeat(60));
    console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
    console.log(`🎮 Game Type: ${gameType}`);
    console.log(`📅 Period: ${period}`);
    console.log(`📊 Extended: ${extended}`);
    console.log('');

    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      console.log(`❌ Invalid game type received: ${gameType}`);
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
    console.log(`📈 Loading frequency data for last ${days} days...`);
    const frequency = await dbService.getNumberFrequency(gameType, days);
    console.log(`✅ Frequency data loaded: ${frequency.totalDraws} draws`);
    console.log('');
    
    let predictionResult;
    let predictionSource;

    // Try Magayo API first
    const magayoResult = await getMagayoPrediction(gameType, period, extended);
    
    if (magayoResult.success) {
      predictionResult = magayoResult.prediction;
      predictionSource = 'magayo-api';
      console.log(`✅ PREDICTION SOURCE: MAGAYO API`);
    } else {
      console.log(`⚠️  PREDICTION SOURCE: LOCAL ALGORITHM (Magayo fallback)`);
      const localResult = await getLocalPrediction(gameType, period, extended, frequency);
      predictionResult = localResult.prediction;
      predictionSource = 'local-algorithm';
    }

    if (!predictionResult.metadata) {
      predictionResult.metadata = {};
    }
    predictionResult.metadata.predictionSource = predictionSource;
    predictionResult.metadata.fallbackUsed = predictionSource === 'local-algorithm';

    // Save to database if user is logged in
    if (req.session?.user) {
      console.log(`💾 Saving prediction to database for user: ${req.session.user.id}`);
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
      console.log(`✅ Prediction saved successfully`);
    }

    console.log('');
    console.log(`📊 FINAL PREDICTION`);
    console.log(`   Numbers: [${predictionResult.numbers.join(', ')}]`);
    if (predictionResult.bonus) {
      console.log(`   Bonus: ${predictionResult.bonus}`);
    }
    console.log(`   Confidence: ${(predictionResult.confidence * 100).toFixed(1)}%`);
    console.log(`   Source: ${predictionSource}`);
    console.log('');
    console.log('═'.repeat(60));
    console.log('🎯 PREDICTION REQUEST END');
    console.log('═'.repeat(60));
    console.log('');

    res.json({
      success: true,
      prediction: predictionResult
    });
  } catch (error) {
    console.error('❌ Error generating prediction:', error);
    console.log('═'.repeat(60));
    console.log('');
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
    const { period = '1month', iterations = 1000 } = req.body;
    
    console.log('\n');
    console.log('═'.repeat(60));
    console.log('🤖 AUTOMATION REQUEST START');
    console.log('═'.repeat(60));
    console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
    console.log(`🎮 Game Type: ${gameType}`);
    console.log(`🔄 Iterations: ${iterations}`);
    console.log(`📅 Period: ${period}`);
    console.log('');
    
    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type'
      });
    }
    
    // Game configuration
    const gameConfig = {
      '539': { numbersPerDraw: 8, maxNumber: 39, hasBonus: false },  // Changed from 5 to 8
      'mark6': { numbersPerDraw: 6, maxNumber: 49, hasBonus: true },
      'lotto649': { numbersPerDraw: 6, maxNumber: 49, hasBonus: true }
    };
    
    const config = gameConfig[gameType];
    
    // Get frequency data
    const daysMap = {
      '1week': 7,
      '1month': 30,
      '3months': 90,
      'all': 365
    };
    
    const days = daysMap[period] || 30;
    console.log(`📈 Loading frequency data...`);
    const frequency = await dbService.getNumberFrequency(gameType, days);
    
    console.log(`✅ Frequency data loaded: ${frequency.totalDraws} draws analyzed`);
    console.log('');
    
    // Generate unique combinations
    const combinations = new Set();
    const frequencyTracker = {};
    
    // Initialize frequency tracker for ALL numbers
    for (let i = 1; i <= config.maxNumber; i++) {
      frequencyTracker[i] = 0;
    }
    
    // Create a weighted pool of ALL numbers (1 to maxNumber)
    const createWeightedPool = () => {
      const pool = [];
      
      // Add all numbers with their weights
      for (let num = 1; num <= config.maxNumber; num++) {
        // Find frequency data for this number
        const freqData = frequency.mainNumbers.find(f => f.number === num);
        const weight = freqData ? Math.max(freqData.count, 1) : 1;
        
        // Add the number to pool based on weight
        for (let w = 0; w < weight; w++) {
          pool.push(num);
        }
      }
      
      return pool;
    };
    
    // Generate combinations using weighted random selection
    let attempts = 0;
    const maxAttempts = iterations * 10;
    
    console.log(`🔄 Generating ${iterations} unique combinations...`);
    
    while (combinations.size < iterations && attempts < maxAttempts) {
      attempts++;
      
      const numbers = [];
      const weightedPool = createWeightedPool();
      const usedIndices = new Set();
      
      // Select numbers from the weighted pool
      while (numbers.length < config.numbersPerDraw) {
        const poolIndex = Math.floor(Math.pow(Math.random(), 1.5) * weightedPool.length);
        
        if (!usedIndices.has(poolIndex)) {
          usedIndices.add(poolIndex);
          const selectedNumber = weightedPool[poolIndex];
          
          if (!numbers.includes(selectedNumber)) {
            numbers.push(selectedNumber);
          }
        }
        
        // Fallback if we're stuck
        if (usedIndices.size > weightedPool.length * 0.8) {
          const randomNum = Math.floor(Math.random() * config.maxNumber) + 1;
          if (!numbers.includes(randomNum)) {
            numbers.push(randomNum);
          }
        }
      }
      
      // Sort and create combination string
      numbers.sort((a, b) => a - b);
      const combinationKey = numbers.join(',');
      
      // Add to set if unique
      if (!combinations.has(combinationKey)) {
        combinations.add(combinationKey);
        
        // Track frequency
        numbers.forEach(num => {
          frequencyTracker[num]++;
        });
      }
    }
    
    console.log(`✅ Generated ${combinations.size} unique combinations`);
    console.log(`📊 Total attempts: ${attempts}`);
    console.log('');
    
    // Convert frequency tracker to sorted array
    const frequencyData = Object.entries(frequencyTracker)
      .map(([num, freq]) => ({
        number: parseInt(num),
        frequency: freq,
        percentage: ((freq / combinations.size) * 100).toFixed(1)
      }))
      .filter(item => item.frequency > 0)
      .sort((a, b) => b.frequency - a.frequency);
    
    // Get top numbers
    const topNumbers = frequencyData.slice(0, 10).map(item => item.number);
    
    console.log(`🔢 Top 10 numbers: [${topNumbers.join(', ')}]`);
    console.log(`📊 Total unique numbers used: ${frequencyData.length}`);
    console.log(`📈 Number range: ${Math.min(...frequencyData.map(d => d.number))} to ${Math.max(...frequencyData.map(d => d.number))}`);
    console.log('');
    console.log('═'.repeat(60));
    console.log('🤖 AUTOMATION REQUEST END');
    console.log('═'.repeat(60));
    console.log('');
    
    res.json({
      success: true,
      totalIterations: iterations,
      uniqueCombinations: combinations.size,
      topNumbers,
      frequencyData,
      metadata: {
        totalIterations: iterations,
        uniqueCombinations: combinations.size,
        successfulIterations: combinations.size,
        timestamp: new Date().toISOString(),
        period,
        gameType,
        analysisSource: frequency.totalDraws > 0 ? 'database' : 'random',
        numberRange: {
          min: Math.min(...frequencyData.map(d => d.number)),
          max: Math.max(...frequencyData.map(d => d.number)),
          totalUniqueNumbers: frequencyData.length
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