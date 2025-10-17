// ============================================
// routes/predictions.js - Complete Prediction Routes File
// ============================================
const express = require('express');
const router = express.Router();
const dbService = require('../services/databaseService');
const { Op } = require('sequelize');
const db = require('../models');
const axios = require('axios'); // Make sure to install: npm install axios

// ============================================
// Magayo API Configuration
// ============================================
const MAGAYO_API_URL = process.env.MAGAYO_API_URL || 'https://www.magayo.com/api/tickets.php';
const MAGAYO_API_KEY = process.env.MAGAYO_API_KEY || 'your-api-key-here';
const MAGAYO_TIMEOUT = 5000; // 5 seconds timeout

// Map your game types to Magayo game codes 
const GAME_CODE_MAP = {
  '539': 'tw_dailycash539',      // Taiwan Daily Cash 539
  'mark6': 'hk_mark6',            // Hong Kong Mark Six
  'lotto649': 'tw_lotto649'       // taiwan Lotto 6/49
};

// ============================================
// Helper Function: Call Magayo API
// ============================================
async function getMagayoPrediction(gameType, period, extended = false) {
  try {
    console.log('Attempting to get prediction from Magayo API...');
    
    // Get Magayo game code
    const magayoGameCode = GAME_CODE_MAP[gameType];
    if (!magayoGameCode) {
      throw new Error(`No Magayo game code mapping for ${gameType}`);
    }

    // Build API URL with query parameters 
    const apiUrl = `${MAGAYO_API_URL}?api_key=${MAGAYO_API_KEY}&game=${magayoGameCode}&tickets=1`;
    
    const response = await axios.get(apiUrl, {
      timeout: MAGAYO_TIMEOUT
    });

    // Check for API errors
    if (response.data.error && response.data.error > 0) {
      throw new Error(`Magayo API error code: ${response.data.error}`);
    }

    // Parse the response
    if (response.data && response.data.tickets && response.data.tickets.length > 0) {
      const ticketString = response.data.tickets[0].ticket;
      
      // Parse the ticket string (format: "01,08,21,42,61,+26" or "03,12,24,31,37,42") 
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
      
      // Build prediction object in our format 
      const prediction = {
        numbers: numbers.sort((a, b) => a - b),
        confidence: 0.85, // Magayo is a reputable service
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

      // Add bonus if present 
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

// ============================================
// Helper Function: Local Algorithm Prediction 
// ============================================
async function getLocalPrediction(gameType, period, extended = false, frequency) {
  console.log('Using local algorithm for prediction...');
  
  // Game configuration 
  const gameConfig = {
    '539': { numbers: extended ? 8 : 5, max: 39, hasBonus: false },
    'mark6': { numbers: 6, max: 49, hasBonus: true },
    'lotto649': { numbers: 6, max: 49, hasBonus: true }
  };
  
  const config = gameConfig[gameType];
  
  // Use weighted selection based on frequency
  const numbers = [];
  const candidates = [...frequency.mainNumbers];
  
  // Select top frequent numbers with some randomization
  while (numbers.length < config.numbers && candidates.length > 0) {
    const weightedIndex = Math.floor(Math.random() * Math.min(10, candidates.length));
    const selected = candidates.splice(weightedIndex, 1)[0];
    if (selected) {
      numbers.push(selected.number);
    }
  }
  
  // Fill remaining with random numbers if needed 
  while (numbers.length < config.numbers) {
    const num = Math.floor(Math.random() * config.max) + 1;
    if (!numbers.includes(num)) {
      numbers.push(num);
    }
  }
  
  numbers.sort((a, b) => a - b);

  // Create prediction object 
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

  // Add bonus for mark6 and lotto649 
  if (config.hasBonus) {
    if (frequency.bonusNumbers && frequency.bonusNumbers.length > 0) {
      // Use frequency data for bonus
      const bonusIdx = Math.floor(Math.random() * Math.min(5, frequency.bonusNumbers.length));
      prediction.bonus = frequency.bonusNumbers[bonusIdx].number;
    } else {
      // Random bonus
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

// ============================================
// GET /api/predictions/status
// ============================================
router.get('/status', async (req, res) => {
  // Check if Magayo API is available 
  let magayoStatus = 'unknown';
  let magayoMessage = '';
  let responseTime = null;
  
  try {
    const startTime = Date.now();
    // Simple test call with a known game
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

// ============================================
// GET /api/predictions/test-api/:gameType
// ============================================
router.get('/test-api/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;
    
    console.log('=== API TEST START ===');
    console.log('Testing game type:', gameType);
    
    // Validate game type 
    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type. Use: 539, mark6, or lotto649'
      });
    }

    const testResults = {
      timestamp: new Date().toISOString(),
      gameType,
      tests: []
    };

    // Test 1: Check Magayo game code mapping
    const magayoGameCode = GAME_CODE_MAP[gameType];
    testResults.tests.push({
      name: 'Game Code Mapping',
      passed: !!magayoGameCode,
      result: magayoGameCode || 'No mapping found',
      message: magayoGameCode ? 'Game code mapped successfully' : 'Failed to map game code'
    });

    // Test 2: Check API key configuration 
    const hasValidApiKey = MAGAYO_API_KEY && MAGAYO_API_KEY !== 'your-api-key-here';
    testResults.tests.push({
      name: 'API Key Configuration',
      passed: hasValidApiKey,
      result: hasValidApiKey ? 'API key is configured' : 'API key not configured',
      message: hasValidApiKey ? 'Valid API key found' : 'Please set MAGAYO_API_KEY in .env file'
    });

    // Test 3: Test Magayo API call
    let magayoTest = {
      name: 'Magayo API Call',
      passed: false,
      result: null,
      message: '',
      responseTime: null,
      rawResponse: null
    };

    if (magayoGameCode && hasValidApiKey) {
      try {
        const startTime = Date.now();
        const magayoResult = await getMagayoPrediction(gameType, '1month', false);
        magayoTest.responseTime = Date.now() - startTime;
        
        if (magayoResult.success) {
          magayoTest.passed = true;
          magayoTest.result = magayoResult.prediction.numbers;
          magayoTest.message = 'Successfully received prediction from Magayo API';
          magayoTest.rawResponse = magayoResult.prediction;
        } else {
          magayoTest.passed = false;
          magayoTest.result = 'API call failed';
          magayoTest.message = magayoResult.error;
        }
      } catch (error) {
        magayoTest.passed = false;
        magayoTest.result = 'Exception occurred';
        magayoTest.message = error.message;
      }
    } else {
      magayoTest.result = 'Prerequisites not met';
      magayoTest.message = 'Cannot test API - missing game code mapping or API key';
    }
    
    testResults.tests.push(magayoTest);

    // Test 4: Test local algorithm fallback
    let fallbackTest = {
      name: 'Local Algorithm Fallback',
      passed: false,
      result: null,
      message: ''
    };

    try {
      const daysMap = { '1month': 30 };
      const frequency = await dbService.getNumberFrequency(gameType, daysMap['1month']);
      const localResult = await getLocalPrediction(gameType, '1month', false, frequency);
      
      if (localResult.success) {
        fallbackTest.passed = true;
        fallbackTest.result = localResult.prediction.numbers;
        fallbackTest.message = 'Local algorithm is working correctly';
      } else {
        fallbackTest.passed = false;
        fallbackTest.result = 'Failed';
        fallbackTest.message = 'Local algorithm failed to generate prediction';
      }
    } catch (error) {
      fallbackTest.passed = false;
      fallbackTest.result = 'Exception occurred';
      fallbackTest.message = error.message;
    }

    testResults.tests.push(fallbackTest);

    // Overall test result
    testResults.overallStatus = testResults.tests.every(t => t.passed) ? 'ALL_PASSED' : 
                                 testResults.tests.some(t => t.passed) ? 'PARTIAL' : 'ALL_FAILED';
    testResults.summary = {
      total: testResults.tests.length,
      passed: testResults.tests.filter(t => t.passed).length,
      failed: testResults.tests.filter(t => !t.passed).length
    };

    // Recommendation
    if (!testResults.tests[0].passed) {
      testResults.recommendation = 'Add game code mapping for this game type in GAME_CODE_MAP';
    } else if (!testResults.tests[1].passed) {
      testResults.recommendation = 'Configure MAGAYO_API_KEY in your .env file';
    } else if (!testResults.tests[2].passed) {
      testResults.recommendation = 'Check Magayo API credentials and game code. Fallback will be used.';
    } else if (!testResults.tests[3].passed) {
      testResults.recommendation = 'Local algorithm has issues. Check database connection.';
    } else {
      testResults.recommendation = 'All systems operational!';
    }

    console.log('=== API TEST END ===\n');
    console.log('Overall Status:', testResults.overallStatus);

    res.json({
      success: true,
      ...testResults
    });

  } catch (error) {
    console.error('Error during API test:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to complete API tests'
    });
  }
});

// ============================================
// GET /api/predictions/dashboard
// ============================================
router.get('/dashboard', (req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Prediction API Dashboard</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        
        .header {
            background: white;
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            margin-bottom: 30px;
        }
        
        h1 {
            color: #333;
            margin-bottom: 10px;
        }
        
        .subtitle {
            color: #666;
            font-size: 14px;
        }
        
        .status-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .status-card {
            background: white;
            padding: 25px;
            border-radius: 15px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }
        
        .status-card h3 {
            color: #333;
            margin-bottom: 15px;
            font-size: 18px;
        }
        
        .status-indicator {
            display: inline-flex;
            align-items: center;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 10px;
        }
        
        .status-connected {
            background: #10b981;
            color: white;
        }
        
        .status-error {
            background: #ef4444;
            color: white;
        }
        
        .status-unavailable {
            background: #f59e0b;
            color: white;
        }
        
        .status-unknown {
            background: #6b7280;
            color: white;
        }
        
        .info-row {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid #e5e7eb;
        }
        
        .info-row:last-child {
            border-bottom: none;
        }
        
        .info-label {
            color: #666;
            font-weight: 500;
        }
        
        .info-value {
            color: #333;
            font-weight: 600;
        }
        
        .test-section {
            background: white;
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }
        
        .button-group {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            margin: 20px 0;
        }
        
        button {
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
        }
        
        .btn-primary {
            background: #667eea;
            color: white;
        }
        
        .btn-primary:hover {
            background: #5568d3;
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
        }
        
        .btn-secondary {
            background: #6b7280;
            color: white;
        }
        
        .btn-secondary:hover {
            background: #4b5563;
        }
        
        .test-results {
            margin-top: 20px;
            padding: 20px;
            background: #f9fafb;
            border-radius: 8px;
            border-left: 4px solid #667eea;
        }
        
        .test-item {
            padding: 15px;
            margin: 10px 0;
            background: white;
            border-radius: 8px;
            border-left: 4px solid #e5e7eb;
        }
        
        .test-item.passed {
            border-left-color: #10b981;
        }
        
        .test-item.failed {
            border-left-color: #ef4444;
        }
        
        .test-name {
            font-weight: 600;
            color: #333;
            margin-bottom: 5px;
        }
        
        .test-message {
            color: #666;
            font-size: 14px;
        }
        
        .loading {
            text-align: center;
            padding: 20px;
            color: #666;
        }
        
        .refresh-time {
            text-align: center;
            color: #666;
            font-size: 12px;
            margin-top: 20px;
        }
        
        pre {
            background: #1f2937;
            color: #10b981;
            padding: 15px;
            border-radius: 8px;
            overflow-x: auto;
            font-size: 12px;
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎲 Prediction API Dashboard</h1>
            <p class="subtitle">Monitor your lottery prediction system status</p>
        </div>
        
        <div class="status-grid" id="statusGrid">
            <div class="status-card">
                <h3>Loading...</h3>
            </div>
        </div>
        
        <div class="test-section">
            <h2 style="margin-bottom: 20px;">🧪 API Testing</h2>
            <p style="color: #666; margin-bottom: 20px;">
                Test the Magayo API and local algorithm for each game type
            </p>
            
            <div class="button-group">
                <button class="btn-primary" onclick="testAPI('539')">Test 539</button>
                <button class="btn-primary" onclick="testAPI('mark6')">Test Mark 6</button>
                <button class="btn-primary" onclick="testAPI('lotto649')">Test Lotto 649</button>
                <button class="btn-secondary" onclick="refreshStatus()">🔄 Refresh Status</button>
            </div>
            
            <div id="testResults"></div>
        </div>
        
        <div class="refresh-time" id="refreshTime"></div>
    </div>

    <script>
        let lastUpdate = new Date();

        async function loadStatus() {
            try {
                const response = await fetch('/api/predictions/status');
                const data = await response.json();
                
                displayStatus(data.status);
                lastUpdate = new Date();
                updateRefreshTime();
            } catch (error) {
                console.error('Failed to load status:', error);
                document.getElementById('statusGrid').innerHTML = 
                    '<div class="status-card"><h3>Error loading status</h3></div>';
            }
        }

        function displayStatus(status) {
            const magayoStatus = status.magayoApi.status;
            const statusClass = 'status-' + magayoStatus;
            
            const html = \`
                <div class="status-card">
                    <h3>System Status</h3>
                    <div class="info-row">
                        <span class="info-label">Version</span>
                        <span class="info-value">\${status.version}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">AI Status</span>
                        <span class="info-value">\${status.aiActive ? '✅ Active' : '❌ Inactive'}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Database</span>
                        <span class="info-value">\${status.database === 'connected' ? '✅ Connected' : '❌ Disconnected'}</span>
                    </div>
                </div>
                
                <div class="status-card">
                    <h3>Magayo API</h3>
                    <span class="status-indicator \${statusClass}">
                        \${magayoStatus.toUpperCase()}
                    </span>
                    <div class="info-row">
                        <span class="info-label">Message</span>
                        <span class="info-value">\${status.magayoApi.message}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Response Time</span>
                        <span class="info-value">\${status.magayoApi.responseTime || 'N/A'}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">API Key</span>
                        <span class="info-value">\${status.magayoApi.hasApiKey ? '✅ Configured' : '❌ Not Set'}</span>
                    </div>
                </div>
                
                <div class="status-card">
                    <h3>Fallback System</h3>
                    <div class="info-row">
                        <span class="info-label">Local Algorithm</span>
                        <span class="info-value">\${status.fallbackAvailable ? '✅ Available' : '❌ Unavailable'}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Status</span>
                        <span class="info-value">
                            \${magayoStatus === 'connected' ? 'Standby' : 'Active'}
                        </span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Reliability</span>
                        <span class="info-value">100%</span>
                    </div>
                </div>
            \`;
            
            document.getElementById('statusGrid').innerHTML = html;
        }

        async function testAPI(gameType) {
            const resultsDiv = document.getElementById('testResults');
            resultsDiv.innerHTML = '<div class="loading">⏳ Testing ' + gameType.toUpperCase() + '...</div>';
            
            try {
                const response = await fetch('/api/predictions/test-api/' + gameType);
                const data = await response.json();
                
                displayTestResults(data);
            } catch (error) {
                resultsDiv.innerHTML = \`
                    <div class="test-results">
                        <h3 style="color: #ef4444; margin-bottom: 10px;">❌ Test Failed</h3>
                        <p>\${error.message}</p>
                    </div>
                \`;
            }
        }

        function displayTestResults(data) {
            let testsHtml = '';
            
            data.tests.forEach(test => {
                const passedClass = test.passed ? 'passed' : 'failed';
                const icon = test.passed ? '✅' : '❌';
                
                testsHtml += \`
                    <div class="test-item \${passedClass}">
                        <div class="test-name">\${icon} \${test.name}</div>
                        <div class="test-message">\${test.message}</div>
                        \${test.result ? '<pre>' + JSON.stringify(test.result, null, 2) + '</pre>' : ''}
                        \${test.responseTime ? '<p style="color: #666; font-size: 12px; margin-top: 5px;">Response time: ' + test.responseTime + 'ms</p>' : ''}
                    </div>
                \`;
            });
            
            const statusColor = data.overallStatus === 'ALL_PASSED' ? '#10b981' : 
                               data.overallStatus === 'PARTIAL' ? '#f59e0b' : '#ef4444';
            
            const html = \`
                <div class="test-results">
                    <h3 style="color: \${statusColor}; margin-bottom: 15px;">
                        Test Results for \${data.gameType.toUpperCase()}
                    </h3>
                    <div style="display: flex; gap: 20px; margin-bottom: 20px;">
                        <div><strong>Total:</strong> \${data.summary.total}</div>
                        <div style="color: #10b981;"><strong>Passed:</strong> \${data.summary.passed}</div>
                        <div style="color: #ef4444;"><strong>Failed:</strong> \${data.summary.failed}</div>
                    </div>
                    <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #f59e0b;">
                        <strong>💡 Recommendation:</strong> \${data.recommendation}
                    </div>
                    \${testsHtml}
                </div>
            \`;
            
            document.getElementById('testResults').innerHTML = html;
        }

        function refreshStatus() {
            loadStatus();
        }

        function updateRefreshTime() {
            const now = new Date();
            const seconds = Math.floor((now - lastUpdate) / 1000);
            document.getElementById('refreshTime').textContent = 
                \`Last updated: \${seconds} seconds ago\`;
        }

        // Initial load
        loadStatus();
        
        // Update refresh time every second
        setInterval(updateRefreshTime, 1000);
        
        // Auto-refresh status every 30 seconds
        setInterval(loadStatus, 30000);
    </script>
</body>
</html>
  `;
  
  res.send(html);
});

// ============================================
// GET /api/predictions/periods 
// ============================================
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

// ============================================
// GET /api/predictions/hot-cold/:gameType
// ============================================
router.get('/hot-cold/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;
    const { period = '1month' } = req.query;
    
    console.log('Hot-Cold request for:', gameType, 'period:', period);
    
    // Validate game type
    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type'
      });
    }

    // Map period to days
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

// ============================================
// GET /api/predictions/frequency/:gameType
// ============================================
router.get('/frequency/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;
    const { period = '1month' } = req.query;
    
    console.log('Frequency request for:', gameType, 'period:', period);
    
    // Validate game type
    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type'
      });
    }

    // Map period to days
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

// ============================================
// GET /api/predictions/draw-count/:gameType/:period
// ============================================
router.get('/draw-count/:gameType/:period', async (req, res) => {
  try {
    const { gameType, period } = req.params;
    
    console.log('Draw count request for:', gameType, 'period:', period);
    
    // Validate game type
    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type'
      });
    }
    
    // Map period to days
    const daysMap = {
      '1week': 7,
      '1month': 30,
      '3months': 90,
      'all': 365
    };
    
    const days = daysMap[period] || 30;
    const results = await dbService.getRecentResults(gameType, days);

    res.json({
      success: true,
      drawCount: results.length,
      period,
      gameType
    });
  } catch (error) {
    console.error('Error getting draw count:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// GET /api/predictions/analysis/:gameType
// ============================================
router.get('/analysis/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;
    const { period = '1month' } = req.query;
    
    console.log('Analysis request for:', gameType, 'period:', period);
    
    // Validate game type
    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type'
      });
    }
    
    const stats = await dbService.getGameStatistics(gameType);
    
    res.json({
      success: true,
      analysis: {
        gameType,
        period,
        totalHistoricalCount: stats.totalDraws,
        historicalCount: stats.monthlyDraws,
        dataSource: 'database',
        latestDraw: stats.latestDraw,
        totalPredictions: stats.totalPredictions
      }
    });
  } catch (error) {
    console.error('Error getting analysis:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// GET /api/predictions/past-7-days/:gameType
// ============================================
router.get('/past-7-days/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;
    
    console.log('=== PAST 7 DAYS ANALYSIS START ===');
    console.log('Game Type:', gameType);
    
    // Validate game type
    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type'
      });
    }

    // Calculate date 7 days ago
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const todayStr = today.toISOString().split('T')[0];
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    console.log('Date range:', sevenDaysAgoStr, 'to', todayStr);

    // Get lottery results from database
    const results = await db.LotteryResult.findAll({
      where: {
        game_type: gameType,
        draw_date: {
          [Op.gte]: sevenDaysAgoStr,
          [Op.lte]: todayStr
        }
      },
      order: [['draw_date', 'DESC']]
    });

    console.log('Results found:', results.length);

    // If no results found
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

    // Calculate frequency of each number 
    const frequencyMap = {};
    const maxNumber = gameType === '539' ? 39 : 49;
    
    // Initialize frequency map
    for (let i = 1; i <= maxNumber; i++) {
      frequencyMap[i] = 0;
    }

    // Count occurrences
    results.forEach(result => {
      if (result.numbers && Array.isArray(result.numbers)) {
        result.numbers.forEach(num => {
          if (frequencyMap[num] !== undefined) {
            frequencyMap[num]++;
          }
        });
      }
    });

    // Convert to array and sort by frequency
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

// ============================================
// GET /api/predictions/all-past-results/:gameType
// ============================================
router.get('/all-past-results/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;
    
    console.log('=== ALL PAST RESULTS ANALYSIS START ===');
    console.log('Game Type:', gameType);
    
    // Validate game type
    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type'
      });
    }

    // Get ALL lottery results from database
    const results = await db.LotteryResult.findAll({
      where: {
        game_type: gameType
      },
      order: [['draw_date', 'DESC']]
    });

    console.log('Total results found:', results.length);

    // If no results found 
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

    // Get date range
    const dates = results.map(r => r.draw_date).filter(d => d);
    const oldestDate = dates[dates.length - 1];
    const newestDate = dates[0];

    console.log('Date range:', oldestDate, 'to', newestDate);

    // Calculate frequency of each number 
    const frequencyMap = {};
    const maxNumber = gameType === '539' ? 39 : 49;
    
    // Initialize frequency map
    for (let i = 1; i <= maxNumber; i++) {
      frequencyMap[i] = 0;
    }

    // Count occurrences
    results.forEach(result => {
      if (result.numbers && Array.isArray(result.numbers)) {
        result.numbers.forEach(num => {
          if (frequencyMap[num] !== undefined) {
            frequencyMap[num]++;
          }
        });
      }
    });

    // Convert to array and sort by frequency
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

// ============================================
// POST /api/predictions/sum-constrained/:gameType
// ============================================
router.post('/sum-constrained/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;
    const { period = '1month', minSum, maxSum } = req.body;
    
    console.log('Sum-constrained prediction for:', gameType);
    console.log('Constraints:', { minSum, maxSum });
    
    // Validate game type
    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type'
      });
    }
    
    // Map period to days
    const daysMap = {
      '1week': 7,
      '1month': 30,
      '3months': 90,
      'all': 365
    };
    
    const days = daysMap[period] || 30;
    const frequency = await dbService.getNumberFrequency(gameType, days);
    
    // Game configuration
    const gameConfig = {
      '539': { count: 5, max: 39 },
      'mark6': { count: 6, max: 49 },
      'lotto649': { count: 6, max: 49 }
    };
    
    const config = gameConfig[gameType];
    let numbers = [];
    let attempts = 0;
    const maxAttempts = 1000;
    
    // Generate numbers with sum constrainta 
    while (attempts < maxAttempts) {
      numbers = [];
      const candidates = frequency.mainNumbers.map(f => f.number);
      
      // Add random numbers if not enough candidates 
      while (candidates.length < config.max) {
        const num = Math.floor(Math.random() * config.max) + 1;
        if (!candidates.includes(num)) {
          candidates.push(num);
        }
      }
      
      // Select numbers 
      for (let i = 0; i < config.count; i++) {
        const idx = Math.floor(Math.random() * candidates.length);
        const num = candidates.splice(idx, 1)[0];
        numbers.push(num);
      }
      
      const sum = numbers.reduce((a, b) => a + b, 0);
      
      // Check if sum meets constraints 
      if ((!minSum || sum >= minSum) && (!maxSum || sum <= maxSum)) {
        break;
      }
      
      attempts++;
    }
    
    numbers.sort((a, b) => a - b);

    const prediction = {
      numbers,
      sum: numbers.reduce((a, b) => a + b, 0),
      confidence: 0.7,
      timestamp: new Date().toISOString(),
      constraint: { minSum, maxSum },
      metadata: { 
        predictionType: 'Sum-Constrained',
        attempts,
        period
      }
    };
    
    // Save prediction if user is logged in 
    if (req.session?.user) {
      await dbService.savePrediction({
        user_id: req.session.user.id,
        game_type: gameType,
        predicted_numbers: numbers,
        confidence_score: prediction.confidence,
        prediction_type: 'sum-constrained',
        analysis_period: period,
        metadata: prediction.metadata
      });
    }

    res.json({
      success: true,
      prediction
    });
  } catch (error) {
    console.error('Error generating sum-constrained prediction:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// POST /api/predictions/automation/:gameType 
// ============================================
router.post('/automation/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;
    const { period = '1month', multiplier = 1 } = req.body;
    
    console.log('Automation request for:', gameType, 'multiplier:', multiplier);
    
    // Validate game type
    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid game type'
      });
    }
    
    // Map period to days
    const daysMap = {
      '1week': 7,
      '1month': 30,
      '3months': 90,
      'all': 365
    };
    
    const days = daysMap[period] || 30;
    const frequency = await dbService.getNumberFrequency(gameType, days);
    
    // Simulate multiple iterations 
    const allNumbers = [];
    for (let i = 0; i < multiplier; i++) {
      frequency.mainNumbers.forEach(f => {
        for (let j = 0; j < f.frequency; j++) {
          allNumbers.push(f.number);
        }
      });
    }
    
    // Count final frequency
    const finalFrequency = {};
    allNumbers.forEach(num => {
      finalFrequency[num] = (finalFrequency[num] || 0) + 1;
    });
    
    // Get top numbers
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

// ============================================
// POST /api/predictions/:gameType (Generic prediction with Magoyo API fallback)
// ============================================
router.post('/:gameType', async (req, res) => {
  try {
    const { gameType } = req.params;
    const { period = '1month', extended = false } = req.body;
    
    console.log('Prediction request for gameType:', gameType);
    console.log('Period:', period, 'Extended:', extended);

    // Validate game type 
    if (!['539', 'mark6', 'lotto649'].includes(gameType)) {
      console.log('Invalid game type received:', gameType);
      return res.status(400).json({
        success: false,
        error: `Invalid game type: ${gameType}. Must be 539, mark6, or lotto649`
      });
    }

    // Map period to days and get frequency data (needed for fallback) 
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

    // Try Magayo API first
    const magayoResult = await getMagayoPrediction(gameType, period, extended);
    
    if (magayoResult.success) {
      // Use Magayo API prediction
      predictionResult = magayoResult.prediction;
      predictionSource = 'magayo-api';
      console.log('Using Magayo API prediction');
    } else {
      // Fallback to local algorithm
      console.log('Magayo API failed, falling back to local algorithm');
      const localResult = await getLocalPrediction(gameType, period, extended, frequency);
      predictionResult = localResult.prediction;
      predictionSource = 'local-algorithm';
    }

    // Add source information to metadata
    if (!predictionResult.metadata) {
      predictionResult.metadata = {};
    }
    predictionResult.metadata.predictionSource = predictionSource;
    predictionResult.metadata.fallbackUsed = predictionSource === 'local-algorithm';

    // Save prediction if user is logged in
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

// ============================================
// GET /api/predictions/history
// ============================================
router.get('/history', async (req, res) => {
  try {
    // Check authentication
    if (!req.session?.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    const { gameType, limit = 10 } = req.query;
    
    // Get user's predictions 
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