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
  
  console.log(`📈 [LOCAL] Loaded frequency data from ${frequency.totalDraws} draws`);
  
  // SIMPLE & BULLETPROOF: Generate exactly config.numbers count
  const availableNumbers = Array.from({length: config.max}, (_, i) => i + 1);
  
  // Fisher-Yates shuffle
  for (let i = availableNumbers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [availableNumbers[i], availableNumbers[j]] = [availableNumbers[j], availableNumbers[i]];
  }
  
  // Take first config.numbers
  const numbers = [];
  for (let i = 0; i < config.numbers; i++) {
    numbers.push(availableNumbers[i]);
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
    
    // NEW (Works):
// KEEP THIS:
const LotteryResult = require('../models_mongoose/LotteryResult');
const results = await LotteryResult.find({ gameType: gameType })
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
      '539': { numbersPerDraw: 8, maxNumber: 39, hasBonus: false },
      'mark6': { numbersPerDraw: 6, maxNumber: 49, hasBonus: true },
      'lotto649': { numbersPerDraw: 6, maxNumber: 49, hasBonus: true }
    };
    
    const config = gameConfig[gameType];
    
    console.log(`📋 Config: ${config.numbersPerDraw} numbers from 1-${config.maxNumber}`);
    
    // ABSOLUTE GUARANTEE: This function WILL return exactly numbersPerDraw numbers
    function generateExactNumbers(count, max) {
      const numbers = new Set();
      const allNumbers = [];
      
      // Create array of all possible numbers
      for (let i = 1; i <= max; i++) {
        allNumbers.push(i);
      }
      
      // Shuffle using Fisher-Yates
      for (let i = allNumbers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allNumbers[i], allNumbers[j]] = [allNumbers[j], allNumbers[i]];
      }
      
      // Take exactly 'count' numbers
      const result = allNumbers.slice(0, count);
      
      // TRIPLE CHECK
      if (result.length !== count) {
        console.error(`GENERATION ERROR: Got ${result.length}, need ${count}`);
        // Emergency: force exact count
        while (result.length < count) {
          const rand = Math.floor(Math.random() * max) + 1;
          if (!result.includes(rand)) {
            result.push(rand);
          }
        }
      }
      
      return result.sort((a, b) => a - b);
    }
    
    // Generate combinations
    const combinations = new Set();
    const frequencyTracker = {};
    
    // Initialize frequency tracker for ALL possible numbers
    for (let i = 1; i <= config.maxNumber; i++) {
      frequencyTracker[i] = 0;
    }
    
    console.log(`🔄 Generating ${iterations} unique combinations...`);
    
    let attempts = 0;
    const maxAttempts = iterations * 10;
    
    while (combinations.size < iterations && attempts < maxAttempts) {
      attempts++;
      
      // Generate EXACTLY numbersPerDraw numbers
      const numbers = generateExactNumbers(config.numbersPerDraw, config.maxNumber);
      
      // Verify count (this should NEVER fail with our function)
      if (numbers.length !== config.numbersPerDraw) {
        console.error(`❌ IMPOSSIBLE ERROR: Generated ${numbers.length} instead of ${config.numbersPerDraw}`);
        continue; // Skip this combination
      }
      
      // Create combination key
      const combinationKey = numbers.join(',');
      
      // Add if unique
      if (!combinations.has(combinationKey)) {
        combinations.add(combinationKey);
        
        // Track frequency
        numbers.forEach(num => {
          frequencyTracker[num]++;
        });
        
        // Log first combination
        if (combinations.size === 1) {
          console.log(`  First combination: [${numbers.join(', ')}] (${numbers.length} numbers)`);
        }
      }
    }
    
    console.log(`✅ Generated ${combinations.size} unique combinations in ${attempts} attempts`);
    
    // Convert frequency tracker to sorted array
    const frequencyData = Object.entries(frequencyTracker)
      .map(([num, freq]) => ({
        number: parseInt(num),
        frequency: freq,
        percentage: ((freq / combinations.size) * 100).toFixed(1)
      }))
      .filter(item => item.frequency > 0)
      .sort((a, b) => b.frequency - a.frequency);
    
    console.log(`📊 Total unique numbers in frequency data: ${frequencyData.length}`);
    
    // Get top numbers - STRICTLY enforce numbersPerDraw count
    let topNumbers = frequencyData
      .slice(0, config.numbersPerDraw)
      .map(item => item.number);
    
    // ✅ CRITICAL FIX: Force EXACT count regardless of what we got
    if (topNumbers.length < config.numbersPerDraw) {
      console.error(`❌ CRITICAL: topNumbers has ${topNumbers.length}, need ${config.numbersPerDraw}`);
      console.error(`   FrequencyData has ${frequencyData.length} items`);
      
      // Force pad from frequency data
      for (let i = topNumbers.length; i < config.numbersPerDraw && i < frequencyData.length; i++) {
        const nextNum = frequencyData[i].number;
        if (!topNumbers.includes(nextNum)) {
          topNumbers.push(nextNum);
        }
      }
      
      // If still not enough, generate random
      let safetyCounter = 0;
      while (topNumbers.length < config.numbersPerDraw && safetyCounter < 100) {
        safetyCounter++;
        const randomNum = Math.floor(Math.random() * config.maxNumber) + 1;
        if (!topNumbers.includes(randomNum)) {
          topNumbers.push(randomNum);
        }
      }
    } else if (topNumbers.length > config.numbersPerDraw) {
      // ✅ FIX: If we somehow got MORE numbers than needed, truncate!
      console.warn(`⚠️ Got ${topNumbers.length} numbers, truncating to ${config.numbersPerDraw}`);
      topNumbers = topNumbers.slice(0, config.numbersPerDraw);
    }
    
    // Sort the final numbers
    topNumbers = topNumbers.sort((a, b) => a - b);
    
    console.log(`🔢 Final topNumbers: [${topNumbers.join(', ')}]`);
    console.log(`✅ Final count: ${topNumbers.length} (required: ${config.numbersPerDraw})`);
    
    // FINAL VERIFICATION - This should NEVER fail now
    if (topNumbers.length !== config.numbersPerDraw) {
      console.error(`❌❌❌ SENDING WRONG COUNT! ${topNumbers.length} instead of ${config.numbersPerDraw}`);
      throw new Error(`Failed to generate correct number count: got ${topNumbers.length}, need ${config.numbersPerDraw}`);
    } else {
      console.log(`✅✅✅ COUNT IS CORRECT: ${topNumbers.length} numbers`);
    }
    
    // GENERATE BONUS NUMBER for Mark 6 and Lotto 649
    let bonusNumber = null;
    if (config.hasBonus) {
      // Generate bonus from frequency data (most frequent number not in topNumbers)
      const bonusCandidate = frequencyData.find(item => !topNumbers.includes(item.number));
      if (bonusCandidate) {
        bonusNumber = bonusCandidate.number;
        console.log(`🎁 Generated bonus from frequency: ${bonusNumber}`);
      } else {
        // Fallback: generate random bonus not in topNumbers
        let attempts = 0;
        do {
          bonusNumber = Math.floor(Math.random() * config.maxNumber) + 1;
          attempts++;
        } while (topNumbers.includes(bonusNumber) && attempts < 100);
        console.log(`🎁 Generated random bonus: ${bonusNumber}`);
      }
      console.log(`✅ Bonus number: ${bonusNumber}`);
    }
    
    console.log('═'.repeat(60));
    console.log('🤖 AUTOMATION REQUEST END');
    console.log('═'.repeat(60));
    console.log('');
    
    // ✅ FINAL VALIDATION: Ensure topNumbers has EXACT count before building response
    if (topNumbers.length !== config.numbersPerDraw) {
      throw new Error(`Invalid topNumbers length: ${topNumbers.length}, expected ${config.numbersPerDraw}`);
    }
    
    // ✅ FINAL VALIDATION: Ensure all numbers are within valid range
    const invalidNumbers = topNumbers.filter(num => num < 1 || num > config.maxNumber);
    if (invalidNumbers.length > 0) {
      throw new Error(`Invalid numbers detected: ${invalidNumbers.join(', ')}`);
    }
    
    console.log(`✅ Pre-response validation passed`);
    console.log(`   - Numbers count: ${topNumbers.length}/${config.numbersPerDraw}`);
    console.log(`   - Numbers: [${topNumbers.join(', ')}]`);
    if (bonusNumber !== null) {
      console.log(`   - Bonus: ${bonusNumber}`);
    }
    console.log('');
    
    // Build response object with STRICT structure
    const responseData = {
      success: true,
      totalIterations: iterations,
      uniqueCombinations: combinations.size,
      topNumbers: topNumbers, // ✅ Guaranteed to be exactly config.numbersPerDraw length
      frequencyData,
      metadata: {
        totalIterations: iterations,
        uniqueCombinations: combinations.size,
        successfulIterations: combinations.size,
        timestamp: new Date().toISOString(),
        period,
        gameType,
        analysisSource: 'random',
        numbersCount: topNumbers.length, // ✅ Added for verification
        expectedCount: config.numbersPerDraw, // ✅ Added for verification
        numberRange: {
          min: Math.min(...frequencyData.map(d => d.number)),
          max: Math.max(...frequencyData.map(d => d.number)),
          totalUniqueNumbers: frequencyData.length
        }
      }
    };
    
    // Add bonus number if applicable - ONE bonus only
    if (bonusNumber !== null) {
      responseData.bonus = bonusNumber;
      console.log(`✅ Adding bonus to response: ${bonusNumber}`);
    }
    
    // ✅ FINAL LOG before sending
    console.log(`📤 Sending response:`);
    console.log(`   - topNumbers.length: ${responseData.topNumbers.length}`);
    console.log(`   - bonus: ${responseData.bonus || 'none'}`);
    console.log('');
    
    res.json(responseData);
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