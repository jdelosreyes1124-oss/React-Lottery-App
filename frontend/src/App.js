import React, { useState, useEffect } from 'react';
import { Brain, Activity, AlertCircle, CheckCircle2, Zap, TrendingUp, Loader2, Database, Shield, Lock, User, LogOut, X, Info, Calendar, RotateCw, Pipette, Trash2 } from 'lucide-react';
import ConnectionTest from './ConnectionTest';  // Keep the debug component

// API Configuration
const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://react-lottery-app.onrender.com/api';
console.log('✅ API_BASE_URL:', API_BASE_URL);

// Google OAuth Configuration
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;

// User roles
const USER_ROLES = {
  ADMIN: 'admin',
  USER: 'user',
  GUEST: 'guest'
};

// Frequency analysis options
const FREQUENCY_OPTIONS = [
  { value: 7, label: '1 Week' },
  { value: 14, label: '2 Weeks' },
  { value: 30, label: '1 Month' },
  { value: 90, label: '3 Months' },
  { value: 180, label: '6 Months' },
  { value: 365, label: '1 Year' }
];

// Multiplier options for automation
const MULTIPLIER_OPTIONS = [
  { value: 1, label: '1x' },
  { value: 10, label: '10x' },
  { value: 50, label: '50x' },
  { value: 100, label: '100x' },
  { value: 300, label: '300x' },
  { value: 1000, label: '1000x' }
];

// API service 
// API service 
const api = {
  login: ({ username, password }) =>
    fetch(`${API_BASE_URL}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password }),
  credentials: 'include'
    }).then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }),
  
  register: ({ username, password, email }) =>
    fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, email }),
      credentials: 'include'
    }).then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }),
  
  googleLogin: (tokenId) =>
    fetch(`${API_BASE_URL}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tokenId }),
      credentials: 'include'
    }).then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }),
  
 googleRegister: (tokenId, username) =>
  fetch(`${API_BASE_URL}/auth/google/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: tokenId, username: username }),
    credentials: 'include'
  }).then(res => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }),
  
  verifyAuth: () =>
    fetch(`${API_BASE_URL}/auth/verify`, {
      credentials: 'include'
    }).then(res => res.json()).catch(() => ({ authenticated: false })),
   logout: () =>
    fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include' // ✅ CRITICAL: Include credentials for cookies
    })
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .catch(err => {
      console.error('❌ Logout API error:', err);
      throw err;
    }),

  predict: (gameType, period = '1month') => 
    fetch(`${API_BASE_URL}/predictions/${gameType}`, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ period, extended: true })
    }).then(res => res.json()),

  automation: (gameType, period, multiplier) =>
    fetch(`${API_BASE_URL}/predictions/${gameType}/automation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ period, iterations: multiplier })
    }).then(res => res.json()),
  
getHistoricalResults: (gameType, page = 1, limit = 50) =>
     fetch(`${API_BASE_URL}/admin/historical-results/${gameType}?page=${page}&limit=${limit}`, {
    method: 'GET',
    credentials: 'include', // ✅ ensures session cookies are sent
    headers: {
      'Accept': 'application/json'
    }
  })
  .then(async res => {
    if (!res.ok) {
      // Try to read the JSON safely
      let errorMessage = `HTTP ${res.status}`;
      try {
        const data = await res.json();
        errorMessage = data?.error || data?.message || errorMessage;
      } catch {
        // response was HTML or empty
      }
      if (res.status === 401) throw new Error('Not authenticated');
      if (res.status === 403) throw new Error('Admin access required');
      throw new Error(errorMessage);
    }
    return res.json();
  })
  .catch(err => {
    console.error('❌ Failed to load historical results:', err.message);
    throw err;
  }),


addHistoricalResult: (gameType, result) =>
  fetch(`${API_BASE_URL}/admin/historical-results/${gameType}/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(result)
  })
  .then(async res => {
    if (res.status === 401) {
      throw new Error('Unauthorized - please log in again');
    }
    if (res.status === 403) {
      throw new Error('Admin access required');
    }
    
    const data = await res.json();
    
    // Check if the request was successful
    if (!res.ok) {
      throw new Error(data.error || `Failed to add result: ${res.status}`);
    }
    
    return data;
  }),

 deleteHistoricalResult: (gameType, resultId) =>
  fetch(`${API_BASE_URL}/admin/historical-results/${gameType}/${resultId}`, {
    method: 'DELETE',
    credentials: 'include'
  }).then(async res => {
    if (res.status === 403) throw new Error('Admin access required');
    const data = await res.json();
    return data;
  }),

 syncBackendExcel: (gameType) =>
  fetch(`${API_BASE_URL}/admin/historical-results/${gameType}/sync`, {
    method: 'POST',
    credentials: 'include'
  }).then(async res => {
    if (res.status === 403) throw new Error('Admin access required');
    const data = await res.json();
    return data;
  }),

  scraperPreview: (gameType, maxResults = 30) =>
    fetch(`${API_BASE_URL}/admin/scraper/preview/${gameType}?maxResults=${maxResults}`, {
      credentials: 'include'
    }).then(res => {
      if (res.status === 403) throw new Error('Admin access required');
      return res.json();
    }),

  scraperImport: (gameType, maxResults = 50, mergeStrategy = 'skip') =>
    fetch(`${API_BASE_URL}/admin/scraper/import/${gameType}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ maxResults, mergeStrategy })
    }).then(res => {
      if (res.status === 403) throw new Error('Admin access required');
      return res.json();
    }),

  scraperStatus: (gameType) =>
    fetch(`${API_BASE_URL}/admin/scraper/status/${gameType}`, {
      credentials: 'include'
    }).then(res => res.json()),

  getSchedulerStatus: (gameType) =>
    fetch(`${API_BASE_URL}/admin/scheduler/status/${gameType}`, {
      credentials: 'include'
    }).then(res => res.json()),

  getAllSchedulerStatus: () =>
    fetch(`${API_BASE_URL}/admin/scheduler/status`, {
      credentials: 'include'
    }).then(res => res.json()),

  startScheduler: (gameType, schedule) =>
    fetch(`${API_BASE_URL}/admin/scheduler/start/${gameType}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ schedule })
    }).then(res => res.json()),

  stopScheduler: (gameType) =>
    fetch(`${API_BASE_URL}/admin/scheduler/stop/${gameType}`, {
      method: 'POST',
      credentials: 'include'
    }).then(res => res.json()),

  triggerManualScrape: (gameType) =>
    fetch(`${API_BASE_URL}/admin/scheduler/trigger/${gameType}`, {
      method: 'POST',
      credentials: 'include'
    }).then(res => res.json()),

  getAllPastResults: (gameType) =>
    fetch(`${API_BASE_URL}/predictions/all-past-results/${gameType}`, {
      credentials: 'include'
    }).then(res => res.json())
};

// Lotto Picker Feature Component 
const LottoPickerFeature = ({ gameType, onClose }) => {
  const [selectedNumbers, setSelectedNumbers] = React.useState([]);
  const [generatedPatterns, setGeneratedPatterns] = React.useState([]);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [patternCount, setPatternCount] = React.useState(5);

  const gameConfig = {
    '539': { maxNum: 39, minPick: 10, maxPick: 16, patternSize: 5 },
    'mark6': { maxNum: 49, minPick: 14, maxPick: 20, patternSize: 7 },
    'lotto649': { maxNum: 49, minPick: 14, maxPick: 20, patternSize: 7 }
  };

  const config = gameConfig[gameType] || gameConfig['539'];

  const handleNumberClick = (number) => {
    if (selectedNumbers.includes(number)) {
      setSelectedNumbers(selectedNumbers.filter(n => n !== number));
    } else {
      if (selectedNumbers.length < config.maxPick) {
        setSelectedNumbers([...selectedNumbers, number].sort((a, b) => a - b));
      }
    }
  };

  const generatePatterns = () => {
    if (selectedNumbers.length < config.minPick) {
      return;
    }

    setIsGenerating(true);
    setGeneratedPatterns([]);

    setTimeout(() => {
      const patterns = [];
      
      for (let i = 0; i < patternCount; i++) {
        const pattern = [];
        const availableNumbers = [...selectedNumbers];
        
        while (pattern.length < config.patternSize && availableNumbers.length > 0) {
          const randomIndex = Math.floor(Math.random() * availableNumbers.length);
          pattern.push(availableNumbers[randomIndex]);
          availableNumbers.splice(randomIndex, 1);
        }
        
        pattern.sort((a, b) => a - b);
        patterns.push({
          id: i + 1,
          numbers: pattern
        });
      }

      setGeneratedPatterns(patterns);
      setIsGenerating(false);
    }, 500);
  };

  const clearSelection = () => {
    setSelectedNumbers([]);
    setGeneratedPatterns([]);
  };

  const getPatternColor = (index) => {
    const colors = [
      'from-blue-500 to-blue-700',
      'from-green-500 to-green-700',
      'from-purple-500 to-purple-700',
      'from-red-500 to-red-700',
      'from-yellow-500 to-yellow-700',
      'from-pink-500 to-pink-700',
      'from-indigo-500 to-indigo-700',
      'from-cyan-500 to-cyan-700'
    ];
    return colors[index % colors.length];
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b bg-gradient-to-r from-green-50 to-green-100">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 flex items-center space-x-2">
              <Zap className="h-6 w-6 text-green-600" />
              <span>Lotto Picker - {gameType.toUpperCase()}</span>
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Pick {config.minPick}-{config.maxPick} numbers, then generate {config.patternSize}-number patterns
              {(gameType === 'mark6' || gameType === 'lotto649') && <span className="block text-red-600 font-medium">{gameType === 'mark6' ? 'Mark 6' : 'Lotto 649'}: Last number in each pattern = Bonus number</span>}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 hover:scale-110 transition-all duration-200 text-2xl">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Selection Info */}
          <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-green-100 rounded-lg border-2 border-green-200">
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="text-sm font-semibold text-green-800">
                  Selected: {selectedNumbers.length} / {config.maxPick}
                </span>
                <span className="text-xs text-green-600 block mt-1">
                  {selectedNumbers.length < config.minPick 
                    ? `Need ${config.minPick - selectedNumbers.length} more` 
                    : '✓ Ready to generate patterns'}
                </span>
              </div>
              <button
                onClick={clearSelection}
                className="px-3 py-1 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 hover:scale-105 transition-all duration-200 flex items-center space-x-1"
              >
                <X className="h-3 w-3" />
                <span>Clear</span>
              </button>
            </div>
            
            {selectedNumbers.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {selectedNumbers.map((num, index) => (
                  <div
                    key={num}
                    onClick={() => handleNumberClick(num)}
                    className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-green-700 text-white flex items-center justify-center text-sm font-bold shadow-md cursor-pointer hover:scale-110 transition-all duration-200"
                  >
                    {num}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Number Grid */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Pick Your Numbers (1-{config.maxNum})</h3>
            <div className="grid grid-cols-8 md:grid-cols-10 gap-2">
              {Array.from({ length: config.maxNum }, (_, i) => i + 1).map(number => (
                <button
                  key={number}
                  onClick={() => handleNumberClick(number)}
                  disabled={!selectedNumbers.includes(number) && selectedNumbers.length >= config.maxPick}
                  className={`w-10 h-10 rounded-lg font-semibold text-sm transition-all duration-200 ${
                    selectedNumbers.includes(number)
                      ? 'bg-gradient-to-br from-green-500 to-green-700 text-white shadow-lg scale-110'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:scale-105'
                  } ${!selectedNumbers.includes(number) && selectedNumbers.length >= config.maxPick ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {number}
                </button>
              ))}
            </div>
          </div>

          {/* Pattern Count Slider */}
          {selectedNumbers.length >= config.minPick && (
            <div className="mb-6 p-4 bg-blue-50 rounded-lg">
              <label className="block text-sm font-semibold text-blue-800 mb-3">
                Number of Patterns to Generate: {patternCount}
              </label>
              <input
                type="range"
                min={3}
                max={20}
                value={patternCount}
                onChange={(e) => setPatternCount(parseInt(e.target.value))}
                className="w-full h-3 bg-blue-200 rounded-full appearance-none cursor-pointer"
              />
              <div className="flex justify-between mt-2 text-xs text-gray-600">
                <span>3 patterns</span>
                <span>10 patterns</span>
                <span>20 patterns</span>
              </div>
            </div>
          )}

          {/* Generate Button */}
          <button
            onClick={generatePatterns}
            disabled={selectedNumbers.length < config.minPick || isGenerating}
            className={`w-full mb-6 py-3 px-4 rounded-lg font-semibold flex items-center justify-center space-x-2 transition-all duration-200 ${
              selectedNumbers.length >= config.minPick && !isGenerating
                ? 'bg-gradient-to-r from-green-600 to-green-700 text-white hover:shadow-lg hover:scale-105'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Generating Patterns...</span>
              </>
            ) : (
              <>
                <Zap className="h-5 w-5" />
                <span>Generate {patternCount} Patterns</span>
              </>
            )}
          </button>

          {/* Generated Patterns */}
          {generatedPatterns.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-800 flex items-center space-x-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span>Generated Patterns ({generatedPatterns.length})</span>
              </h3>
              
              <div className="grid md:grid-cols-2 gap-4">
                {generatedPatterns.map((pattern, index) => (
                  <div key={pattern.id} className="p-4 bg-gradient-to-r from-gray-50 to-white rounded-lg border-2 border-gray-200 hover:border-green-300 transition-all duration-200">
                    <div className="flex items-center justify-between mb-3">
                      <span className={`text-sm font-semibold bg-gradient-to-r ${getPatternColor(index)} bg-clip-text text-transparent`}>
                        Pattern #{pattern.id}
                      </span>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 justify-center">
                      {pattern.numbers.map((num, numIndex) => {
                        const isBonus = (gameType === 'mark6' || gameType === 'lotto649') && numIndex === pattern.numbers.length - 1;
                        return (
                          <div key={numIndex} className="flex flex-col items-center">
                            <div
                              className={`w-12 h-12 rounded-full ${
                                isBonus 
                                  ? 'bg-gradient-to-br from-red-500 to-red-700 animate-pulse ring-2 ring-red-300'
                                  : `bg-gradient-to-br ${getPatternColor(index)}`
                              } text-white flex items-center justify-center text-base font-bold shadow-lg`}
                            >
                              {num}
                            </div>
                            {isBonus && (
                              <span className="text-xs font-bold text-red-600 mt-1">BONUS</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
                <p className="text-xs text-green-800">
                  <strong>ℹ️ Tip:</strong> All patterns are randomly selected from your {selectedNumbers.length} chosen numbers. 
                  Each pattern contains {config.patternSize} unique numbers.
                  {(gameType === 'mark6' || gameType === 'lotto649') && <span className="block mt-1"><strong>{gameType === 'mark6' ? 'Mark 6' : 'Lotto 649'} Note:</strong> The last number in each pattern (marked as BONUS in red) represents the bonus number.</span>}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// OPTION A: SINGLE ROLL WITH RESTART - Rolling Prediction Feature Component
const RollingPredictionFeature = ({ gameType, onClose }) => {
  const [selectedDays, setSelectedDays] = useState(3);
  const [minMatches, setMinMatches] = useState(2);
  const [predictionCount, setPredictionCount] = useState(8);
  const [isRunning, setIsRunning] = useState(false);
  const [predictions, setPredictions] = useState([]);
  const [historicalData, setHistoricalData] = useState([]);
  const [rollCounts, setRollCounts] = useState([0, 0, 0, 0, 0, 0, 0]);
  const [error, setError] = useState(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [sequenceAttempts, setSequenceAttempts] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const shouldStopRef = React.useRef(false);

  const gameConfig = {
    '539': { numbers: 8, maxNum: 39, hasBonus: false },
    'mark6': { numbers: 8, maxNum: 49, hasBonus: true },
    'lotto649': { numbers: 8, maxNum: 49, hasBonus: true }
  };

  const config = gameConfig[gameType] || gameConfig['539'];

  const loadHistoricalData = async () => {
    setIsLoadingHistory(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE_URL}/admin/historical-results/${gameType}?limit=${selectedDays * 2}`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.results) {
          const sortedResults = data.results
            .sort((a, b) => new Date(b.drawDate) - new Date(a.drawDate))
            .slice(0, selectedDays);
          setHistoricalData(sortedResults);
        } else {
          setHistoricalData(generateMockHistoricalData());
        }
      } else {
        setHistoricalData(generateMockHistoricalData());
      }
    } catch (err) {
      console.error('Failed to load historical data:', err);
      setHistoricalData(generateMockHistoricalData());
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const generateMockHistoricalData = () => {
    const mockData = [];
    for (let i = 0; i < selectedDays; i++) {
      const numbers = [];
      while (numbers.length < predictionCount) {
        const num = Math.floor(Math.random() * config.maxNum) + 1;
        if (!numbers.includes(num)) numbers.push(num);
      }
      
      const date = new Date();
      date.setDate(date.getDate() - i);
      
      mockData.push({
        drawDate: date.toISOString().split('T')[0],
        numbers: numbers.sort((a, b) => a - b),
        bonus: config.hasBonus ? Math.floor(Math.random() * config.maxNum) + 1 : null
      });
    }
    return mockData;
  };

  const generateRandomPrediction = (numberCount = predictionCount) => {
    const numbers = [];
    while (numbers.length < numberCount) {
      const num = Math.floor(Math.random() * config.maxNum) + 1;
      if (!numbers.includes(num)) numbers.push(num);
    }
    return numbers.sort((a, b) => a - b);
  };

  const countMatches = (prediction, historicalResults) => {
    const historicalNumbers = new Set();
    historicalResults.forEach(result => {
      result.numbers.forEach(num => historicalNumbers.add(num));
    });
    
    const matchingNumbers = prediction.filter(num => historicalNumbers.has(num));
    
    return {
      count: matchingNumbers.length,
      matchingNumbers: matchingNumbers,
      historicalNumbers: Array.from(historicalNumbers).sort((a, b) => a - b)
    };
  };

  const runRollingPredictions = async () => {
    if (historicalData.length === 0) {
      setError('No historical data available. Loading...');
      await loadHistoricalData();
      return;
    }

    shouldStopRef.current = false;
    setIsRunning(true);
    setError(null);
    setPredictions([]);
    setRollCounts(Array(selectedDays + 1).fill(0));
    setSequenceAttempts(0);
    setCurrentStep(0);

    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      let totalAttempts = 0;
      let sequenceComplete = false;
      let currentPredictions = [];
      let currentRollCounts = Array(selectedDays + 1).fill(0);
      
      while (!sequenceComplete && !shouldStopRef.current) {
        totalAttempts++;
        
        if (totalAttempts % 10 === 0) {
          setSequenceAttempts(totalAttempts);
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        
        currentPredictions = [];
        let failedAt = -1;
        
        for (let i = 0; i < selectedDays && failedAt === -1; i++) {
          setCurrentStep(i + 1);
          
          if (historicalData.length > i) {
            const dayData = [historicalData[selectedDays - 1 - i]];
            const pred = generateRandomPrediction();
            const matchResult = countMatches(pred, dayData);
            currentRollCounts[i]++;
            
            if (matchResult.count < minMatches) {
              failedAt = i + 1;
              setRollCounts([...currentRollCounts]);
              break;
            }
            
            const daysAgo = selectedDays - i;
            currentPredictions.push({
              numbers: pred,
              rolls: currentRollCounts[i],
              matches: matchResult.count,
              matchingNumbers: matchResult.matchingNumbers,
              validated: true,
              daysBack: `${daysAgo} day${daysAgo > 1 ? 's' : ''} ago`,
              requiredMatches: minMatches,
              validatedAgainstDate: dayData[0]?.drawDate
            });
          }
        }
        
        if (failedAt === -1) {
          setCurrentStep(selectedDays + 1);
          const predFinal = generateRandomPrediction();
          currentRollCounts[selectedDays]++;
          currentPredictions.push({
            numbers: predFinal,
            rolls: currentRollCounts[selectedDays],
            matches: 0,
            validated: true,
            daysBack: 0,
            requiredMatches: 0
          });
          
          sequenceComplete = true;
        }
      }
      
      setSequenceAttempts(totalAttempts);
      setPredictions(currentPredictions);
      setRollCounts(currentRollCounts);
      
      if (shouldStopRef.current && !sequenceComplete) {
        setError('Generation stopped by user');
      }

    } catch (err) {
      console.error('Prediction error:', err);
      setError('Failed to generate predictions: ' + err.message);
    } finally {
      setIsRunning(false);
      setCurrentStep(0);
    }
  };

  useEffect(() => {
    loadHistoricalData();
  }, [selectedDays, gameType, predictionCount]);

  const getValidationLabel = (prediction, index) => {
    if (index === predictions.length - 1) return 'Standard Prediction (No validation required)';
    
    const dayNumber = selectedDays - index;
    let dayDescription = `ONLY day ${dayNumber} (${dayNumber} day${dayNumber > 1 ? 's' : ''} ago)`;
    
    const matchText = prediction.matchingNumbers && prediction.matchingNumbers.length > 0 
      ? `Matching: [${prediction.matchingNumbers.join(', ')}]` 
      : 'No matches';
    
    const dateText = prediction.validatedAgainstDate 
      ? ` (${new Date(prediction.validatedAgainstDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})` 
      : '';
    
    return `Validated against ${dayDescription}${dateText} - ${prediction.matches}/${prediction.requiredMatches} matches - ${matchText}`;
  };

  const getPredictionColor = (index) => {
    const colors = [
      'from-blue-500 to-blue-700',
      'from-green-500 to-green-700',
      'from-purple-500 to-purple-700',
      'from-red-500 to-red-700',
      'from-yellow-500 to-yellow-700',
      'from-pink-500 to-pink-700',
      'from-indigo-500 to-indigo-700'
    ];
    return colors[index] || colors[0];
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b bg-gradient-to-r from-purple-50 to-purple-100">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 flex items-center space-x-2">
              <RotateCw className="h-6 w-6 text-purple-600" />
              <span>Rolling Prediction System - {gameType.toUpperCase()}</span>
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Adjustable predictions (5-8 numbers) with restart pattern
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 hover:scale-110 transition-all duration-200 text-2xl">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {isRunning && (
            <div className="mb-4 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-yellow-800">Rolling in Progress</span>
                <span className="text-xs text-yellow-600">Attempt #{sequenceAttempts}</span>
              </div>
              <div className="flex space-x-2">
                {Array.from({ length: selectedDays + 1 }).map((_, step) => (
                  <div
                    key={step + 1}
                    className={`flex-1 h-2 rounded ${
                      step + 1 <= currentStep ? 'bg-yellow-400' : 'bg-gray-200'
                    }`}
                  />
                ))}
              </div>
              <div className="text-xs text-yellow-700 mt-2">
                Current Step: Prediction {currentStep}/{selectedDays + 1}
              </div>
            </div>
          )}

          <div className="mb-6 p-4 bg-purple-50 rounded-lg">
            <label className="block text-sm font-semibold text-purple-800 mb-3">
              Historical Days to Analyze: {selectedDays}
              <span className="text-xs font-normal block mt-1">
                Will generate {selectedDays} validated predictions + 1 final prediction = {selectedDays + 1} total
              </span>
            </label>
            <div className="relative">
              <input
                type="range"
                min={1}
                max={6}
                value={selectedDays}
                onChange={(e) => setSelectedDays(parseInt(e.target.value))}
                disabled={isRunning}
                className="w-full h-3 bg-purple-200 rounded-full appearance-none cursor-pointer disabled:opacity-50"
                style={{
                  background: `linear-gradient(to right, #9333EA 0%, #9333EA ${((selectedDays - 1) / 5) * 100}%, #E9D5FF ${((selectedDays - 1) / 5) * 100}%, #E9D5FF 100%)`
                }}
              />
              <div className="flex justify-between mt-2 text-xs text-gray-600">
                <span>1 day</span>
                <span>2 days</span>
                <span>3 days</span>
                <span>4 days</span>
                <span>5 days</span>
                <span>6 days</span>
              </div>
            </div>
          </div>

          <div className="mb-6 p-4 bg-indigo-50 rounded-lg">
            <label className="block text-sm font-semibold text-indigo-800 mb-3">
              Number of Predictions per Set: {predictionCount}
              <span className="text-xs font-normal block mt-1">
                Each prediction set will contain {predictionCount} numbers from 1-{config.maxNum}
              </span>
            </label>
            <div className="relative">
              <input
                type="range"
                min={5}
                max={8}
                value={predictionCount}
                onChange={(e) => setPredictionCount(parseInt(e.target.value))}
                disabled={isRunning}
                className="w-full h-3 bg-indigo-200 rounded-full appearance-none cursor-pointer disabled:opacity-50"
                style={{
                  background: `linear-gradient(to right, #6366F1 0%, #6366F1 ${((predictionCount - 5) / 3) * 100}%, #C7D2FE ${((predictionCount - 5) / 3) * 100}%, #C7D2FE 100%)`
                }}
              />
              <div className="flex justify-between mt-2 text-xs text-gray-600">
                <span>5</span>
                <span>6</span>
                <span>7</span>
                <span>8</span>
              </div>
            </div>
            <div className="mt-2 text-xs text-indigo-700">
              {predictionCount === 5 ? 'Minimal Set - Focused prediction with fewer numbers' :
               predictionCount === 6 ? 'Standard Set - Balanced approach for most games' :
               predictionCount === 7 ? 'Enhanced Set - More coverage with 7 numbers' :
               predictionCount === 8 ? 'Maximum Set - Full coverage with all 8 numbers' : ''}
            </div>
          </div>

          <div className="mb-6 p-4 bg-blue-50 rounded-lg">
            <label className="block text-sm font-semibold text-blue-800 mb-3">
              Minimum Matching Numbers Required: {minMatches}
              <span className="text-xs font-normal block mt-1">
                Each prediction must match at least {minMatches} number{minMatches > 1 ? 's' : ''} from its validation day
              </span>
            </label>
            <div className="relative">
              <input
                type="range"
                min={1}
                max={3}
                value={minMatches}
                onChange={(e) => setMinMatches(parseInt(e.target.value))}
                disabled={isRunning}
                className="w-full h-3 bg-blue-200 rounded-full appearance-none cursor-pointer disabled:opacity-50"
                style={{
                  background: `linear-gradient(to right, #3B82F6 0%, #3B82F6 ${((minMatches - 1) / 2) * 100}%, #BFDBFE ${((minMatches - 1) / 2) * 100}%, #BFDBFE 100%)`
                }}
              />
              <div className="flex justify-between mt-2 text-xs text-gray-600">
                <span>1 match</span>
                <span>2 matches</span>
                <span>3 matches</span>
              </div>
            </div>
            <div className="mt-2 text-xs text-blue-700">
              {minMatches === 1 ? 'Easy Mode - Fastest completion, basic validation' :
               minMatches === 2 ? 'Balanced Mode - Good mix of speed and quality (Recommended)' :
               minMatches === 3 ? 'Hard Mode - Highest quality predictions, may take longer' : ''}
              <span className="block mt-1 text-purple-700 font-semibold">
                ⚠️ Infinite attempts - will run until success
              </span>
            </div>
          </div>

          {historicalData.length > 0 && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center space-x-2">
                <Calendar className="h-4 w-4" />
                <span>Historical Results (Past {selectedDays} days)</span>
              </h3>
              <div className="space-y-2">
                {historicalData.slice(0, selectedDays).map((result, index) => (
                  <div key={index} className="flex items-center space-x-3 text-sm">
                    <span className="text-gray-500 w-28">
                      {index === 0 ? 'Day 1 (Most Recent)' : 
                       `Day ${index + 1} (${index + 1} day${index > 0 ? 's' : ''} ago)`}:
                    </span>
                    <span className="text-gray-400 w-20">
                      {new Date(result.drawDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <div className="flex space-x-1">
                      {result.numbers.map((num, i) => (
                        <span key={i} className="w-7 h-7 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-xs font-medium">
                          {num}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={runRollingPredictions}
            disabled={isRunning || isLoadingHistory}
            className={`w-full mb-6 py-3 px-4 rounded-lg font-semibold flex items-center justify-center space-x-2 transition-all duration-200 ${
              isRunning 
                ? 'bg-purple-400 cursor-wait animate-pulse' 
                : 'bg-gradient-to-r from-purple-600 to-purple-700 text-white hover:shadow-lg hover:scale-105'
            } ${isLoadingHistory ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isRunning ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin text-white" />
                <span className="animate-pulse text-white">Running... Attempt #{sequenceAttempts}</span>
              </>
            ) : isLoadingHistory ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin text-white" />
                <span className="text-white">Loading Historical Data...</span>
              </>
            ) : (
              <>
                <Zap className="h-5 w-5 text-white" />
                <span className="text-white">Run Rolling Predictions</span>
              </>
            )}
          </button>

          {isRunning && (
            <button
              onClick={() => {
                shouldStopRef.current = true;
                setError('Stopping generation...');
              }}
              className="w-full mb-6 py-2 px-4 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 hover:scale-105 transition-all duration-200 flex items-center justify-center space-x-2"
            >
              <X className="h-4 w-4" />
              <span>Stop Generation</span>
            </button>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <span className="text-red-800 text-sm">{error}</span>
            </div>
          )}

          {predictions.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-800">Generated Predictions</h3>
              
              {predictions.map((prediction, index) => (
                <div key={index} className="p-4 bg-gradient-to-r from-gray-50 to-white rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <span className={`text-sm font-semibold bg-gradient-to-r ${getPredictionColor(index)} bg-clip-text text-transparent`}>
                        Prediction {index + 1}
                      </span>
                      {prediction.validated && (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      Total attempts: {rollCounts[index]}
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 mb-2">
                    {prediction.numbers.map((num, numIndex) => (
                      <div
                        key={numIndex}
                        className={`w-10 h-10 rounded-full bg-gradient-to-br ${getPredictionColor(index)} text-white flex items-center justify-center text-sm font-bold shadow-md`}
                      >
                        {num}
                      </div>
                    ))}
                  </div>
                  
                  <div className="text-xs text-gray-600 mt-2">
                    {getValidationLabel(prediction, index)}
                  </div>
                </div>
              ))}
              
              <div className="mt-4 p-3 bg-purple-50 rounded-lg">
                <p className="text-xs text-purple-800">
                  <strong>Total Sequence Attempts:</strong> {sequenceAttempts} | 
                  <strong> Total Rolls:</strong> {rollCounts.reduce((a, b) => a + b, 0)} | 
                  <strong> Success Rate:</strong> {sequenceAttempts > 0 ? (1/sequenceAttempts * 100).toFixed(2) : 0}%
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
// ... [Previous code continues from RollingPredictionFeature] ...

// All Past Results Modal Component - FIXED DATA FILTER
const AllPastResultsModal = ({ gameType, onClose }) => {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPairs, setShowPairs] = useState(false);
  const [pairData, setPairData] = useState(null);
  
  const [timeUnit, setTimeUnit] = useState('all');
  const [sliderValue, setSliderValue] = useState(0);
  const [selectedDays, setSelectedDays] = useState(null);

  const TIME_PERIOD_OPTIONS = {
    all: [
      { value: 0, label: 'All Time', days: null }
    ],
    days: [
      { value: 1, label: '1 Day', days: 1 },
      { value: 2, label: '2 Days', days: 2 },
      { value: 3, label: '3 Days', days: 3 },
      { value: 4, label: '4 Days', days: 4 },
      { value: 5, label: '5 Days', days: 5 },
      { value: 6, label: '6 Days', days: 6 },
      { value: 7, label: '7 Days', days: 7 }
    ],
    months: [
      { value: 1, label: '1 Month', days: 30 },
      { value: 2, label: '2 Months', days: 60 },
      { value: 3, label: '3 Months', days: 90 },
      { value: 4, label: '4 Months', days: 120 },
      { value: 5, label: '5 Months', days: 150 },
      { value: 6, label: '6 Months', days: 180 },
      { value: 7, label: '7 Months', days: 210 },
      { value: 8, label: '8 Months', days: 240 },
      { value: 9, label: '9 Months', days: 270 },
      { value: 10, label: '10 Months', days: 300 },
      { value: 11, label: '11 Months', days: 330 },
      { value: 12, label: '12 Months', days: 365 }
    ],
    years: [
      { value: 1, label: '1 Year', days: 365 },
      { value: 2, label: '2 Years', days: 730 },
      { value: 3, label: '3 Years', days: 1095 },
      { value: 5, label: '5 Years', days: 1825 },
      { value: 10, label: '10 Years', days: 3650 }
    ]
  };

  useEffect(() => {
    fetchAllPastResults();
  }, [gameType, selectedDays]);

  const fetchAllPastResults = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const resultsResponse = await fetch(`${API_BASE_URL}/predictions/public-results/${gameType}?limit=999999`, {
        credentials: 'include'
      });
      
      if (!resultsResponse.ok) {
        setError('Failed to fetch results');
        setIsLoading(false);
        return;
      }
      
      const resultsData = await resultsResponse.json();
      
      if (!resultsData.success || !resultsData.results) {
        setError('No results data available');
        setIsLoading(false);
        return;
      }

      let filteredResults = resultsData.results;
      
      if (selectedDays !== null) {
        const toDate = new Date();
        toDate.setHours(23, 59, 59, 999);
        
        const fromDate = new Date();
        
        // FIXED: Make "1 Day" show exactly 1 day 
        if (selectedDays === 1) {
          fromDate.setHours(0, 0, 0, 0);
        } else {
          fromDate.setDate(fromDate.getDate() - selectedDays + 1);
          fromDate.setHours(0, 0, 0, 0);
        }

        console.log('=== DATE FILTER DEBUG ===');
        console.log('Selected days:', selectedDays);
        console.log('From date:', fromDate.toISOString());
        console.log('To date:', toDate.toISOString());
        console.log('Total results before filter:', resultsData.results.length);

        filteredResults = resultsData.results.filter(result => {
          const drawDate = new Date(result.drawDate);
          return drawDate >= fromDate && drawDate <= toDate;
        });
        
        console.log('Results after filter:', filteredResults.length);
        if (filteredResults.length > 0) {
          console.log('First result date:', filteredResults[0].drawDate);
          console.log('Last result date:', filteredResults[filteredResults.length - 1].drawDate);
        }
        console.log('=== END DEBUG ===');
      }

      const numberFrequency = {};
      
      filteredResults.forEach(result => {
        if (result.numbers && Array.isArray(result.numbers)) {
          result.numbers.forEach(num => {
            if (!numberFrequency[num]) {
              numberFrequency[num] = 0;
            }
            numberFrequency[num]++;
          });
        }
      });

      const sortedNumbers = Object.entries(numberFrequency)
        .map(([num, freq]) => ({
          number: parseInt(num),
          frequency: freq,
          percentage: ((freq / filteredResults.length) * 100).toFixed(1)
        }))
        .sort((a, b) => b.frequency - a.frequency);

      const dates = filteredResults.map(r => new Date(r.drawDate)).sort((a, b) => a - b);
      const dateRange = dates.length > 0 ? {
        from: dates[0].toISOString().split('T')[0],
        to: dates[dates.length - 1].toISOString().split('T')[0]
      } : { from: null, to: null };

      const processedData = {
        success: true,
        topNumbers: sortedNumbers,
        totalDraws: filteredResults.length,
        dateRange: dateRange
      };

      setData(processedData);
      calculatePairs(filteredResults);

    } catch (err) {
      setError('Failed to connect to server');
      console.error('Error fetching all past results:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const calculatePairs = async (filteredResults) => {
    try {
      const pairFrequency = {};
      
      filteredResults.forEach(result => {
        if (result.numbers && Array.isArray(result.numbers)) {
          const numbers = result.numbers;
          for (let i = 0; i < numbers.length; i++) {
            for (let j = i + 1; j < numbers.length; j++) {
              const pair = [numbers[i], numbers[j]].sort((a, b) => a - b);
              const pairKey = `${pair[0]}-${pair[1]}`;
              
              if (!pairFrequency[pairKey]) {
                pairFrequency[pairKey] = {
                  pair: pair,
                  frequency: 0
                };
              }
              pairFrequency[pairKey].frequency++;
            }
          }
        }
      });

      const sortedPairs = Object.values(pairFrequency)
        .map(item => ({
          pair: item.pair,
          frequency: item.frequency,
          percentage: ((item.frequency / filteredResults.length) * 100).toFixed(1)
        }))
        .sort((a, b) => b.frequency - a.frequency);

      setPairData({
        topPairs: sortedPairs.slice(0, 12),
        totalDraws: filteredResults.length,
        allPairs: sortedPairs.length
      });
    } catch (err) {
      console.error('Error calculating pairs:', err);
    }
  };

  const handleUnitChange = (unit) => {
    setTimeUnit(unit);
    
    if (unit === 'all') {
      setSliderValue(0);
      setSelectedDays(null);
    } else {
      const options = TIME_PERIOD_OPTIONS[unit];
      const middleIndex = Math.floor(options.length / 2);
      setSliderValue(middleIndex);
      const days = options[middleIndex].days;
      setSelectedDays(days);
    }
  };

  const handleSliderChange = (e) => {
    const index = parseInt(e.target.value);
    setSliderValue(index);
    const days = TIME_PERIOD_OPTIONS[timeUnit][index].days;
    setSelectedDays(days);
  };

  const currentOptions = TIME_PERIOD_OPTIONS[timeUnit];
  const currentSelection = currentOptions[sliderValue];

  const unitColors = {
    all: { bg: 'bg-gradient-to-br from-orange-50 to-orange-100', text: 'text-orange-700', active: 'bg-orange-600 text-white', gradient: 'from-orange-500 to-orange-600', border: 'border-orange-200' },
    days: { bg: 'bg-blue-50', text: 'text-blue-700', active: 'bg-blue-600 text-white', gradient: 'from-blue-500 to-blue-600', border: 'border-blue-200' },
    months: { bg: 'bg-green-50', text: 'text-green-700', active: 'bg-green-600 text-white', gradient: 'from-green-500 to-green-600', border: 'border-green-200' },
    years: { bg: 'bg-purple-50', text: 'text-purple-700', active: 'bg-purple-600 text-white', gradient: 'from-purple-500 to-purple-600', border: 'border-purple-200' }
  };

  const colors = unitColors[timeUnit];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-blue-50 to-blue-100">
          <div className="flex items-center space-x-2">
            <TrendingUp className="h-6 w-6 text-blue-600" />
            <div>
              <h3 className="text-xl font-bold text-gray-800">
                All Past Results Analysis - {gameType.toUpperCase()}
              </h3>
              <p className="text-sm text-gray-600">
                {showPairs ? 'Top 12 most frequent pairs' : 'Top 12 most frequent numbers'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-gray-500 hover:text-gray-700 hover:scale-110 transition-all duration-200 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className={`mb-4 p-4 rounded-lg ${colors.bg} border-2 ${colors.border}`}>
            <label className={`block text-sm font-semibold ${colors.text} mb-3`}>
              Analysis Time Period
            </label>
            
            <div className="grid grid-cols-4 gap-2 mb-4">
              {['all', 'days', 'months', 'years'].map((unit) => (
                <button
                  key={unit}
                  onClick={() => handleUnitChange(unit)}
                  disabled={isLoading}
                  className={`py-2 px-3 rounded-lg font-medium text-sm transition-all duration-200 hover:scale-105 ${
                    timeUnit === unit 
                      ? unitColors[unit].active + ' shadow-md'
                      : 'bg-white ' + unitColors[unit].text + ' hover:bg-opacity-80'
                  } ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {unit === 'all' ? 'All Time' : unit.charAt(0).toUpperCase() + unit.slice(1)}
                </button>
              ))}
            </div>

            <div className="text-center mb-3">
              <div className={`inline-block px-4 py-2 rounded-lg bg-gradient-to-r ${colors.gradient} text-white font-bold text-lg shadow-lg`}>
                {currentSelection.label}
              </div>
            </div>

            {timeUnit !== 'all' && (
              <>
                <div className="relative px-2">
                  <div className={`h-3 rounded-full bg-gradient-to-r ${timeUnit === 'days' ? 'from-blue-200 to-blue-300' : timeUnit === 'months' ? 'from-green-200 to-green-300' : 'from-purple-200 to-purple-300'} shadow-inner`}>
                    <div 
                      className={`h-3 rounded-full bg-gradient-to-r ${colors.gradient} transition-all duration-300 ease-out shadow-md`}
                      style={{ width: `${(sliderValue / (currentOptions.length - 1)) * 100}%` }}
                    />
                  </div>
                  
                  <input
                    type="range"
                    min={0}
                    max={currentOptions.length - 1}
                    value={sliderValue}
                    onChange={handleSliderChange}
                    disabled={isLoading}
                    className="absolute inset-0 w-full h-3 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                  />
                  
                  <div 
                    className={`absolute top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-gradient-to-br ${colors.gradient} shadow-lg border-2 border-white transition-all duration-200 hover:scale-110 ${isLoading ? 'opacity-50' : 'cursor-grab active:cursor-grabbing'}`}
                    style={{ left: `calc(${(sliderValue / (currentOptions.length - 1)) * 100}% - 12px)` }}
                  />
                </div>

                <div className="flex justify-between mt-3 px-1">
                  {currentOptions.map((opt, index) => (
                    <div key={index} className="flex flex-col items-center">
                      <div className={`text-xs font-medium ${index === sliderValue ? colors.text + ' font-bold' : 'text-gray-500'}`}>
                        {opt.value}
                      </div>
                      <div className={`w-0.5 h-2 mt-1 ${index === sliderValue ? 'bg-gray-500' : 'bg-gray-300'}`} />
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className={`mt-3 p-2 rounded ${
              timeUnit === 'all' ? 'bg-orange-100' :
              timeUnit === 'days' ? 'bg-blue-100' : 
              timeUnit === 'months' ? 'bg-green-100' : 
              'bg-purple-100'
            } text-xs ${colors.text}`}>
              <div className="flex items-start space-x-2">
                <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span>
                  {timeUnit === 'all' ? (
                    <strong>Analyzing all historical lottery data ever recorded</strong>
                  ) : selectedDays === 1 ? (
                    <>Analyzing lottery patterns from <strong>today only</strong> (most recent draw)</>
                  ) : (
                    <>
                      Analyzing lottery patterns from the past <strong>{currentSelection.label.toLowerCase()}</strong> ({currentSelection.days} days of historical data)
                    </>
                  )}
                </span>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-2" />
              <p className="text-gray-600">
                Analyzing historical data for {timeUnit === 'all' ? 'all time' : currentSelection.label.toLowerCase()}...
              </p>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800">{error}</p>
            </div>
          ) : data && data.totalDraws > 0 && data.topNumbers && data.topNumbers.length > 0 ? (
            <>
              <div className="mb-4 p-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg border border-blue-200">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Time Period: </span>
                    <span className="font-semibold text-gray-900">
                      {currentSelection.label}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Total Draws Analyzed: </span>
                    <span className="font-semibold text-blue-600 text-lg">
                      {data.totalDraws}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-center mb-4">
                <div className="inline-flex rounded-lg border-2 border-blue-300 bg-blue-50 p-1">
                  <button
                    onClick={() => setShowPairs(false)}
                    className={`px-4 py-2 rounded-md font-medium transition-all duration-200 hover:scale-105 ${
                      !showPairs
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-blue-700 hover:bg-blue-100'
                    }`}
                  >
                    Individual Numbers
                  </button>
                  <button
                    onClick={() => setShowPairs(true)}
                    className={`px-4 py-2 rounded-md font-medium transition-all duration-200 hover:scale-105 ${
                      showPairs
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'text-blue-700 hover:bg-blue-100'
                    }`}
                  >
                    Number Pairs
                  </button>
                </div>
              </div>

              {!showPairs ? (
                <>
                  <h4 className="font-semibold text-gray-800 mb-3 flex items-center space-x-2">
                    <TrendingUp className="h-5 w-5 text-green-600" />
                    <span>Top 12 Most Frequent Numbers ({currentSelection.label})</span>
                  </h4>

                  <div className="grid md:grid-cols-2 gap-2">
                    {data.topNumbers.slice(0, 12).map((item, index) => (
                      <div 
                        key={item.number}
                        className="flex items-center justify-between p-3 bg-gradient-to-r from-gray-50 to-white rounded-lg border hover:shadow-md transition-all duration-200"
                      >
                        <div className="flex items-center space-x-4">
                          <div className="text-sm font-bold text-gray-400 w-8">
                            #{index + 1}
                          </div>
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center text-lg font-bold shadow-lg">
                            {item.number}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-gray-800">
                              Number {item.number}
                            </div>
                            <div className="text-xs text-gray-500">
                              Appeared in {item.percentage}% of draws
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          <div className="text-right">
                            <div className="text-2xl font-bold text-blue-600">
                              {item.frequency}
                            </div>
                            <div className="text-xs text-gray-500">times</div>
                          </div>
                          <div className="w-24 bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-500"
                              style={{ 
                                width: `${(item.frequency / data.topNumbers[0].frequency) * 100}%` 
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="text-center text-sm text-gray-500 mt-4 p-3 bg-blue-50 rounded border border-blue-200">
                    <Info className="h-4 w-4 inline mr-2" />
                    Showing top 12 of {data.topNumbers.length} numbers from {data.totalDraws} draws 
                    {timeUnit === 'all' ? ' (All Time)' : ` in the past ${currentSelection.label.toLowerCase()}`}
                  </div>
                </>
              ) : (
                <>
                  <h4 className="font-semibold text-gray-800 mb-3 flex items-center space-x-2">
                    <TrendingUp className="h-5 w-5 text-purple-600" />
                    <span>Top 12 Most Frequent Number Pairs ({currentSelection.label})</span>
                  </h4>

                  {pairData && pairData.topPairs ? (
                    <>
                      <div className="grid md:grid-cols-2 gap-2">
                        {pairData.topPairs.map((item, index) => (
                          <div 
                            key={`${item.pair[0]}-${item.pair[1]}`}
                            className="flex items-center justify-between p-3 bg-gradient-to-r from-purple-50 to-white rounded-lg border hover:shadow-md transition-all duration-200"
                          >
                            <div className="flex items-center space-x-4">
                              <div className="text-sm font-bold text-gray-400 w-8">
                                #{index + 1}
                              </div>
                              <div className="flex items-center space-x-2">
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-purple-700 text-white flex items-center justify-center text-lg font-bold shadow-lg">
                                  {item.pair[0]}
                                </div>
                                <span className="text-gray-400 font-bold">+</span>
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-purple-700 text-white flex items-center justify-center text-lg font-bold shadow-lg">
                                  {item.pair[1]}
                                </div>
                              </div>
                              <div>
                                <div className="text-sm font-semibold text-gray-800">
                                  Pair {item.pair[0]}-{item.pair[1]}
                                </div>
                                <div className="text-xs text-gray-500">
                                  Appeared in {item.percentage}% of draws
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center space-x-3">
                              <div className="text-right">
                                <div className="text-2xl font-bold text-purple-600">
                                  {item.frequency}
                                </div>
                                <div className="text-xs text-gray-500">times</div>
                              </div>
                              <div className="w-24 bg-gray-200 rounded-full h-2">
                                <div 
                                  className="bg-gradient-to-r from-purple-500 to-purple-600 h-2 rounded-full transition-all duration-500"
                                  style={{ 
                                    width: `${(item.frequency / pairData.topPairs[0].frequency) * 100}%` 
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="text-center text-sm text-gray-500 mt-4 p-3 bg-purple-50 rounded border border-purple-200">
                        <Info className="h-4 w-4 inline mr-2" />
                        Showing top 12 of {pairData.allPairs} unique pairs from {pairData.totalDraws} draws 
                        {timeUnit === 'all' ? ' (All Time)' : ` in the past ${currentSelection.label.toLowerCase()}`}
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-purple-500 mb-2" />
                      <p className="text-gray-600">Calculating pair frequencies...</p>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <Database className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 font-medium mb-2">
                No draws found for {currentSelection.label}
              </p>
              <p className="text-sm text-gray-500 mb-3">
                Try selecting a longer time period or "All Time" to see if data exists
              </p>
              {selectedDays !== null && (
                <button
                  onClick={() => handleUnitChange('all')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 hover:scale-105 transition-all duration-200 text-sm"
                >
                  View All Time Results
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Custom Slider Component                          
const CustomSlider = ({ value, max, onChange, disabled, label, color = 'blue', icon: Icon }) => {
  const colorSchemes = {
    blue: {
      track: 'from-blue-200 to-blue-300',
      fill: 'from-blue-500 to-blue-600',
      thumb: 'bg-gradient-to-br from-blue-500 to-blue-700',
      label: 'text-blue-700 bg-blue-50'
    },
    green: {
      track: 'from-green-200 to-green-300',
      fill: 'from-green-500 to-green-600',
      thumb: 'bg-gradient-to-br from-green-500 to-green-700',
      label: 'text-green-700 bg-green-50'
    }
  };

  const scheme = colorSchemes[color];
  const percentage = (value / max) * 100;

  return (
    <div className="space-y-2">
      <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${scheme.label}`}>
        <div className="flex items-center space-x-2">
          {Icon && <Icon className="h-4 w-4" />}
          <span className="text-xs font-semibold">{label}</span>
        </div>
      </div>
      
      <div className="relative px-2">
        <div className={`h-3 rounded-full bg-gradient-to-r ${scheme.track} shadow-inner`}>
          <div 
            className={`h-3 rounded-full bg-gradient-to-r ${scheme.fill} transition-all duration-300 ease-out shadow-md`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        
        <input
          type="range"
          min={0}
          max={max}
          value={value}
          onChange={onChange}
          disabled={disabled}
          className="absolute inset-0 w-full h-3 opacity-0 cursor-pointer disabled:cursor-not-allowed"
          onClick={(e) => e.stopPropagation()}
        />
        
        <div 
          className={`absolute top-1/2 -translate-y-1/2 w-6 h-6 rounded-full ${scheme.thumb} shadow-lg border-2 border-white transition-all duration-200 hover:scale-110 ${disabled ? 'opacity-50' : 'cursor-grab active:cursor-grabbing'}`}
          style={{ left: `calc(${percentage}% - 12px)` }}
        />
      </div>

      <div className="flex justify-between px-2">
        {Array.from({ length: max + 1 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center">
            <div className={`w-0.5 h-1.5 ${i === value ? 'bg-gray-400' : 'bg-gray-300'}`} />
          </div>
        ))}
      </div>
    </div>
  );
};

// Auth Context 
const AuthContext = React.createContext(null);

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);
  
  const checkAuth = async () => {
    try {
      const response = await api.verifyAuth();
      if (response.authenticated && response.user) {
        setUser(response.user);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    } finally {
      setIsLoading(false);
    }
  };
  const register = async (credentials) => {
  try {
    const response = await api.register(credentials);
    if (response.success && response.user) {
      setUser(response.user);
      return { success: true };
    }
    return { success: false, error: response.error || 'Registration failed' };
  } catch (error) {
    return { success: false, error: error.message };
  }
};
  const login = async (credentials) => {
    try {
      const response = await api.login(credentials);
      if (response.success && response.user) {
        setUser(response.user);
        return { success: true };
      }
      return { success: false, error: response.error || 'Login failed' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const googleLogin = async (tokenId) => {
  try {
    const response = await api.googleLogin(tokenId);
    if (response.success && response.user) {
      setUser(response.user);
      return { success: true };
    }
    return { success: false, error: response.message || 'Google login failed' };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

  const logout = async () => {
  try {
    const response = await api.logout();
    if (response.success) {
      setUser(null);
      console.log('✅ User logged out successfully');
    } else {
      console.error('❌ Logout failed:', response.message);
    }
  } catch (error) {
    console.error('❌ Logout error:', error);
    // Force logout on client side even if API fails
    setUser(null);
  }
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isAdmin: user?.role === USER_ROLES.ADMIN,
      isGoogleUser: user?.authMethod === 'google',
      login,
      register,
      googleLogin,
      logout,
      checkAuth,
      isLoading
    }}>
      {children}
    </AuthContext.Provider>
  );
};

const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error('useAuth must be within AuthProvider');
  return context;
};

// Automation Results Component
const AutomationResults = ({ results, onClear }) => {
  if (!results) return null;

  return (
    <div className="mt-4 p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border-2 border-blue-200">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <Zap className="h-5 w-5 text-blue-600" />
          <h4 className="font-semibold text-blue-800">Automation Results</h4>
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
            {results.iterations} iterations
          </span>
        </div>
        <button onClick={onClear} className="text-gray-500 hover:text-gray-700 hover:scale-110 transition-all duration-200 text-xl">×</button>
      </div>

      <div className="mb-4">
        <p className="text-sm text-blue-700 mb-3 font-medium">
          Top Numbers from {results.iterations} iterations:
        </p>
        <div className="flex flex-wrap gap-2 justify-center">
          {results.topNumbers.map((number, index) => (
            <NumberBall 
              key={`auto-${number}-${index}`}
              number={number} 
              size="lg"
              delay={index * 100}
              colorScheme="red"
            />
          ))}
        </div>
        {results.bonus && (
          <div className="mt-4">
            <p className="text-sm text-blue-700 mb-2 font-medium">Bonus Number:</p>
            <div className="flex justify-center">
              <NumberBall 
                number={results.bonus} 
                isBonus={true}
                size="xl"
              />
            </div>
          </div>
        )}
      </div>

      <div className="p-3 bg-blue-100 rounded text-xs">
        <div className="space-y-1 text-blue-800">
          <div className="flex justify-between">
            <span>Total Iterations:</span>
            <span className="font-semibold">{results.iterations}</span>
          </div>
          <div className="flex justify-between">
            <span>Unique Combinations:</span>
            <span className="font-semibold">{results.allResults?.length || 0}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// Login Component 
const LoginForm = ({ onClose }) => {
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login, googleLogin } = useAuth();

  useEffect(() => {
    // Load Google Sign-In script
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    script.onload = () => {
      if (window.google && GOOGLE_CLIENT_ID) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleResponse,
        });
        window.google.accounts.id.renderButton(
          document.getElementById('googleSignInButton'),
          { 
            theme: 'outline', 
            size: 'large', 
            width: 350,
            text: 'signin_with',
            shape: 'rectangular'
          }
        );
      }
    };

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const handleGoogleResponse = async (response) => {
    setIsLoading(true);
    setError('');
    
    try {
      const result = await googleLogin(response.credential);
      if (result.success) {
        onClose();
      } else {
        setError(result.error || 'Google login failed');
      }
    } catch (err) {
      setError('Google login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!credentials.username || !credentials.password) {
      setError('Please enter username and password');
      return;
    }

    setIsLoading(true);
    setError('');
    
    try {
      const result = await login(credentials);
      if (result.success) {
        onClose();
      } else {
        setError(result.error || 'Login failed');
      }
    } catch (err) {
      setError('Connection failed. Check if backend is running.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96 max-w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold flex items-center space-x-2">
            <Lock className="h-5 w-5" />
            <span>Sign in to continue</span>
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 hover:scale-110 transition-all duration-200 text-xl">×</button>
        </div>
        
        <div className="space-y-4">
          {/* Google Sign-In Button */}
          <div className="flex justify-center">
            <div id="googleSignInButton"></div>
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Or continue with</span>
            </div>
          </div>

          {/* Username/Password Login */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input
              type="text"
              value={credentials.username}
              onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
              onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your username"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={credentials.password}
              onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
              onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your password"
            />
          </div>
          
          {error && (
            <div className="p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {error}
            </div>
          )}
          
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 hover:scale-105 transition-all duration-200 disabled:opacity-50 font-medium"
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>

          {/* Demo credentials hint */}
          <div className="text-center">
            <p className="text-xs text-gray-500 mt-2">
              Demo: admin / admin123
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Automated Scheduler Component 
const AutomatedScheduler = ({ gameType }) => {
  const [schedulerStatus, setSchedulerStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState('every-6-hours');
  const [notification, setNotification] = useState(null);

  const schedulePresets = {
    'every-hour': { label: 'Every Hour', cron: '0 * * * *' },
    'every-3-hours': { label: 'Every 3 Hours', cron: '0 */3 * * *' },
    'every-6-hours': { label: 'Every 6 Hours', cron: '0 */6 * * *' },
    'every-12-hours': { label: 'Every 12 Hours', cron: '0 */12 * * *' },
    'daily-midnight': { label: 'Daily at Midnight', cron: '0 0 * * *' },
    'daily-noon': { label: 'Daily at Noon', cron: '0 12 * * *' },
    'twice-daily': { label: 'Twice Daily', cron: '0 0,12 * * *' }
  };

  useEffect(() => {
    loadSchedulerStatus();
    const interval = setInterval(loadSchedulerStatus, 10000);
    return () => clearInterval(interval);
  }, [gameType]);

  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const loadSchedulerStatus = async () => {
    try {
      const response = await api.getSchedulerStatus(gameType);
      if (response.success) {
        setSchedulerStatus(response.status);
      }
    } catch (error) {
      console.error('Failed to load scheduler status:', error);
    }
  };

  const handleToggleScheduler = async () => {
    setIsLoading(true);
    try {
      if (schedulerStatus?.enabled) {
        const response = await api.stopScheduler(gameType);
        if (response.success) {
          showNotification('Automated updates stopped', 'info');
          loadSchedulerStatus();
        } else {
          showNotification('Failed to stop scheduler', 'error');
        }
      } else {
        const schedule = schedulePresets[selectedPreset].cron;
        const response = await api.startScheduler(gameType, schedule);
        if (response.success) {
          showNotification('Automated updates started!', 'success');
          loadSchedulerStatus();
        } else {
          showNotification('Failed to start scheduler', 'error');
        }
      }
    } catch (error) {
      showNotification(error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualTrigger = async () => {
    setIsLoading(true);
    try {
      const response = await api.triggerManualScrape(gameType);
      if (response.success) {
        showNotification(`Updated! ${response.added} new results added`, 'success');
        loadSchedulerStatus();
      } else {
        // Check for Chrome browser error
        const errorMsg = response.error || 'Manual update failed';
        if (errorMsg.includes('google-chrome-stable') || errorMsg.includes('Browser was not found')) {
          showNotification('⚠️ Chrome browser not installed on server. This is a server configuration issue.', 'error');
          // Provide helpful information
          setTimeout(() => {
            showNotification('💡 Contact your administrator to install Chrome/Chromium on the server for web scraping to work.', 'info');
          }, 3000);
        } else if (errorMsg.includes('executablePath')) {
          showNotification('⚠️ Browser configuration error. The server needs Chrome installed.', 'error');
        } else {
          showNotification(errorMsg, 'error');
        }
      }
    } catch (error) {
      const errorMsg = error.message || 'Unknown error';
      // Handle Chrome browser not found error
      if (errorMsg.includes('google-chrome-stable') || errorMsg.includes('executablePath')) {
        showNotification('❌ Chrome browser not available on server', 'error');
        setTimeout(() => {
          showNotification('ℹ️ The server administrator needs to install Chrome or Chromium for the scraper to work', 'info');
        }, 2000);
      } else {
        showNotification(errorMsg, 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const getStatusColor = () => {
    if (!schedulerStatus) return 'gray';
    if (schedulerStatus.status === 'running') return 'blue';
    if (schedulerStatus.status === 'error') return 'red';
    if (schedulerStatus.enabled) return 'green';
    return 'gray';
  };

  const statusColors = {
    blue: 'bg-blue-100 text-blue-800 border-blue-300',
    green: 'bg-green-100 text-green-800 border-green-300',
    red: 'bg-red-100 text-red-800 border-red-300',
    gray: 'bg-gray-100 text-gray-800 border-gray-300'
  };

  return (
    <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg border-2 border-blue-200">
      {notification && (
        <div className={`mb-3 p-3 rounded-lg text-sm font-medium border-2 shadow-sm ${
          notification.type === 'success' ? 'bg-green-100 text-green-800 border-green-300' :
          notification.type === 'error' ? 'bg-red-100 text-red-800 border-red-300' :
          notification.type === 'warning' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
          notification.type === 'info' ? 'bg-blue-100 text-blue-800 border-blue-300' :
          'bg-gray-100 text-gray-800 border-gray-300'
        }`}>
          {notification.message}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Activity className="h-5 w-5 text-blue-600" />
          <h4 className="font-semibold text-blue-900">Automated Updates</h4>
        </div>
        <div className={`px-3 py-1 rounded-full border-2 text-xs font-semibold ${statusColors[getStatusColor()]}`}>
          {schedulerStatus?.enabled ? (schedulerStatus.status === 'running' ? 'UPDATING' : 'ACTIVE') : 'STOPPED'}
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Update Frequency</label>
          <select
            value={selectedPreset}
            onChange={(e) => setSelectedPreset(e.target.value)}
            disabled={isLoading || schedulerStatus?.enabled}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:bg-gray-100"
          >
            {Object.entries(schedulePresets).map(([key, preset]) => (
              <option key={key} value={key}>{preset.label}</option>
            ))}
          </select>
          {schedulerStatus?.enabled && (
            <p className="text-xs text-gray-600 mt-1">
              Stop scheduler to change frequency
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleToggleScheduler}
            disabled={isLoading}
            className={`px-4 py-2 rounded-lg font-medium text-white disabled:opacity-50 flex items-center justify-center space-x-2 transition-all duration-200 hover:scale-105 ${
              schedulerStatus?.enabled 
                ? 'bg-red-600 hover:bg-red-700' 
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                {schedulerStatus?.enabled ? (
                  <>
                    <X className="h-4 w-4" />
                    <span>Stop Auto</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Start Auto</span>
                  </>
                )}
              </>
            )}
          </button>

          <button
            onClick={handleManualTrigger}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 flex items-center justify-center space-x-2 transition-all duration-200 hover:scale-105"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Zap className="h-4 w-4" />
                <span>Update Now</span>
              </>
            )}
          </button>
        </div>

        <div className="bg-white p-3 rounded-lg border border-blue-200">
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-600">Last Update:</span>
              <span className="font-semibold text-gray-900">
                {formatDate(schedulerStatus?.lastRun)}
              </span>
            </div>
            {schedulerStatus?.enabled && schedulerStatus?.nextRun && (
              <div className="flex justify-between">
                <span className="text-gray-600">Next Update:</span>
                <span className="font-semibold text-green-700">
                  {formatDate(schedulerStatus.nextRun)}
                </span>
              </div>
            )}
            {schedulerStatus?.lastResult && (
              <div className="pt-2 border-t border-gray-200">
                {schedulerStatus.lastResult.success ? (
                  <div className="flex justify-between text-green-700">
                    <span>Last Run:</span>
                    <span className="font-semibold">
                      +{schedulerStatus.lastResult.added} new
                    </span>
                  </div>
                ) : (
                  <div className="text-red-700 text-xs">
                    Error: {schedulerStatus.lastResult.error}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="bg-blue-100 p-2 rounded text-xs text-blue-800">
          <p className="flex items-start space-x-2">
            <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
            <span>
              When enabled, the system will automatically fetch and update lottery results at the selected interval.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};

// Notification Component 
const Notification = ({ message, type = 'info', onClose }) => {
  const styles = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    warning: 'bg-red-50 border-red-200 text-red-800'
  };

  const icons = {
    success: <CheckCircle2 className="h-5 w-5" />,
    error: <AlertCircle className="h-5 w-5" />,
    info: <Info className="h-5 w-5" />,
    warning: <AlertCircle className="h-5 w-5" />
  };

  return (
    <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg border-2 shadow-lg ${styles[type]} animate-slide-in max-w-md`}>
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          {icons[type]}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium">{message}</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="flex-shrink-0 hover:opacity-70 hover:scale-110 transition-all duration-200">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};

// Confirmation Dialog Component 
const ConfirmDialog = ({ message, onConfirm, onCancel }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <div className="flex items-start space-x-3 mb-4">
          <AlertCircle className="h-6 w-6 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Confirm Action</h3>
            <p className="text-gray-600">{message}</p>
          </div>
        </div>
        <div className="flex space-x-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 hover:scale-105 transition-all duration-200 font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 hover:scale-105 transition-all duration-200 font-medium"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};
const UserManagementContent = ({ showNotification, showConfirm }) => {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [cleanupEmail, setCleanupEmail] = useState('');
  const [showCleanupForm, setShowCleanupForm] = useState(false);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/users/list`, {
        credentials: 'include'
      });
      
      if (response.status === 401) {
        showNotification('Please log in as admin', 'error');
        return;
      }
      
      if (response.status === 403) {
        showNotification('Admin access required', 'error');
        return;
      }
      
      const data = await response.json();
      
      if (data.success) {
        setUsers(data.users);
        showNotification(`Loaded ${data.total} users`, 'success');
      } else {
        showNotification(data.error || 'Failed to load users', 'error');
      }
    } catch (error) {
      showNotification('Failed to load users: ' + error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteUser = async (userId, username) => {
    const confirmed = await showConfirm(
      `Are you sure you want to delete user "${username}"? This action cannot be undone.`
    );
    
    if (!confirmed) return;

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/users/${userId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      const data = await response.json();
      
      if (data.success) {
        showNotification(`User "${username}" deleted successfully`, 'success');
        loadUsers();
      } else {
        showNotification(data.error || 'Failed to delete user', 'error');
      }
    } catch (error) {
      showNotification('Failed to delete user: ' + error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteAllUsers = async () => {
    const confirmed = await showConfirm(
      '⚠️ WARNING: This will delete ALL non-admin users! This action cannot be undone. Are you absolutely sure?'
    );
    
    if (!confirmed) return;

    const doubleConfirm = await showConfirm(
      '🚨 FINAL CONFIRMATION: Delete all users except admins?'
    );
    
    if (!doubleConfirm) return;

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/users/delete-all`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      const data = await response.json();
      
      if (data.success) {
        showNotification(`Successfully deleted ${data.deletedCount} users`, 'success');
        loadUsers();
      } else {
        showNotification(data.error || 'Failed to delete users', 'error');
      }
    } catch (error) {
      showNotification('Failed to delete users: ' + error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const cleanupGoogleUser = async () => {
    if (!cleanupEmail || cleanupEmail.trim().length === 0) {
      showNotification('Please enter an email address', 'error');
      return;
    }

    const confirmed = await showConfirm(
      `Remove stuck Google registration for: ${cleanupEmail}?`
    );
    
    if (!confirmed) return;

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/users/cleanup-google/${encodeURIComponent(cleanupEmail)}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      const data = await response.json();
      
      if (data.success) {
        showNotification(data.message, 'success');
        setCleanupEmail('');
        setShowCleanupForm(false);
        loadUsers();
      } else {
        showNotification(data.error || 'Cleanup failed', 'error');
      }
    } catch (error) {
      showNotification('Cleanup failed: ' + error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-2">
          <User className="h-6 w-6 text-blue-600" />
          <h3 className="text-xl font-bold text-gray-800">User Management</h3>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={loadUsers}
            disabled={isLoading}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all duration-200 disabled:opacity-50"
          >
            <RotateCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={deleteAllUsers}
            disabled={isLoading || users.length <= 1}
            className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all duration-200 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            <span>Delete All Users</span>
          </button>
          <button
            onClick={() => setShowCleanupForm(!showCleanupForm)}
            className="flex items-center space-x-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-all duration-200"
          >
            <AlertCircle className="h-4 w-4" />
            <span>Cleanup Google User</span>
          </button>
        </div>
      </div>

      {showCleanupForm && (
        <div className="mb-4 p-4 bg-yellow-50 border-2 border-yellow-200 rounded-lg">
          <h4 className="font-semibold text-yellow-900 mb-3 flex items-center space-x-2">
            <AlertCircle className="h-5 w-5" />
            <span>Remove Stuck Google Registration</span>
          </h4>
          <p className="text-sm text-yellow-800 mb-3">
            If a Google account is stuck saying "already registered" but can't login, enter the email here to clean it up.
          </p>
          <div className="flex space-x-2">
            <input
              type="email"
              value={cleanupEmail}
              onChange={(e) => setCleanupEmail(e.target.value)}
              placeholder="Enter Google email address"
              className="flex-1 px-3 py-2 border border-yellow-300 rounded-lg focus:ring-2 focus:ring-yellow-500"
              disabled={isLoading}
            />
            <button
              onClick={cleanupGoogleUser}
              disabled={isLoading || !cleanupEmail}
              className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-all duration-200 disabled:opacity-50 flex items-center space-x-2"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <span>Clean Up</span>
            </button>
          </div>
        </div>
      )}
<div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
        <div className="flex items-start space-x-2">
          <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-800">
            <p className="font-medium">Important:</p>
            <ul className="mt-1 ml-4 list-disc">
              <li>Admin accounts cannot be deleted</li>
              <li>You cannot delete your own account</li>
              <li>"Delete All" removes all non-admin users</li>
              <li>"Cleanup Google User" removes stuck registrations by email</li>
            </ul>
          </div>
        </div>
      </div>

      {isLoading && users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-2" />
          <p className="text-gray-600">Loading users...</p>
        </div>
      ) : (
        <div className="space-y-2">
          {users.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <User className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">No users found</p>
            </div>
          ) : (
            <>
              <div className="mb-2 text-sm text-gray-600">
                Total Users: <span className="font-semibold">{users.length}</span>
              </div>
              {users.map((user) => (
                <div
                  key={user._id}
                  className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-lg hover:shadow-md transition-all duration-200"
                >
                  <div className="flex items-center space-x-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      user.role === 'admin' ? 'bg-red-100' : 'bg-blue-100'
                    }`}>
                      {user.role === 'admin' ? (
                        <Shield className="h-5 w-5 text-red-600" />
                      ) : (
                        <User className="h-5 w-5 text-blue-600" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-gray-800">{user.username}</span>
                        {user.role === 'admin' && (
                          <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full font-medium">
                            ADMIN
                          </span>
                        )}
                        {user.authProvider === 'google' && (
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                            Google
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-600">
                        {user.email || 'No email'}
                      </div>
                      <div className="text-xs text-gray-400">
                        ID: {user._id} | Last Login: {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => deleteUser(user._id, user.username)}
                    disabled={isLoading || user.role === 'admin'}
                    className="flex items-center space-x-2 px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="text-sm">Delete</span>
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
};
// Admin Panel Component 
const AdminPanel = ({ onClose }) => {
  const { user, isGoogleUser } = useAuth();
  const [historicalResults, setHistoricalResults] = useState({});
  const [selectedGameType, setSelectedGameType] = useState('539');
  const [isLoading, setIsLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showScraper, setShowScraper] = useState(false);
  const [activeTab, setActiveTab] = useState('historical'); // or 'users'
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
    hasMore: false
  });
  const [newResult, setNewResult] = useState({ 
    number1: '', number2: '', number3: '', number4: '', number5: '', number6: '',
    bonus: '', drawDate: '' 
  });
  const [notification, setNotification] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  // Prevent Google users from accessing admin panel
  if (isGoogleUser) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg p-8 max-w-md w-full">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-800 flex items-center space-x-2">
              <AlertCircle className="h-6 w-6 text-red-500" />
              <span>Access Denied</span>
            </h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
              <X className="h-6 w-6" />
            </button>
          </div>
          <div className="mb-6">
            <p className="text-gray-600 mb-4">
              Google Sign-In users cannot access the Admin Panel due to security restrictions.
            </p>
            <p className="text-gray-600">
              Please log out and sign in using regular admin credentials to access administrative features.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const showConfirm = (message) => {
    return new Promise((resolve) => {
      setConfirmDialog({
        message,
        onConfirm: () => {
          setConfirmDialog(null);
          resolve(true);
        },
        onCancel: () => {
          setConfirmDialog(null);
          resolve(false);
        }
      });
    });
  };

  useEffect(() => {
    loadHistoricalResults(selectedGameType, 1);
  }, [selectedGameType]);

  const handleNumberChange = (field, value) => {
    setNewResult(prev => ({ ...prev, [field]: value }));
  };

  const loadHistoricalResults = async (gameType, page = 1, append = false) => {
    setIsLoading(true);
    try {
      const fetchUrl = `${API_BASE_URL}/admin/historical-results/${gameType}?page=${page}&limit=50`;
      console.log("Fetching from URL:", fetchUrl);
      const response = await fetch(fetchUrl, {
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (response.status === 401) throw new Error('Not authenticated');
      if (response.status === 403) throw new Error('Admin access required');
      
      // Handle HTML or non-JSON responses
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        // If we get HTML, it might be a login page or error page
        const text = await response.text();
        console.error('Got non-JSON response:', text.substring(0, 200));
        // Use mock data as fallback
        const mockResults = [];
        const maxNumber = gameType === '539' ? 39 : 49;
        const numberCount = gameType === '539' ? 5 : 6;
        for (let i = 0; i < 20; i++) {
          const numbers = [];
          while (numbers.length < numberCount) {
            const num = Math.floor(Math.random() * maxNumber) + 1;
            if (!numbers.includes(num)) numbers.push(num);
          }
          const date = new Date();
          date.setDate(date.getDate() - (i * 3));
          mockResults.push({
            _id: 'mock-' + i,
            drawDate: date.toISOString().split('T')[0],
            numbers: numbers.sort((a, b) => a - b),
            bonus: gameType !== '539' ? Math.floor(Math.random() * maxNumber) + 1 : null
          });
        }
        setHistoricalResults(prev => ({
          ...prev,
          [gameType]: { results: mockResults }
        }));
        showNotification('Using mock data - Server returned HTML instead of JSON', 'warning');
        setIsLoading(false);
        return;
      }
      
      if (!response.ok) throw new Error('HTTP ' + response.status);
      
      const data = await response.json();
      console.log('Admin Panel API Response:', data);
      
      // Handle different response structures
      let resultsData = [];
      
      // Check if data is an array directly
      if (Array.isArray(data)) {
        resultsData = data;
      } else if (data.results) {
        resultsData = data.results;
      } else if (data.data) {
        resultsData = data.data;
      } else if (data.docs) {
        // Some APIs return docs property
        resultsData = data.docs;
      }
      
   console.log('Extracted results data:', resultsData.length, 'items');

// Helper function to safely parse dates
const parseDate = (dateStr) => {
  if (!dateStr) return new Date(0); // Return epoch if no date
  const date = new Date(dateStr);
  // Check if date is valid
  if (isNaN(date.getTime())) {
    console.warn('Invalid date:', dateStr);
    return new Date(0);
  }
  return date;
};

// Sort results by date (newest first) with logging
const sortedResults = [...resultsData].sort((a, b) => {
  const dateA = parseDate(a.drawDate);
  const dateB = parseDate(b.drawDate);
  return dateB.getTime() - dateA.getTime(); // Descending order (newest first)
});

// Log first few dates for debugging
if (sortedResults.length > 0) {
  console.log('First 3 sorted dates:', 
    sortedResults.slice(0, 3).map(r => r.drawDate)
  );
}

// Always set the results regardless of success flag
if (resultsData.length > 0 || !isLoading) {
  setHistoricalResults(prev => {
    // When appending, combine arrays and re-sort to maintain proper date order
    const existingResults = prev[gameType]?.results || [];
    const combinedResults = append 
      ? [...existingResults, ...sortedResults]
      : sortedResults;
    
    // Re-sort combined results to ensure proper date order across pagination
    const finalResults = append 
      ? combinedResults.sort((a, b) => {
          const dateA = parseDate(a.drawDate);
          const dateB = parseDate(b.drawDate);
          return dateB.getTime() - dateA.getTime(); // Descending order (newest first)
        })
      : combinedResults;
    
    // Log after sorting
    if (finalResults.length > 0) {
      console.log('Final sorted - First 5 dates:', 
        finalResults.slice(0, 5).map(r => r.drawDate)
      );
    }
    
    return {
      ...prev,
      [gameType]: {
        results: finalResults
      }
    };
  });
        
        // Handle pagination
        if (data.pagination) {
          setPagination(data.pagination);
        } else if (data.total !== undefined || data.totalDocs !== undefined) {
          const total = data.total || data.totalDocs || resultsData.length;
          setPagination({
            page: data.page || 1,
            limit: data.limit || 50,
            total: total,
            totalPages: Math.ceil(total / (data.limit || 50)),
            hasMore: data.hasNextPage || data.hasMore || false
          });
        } else {
          // Default pagination if none provided
          setPagination({
            page: 1,
            limit: 50,
            total: resultsData.length,
            totalPages: 1,
            hasMore: false
          });
        }
        console.log('Historical results loaded successfully:', resultsData.length, 'items');
      }
    } catch (error) {
      console.error('Failed to load historical results:', error);
      showNotification('Failed to load results: ' + error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadMore = () => {
    const nextPage = pagination.page + 1;
    loadHistoricalResults(selectedGameType, nextPage, true);
  };

  // Fixed handleAddResult function for App.js
// Replace the handleAddResult function (around line 2287-2327) with this version:

const handleAddResult = async () => {
  const numbers = [];
  const numberCount = selectedGameType === '539' ? 5 : 6;
  
  // Validate and collect numbers
  for (let i = 1; i <= numberCount; i++) {
    const num = parseInt(newResult[`number${i}`]);
    if (isNaN(num) || num < 1) {
      showNotification(`Please enter valid number ${i}`, 'error');
      return;
    }
    numbers.push(num);
  }

  // Build the result object
  const result = {
    numbers,
    drawDate: newResult.drawDate || new Date().toISOString().split('T')[0]
  };

  // Add bonus number if applicable
  if (newResult.bonus && (selectedGameType === 'mark6' || selectedGameType === 'lotto649')) {
    const bonusNum = parseInt(newResult.bonus);
    if (!isNaN(bonusNum)) {
      result.bonus = bonusNum;
    }
  }

  setIsLoading(true);
  try {
    // IMPORTANT: Capture the response from the API
    const response = await api.addHistoricalResult(selectedGameType, result);
    
    // Check if successful and use the returned data
    if (response && response.success) {
      // Clear the form
      setNewResult({ 
        number1: '', number2: '', number3: '', number4: '', number5: '', number6: '',
        bonus: '', drawDate: '' 
      });
      setShowAddForm(false);
      
      // If backend returns updated results, use them directly
      if (response.results) {
        setHistoricalResults(prev => ({
          ...prev,
          [selectedGameType]: {
            results: response.results
          }
        }));
        
        // Update pagination if total is provided
        if (response.total !== undefined) {
          setPagination(prev => ({
            ...prev,
            total: response.total,
            totalPages: Math.ceil(response.total / prev.limit)
          }));
        }
        
        showNotification(`Result added successfully! Total: ${response.total || response.results.length}`, 'success');
      } else {
        // Fallback: reload results from backend
        await loadHistoricalResults(selectedGameType, 1);
        showNotification('Result added successfully!', 'success');
      }
    } else {
      // Handle failure response
      showNotification(response?.error || 'Failed to add result', 'error');
    }
  } catch (error) {
    showNotification('Failed to add result: ' + error.message, 'error');
  } finally {
    setIsLoading(false);
  }
};

  const handleDeleteResult = async (resultId) => {
    const confirmed = await showConfirm('Are you sure you want to delete this result?');
    if (!confirmed) return;

    setIsLoading(true);
    try {
      await api.deleteHistoricalResult(selectedGameType, resultId);
      loadHistoricalResults(selectedGameType, 1);
      showNotification('Result deleted successfully', 'success');
    } catch (error) {
      showNotification('Failed to delete result: ' + error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

 const handleSync = async () => {
  const confirmed = await showConfirm('Sync backend Excel data? This will reload all data from the Excel file.');
  if (!confirmed) return;

  setIsLoading(true);
  try {
    const response = await api.syncBackendExcel(selectedGameType);
    
    if (response.success && response.results) {
      // ✅ Use the sorted results directly from sync response
      setHistoricalResults(prev => ({
        ...prev,
        [selectedGameType]: {
          results: response.results  // Already sorted by backend
        }
      }));
      
      // Update pagination
      if (response.total !== undefined) {
        setPagination({
          page: 1,
          limit: 50,
          total: response.total,
          totalPages: Math.ceil(response.total / 50),
          hasMore: false
        });
      }
      
      showNotification(
        `Sync completed! ${response.data?.length || response.results?.length || 0} results loaded`,
        'success'
      );
    } else {
      showNotification('Sync failed: ' + (response.error || 'Unknown error'), 'error');
    }
  } catch (error) {
    showNotification('Sync failed: ' + error.message, 'error');
  } finally {
    setIsLoading(false);
  }
};

  const numberCount = selectedGameType === '539' ? 5 : 6;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between p-6 border-b">
            <h2 className="text-2xl font-bold flex items-center space-x-2">
              <Shield className="h-6 w-6 text-blue-600" />
              <span>Admin Panel - Historical Data</span>
            </h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 hover:scale-110 transition-all duration-200 text-2xl">×</button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex space-x-2">
                  {['539', 'mark6', 'lotto649'].map(gameType => (
                    <button
                      key={gameType}
                      onClick={() => setSelectedGameType(gameType)}
                      className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 hover:scale-105 ${
                        selectedGameType === gameType
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {gameType.toUpperCase()}
                    </button>
                  ))}
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 hover:scale-105 transition-all duration-200"
                  >
                    <span>{showAddForm ? 'Hide Form' : 'Add New Result'}</span>
                  </button>
                  <button
                    onClick={handleSync}
                    disabled={isLoading}
                    className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 hover:scale-105 transition-all duration-200 disabled:opacity-50"
                  >
                    <Database className="h-4 w-4" />
                    <span>Sync Excel</span>
                  </button>
                  {(selectedGameType === '539' || selectedGameType === 'mark6' || selectedGameType === 'lotto649') && (
                    <button
                      onClick={() => setShowScraper(true)}
                      className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 hover:scale-105 transition-all duration-200"
                    >
                      <Database className="h-4 w-4" />
                      <span>Auto Update Results</span>
                    </button>
                  )}
                </div>
              </div>

              {showAddForm && (
                <div className="bg-gray-50 p-4 rounded-lg mb-4 border-2 border-blue-200">
                  <h3 className="font-semibold mb-3 text-lg">Add New Result</h3>
                  
                  <div className="mb-3">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Numbers (1-{selectedGameType === '539' ? '39' : '49'})
                    </label>
                    <div className={`grid grid-cols-${numberCount} gap-2 mb-3`}>
                      {Array.from({ length: numberCount }).map((_, index) => (
                        <input
                          key={index}
                          type="number"
                          min="1"
                          max={selectedGameType === '539' ? '39' : '49'}
                          placeholder={`#${index + 1}`}
                          value={newResult[`number${index + 1}`]}
                          onChange={(e) => handleNumberChange(`number${index + 1}`, e.target.value)}
                          className="px-3 py-2 border rounded text-center"
                        />
                      ))}
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-3">
                    {(selectedGameType === 'mark6' || selectedGameType === 'lotto649') && (
                      <input
                        type="number"
                        min="1"
                        max="49"
                        placeholder="Bonus Number"
                        value={newResult.bonus}
                        onChange={(e) => handleNumberChange('bonus', e.target.value)}
                        className="px-3 py-2 border rounded"
                      />
                    )}
                    <input
                      type="date"
                      value={newResult.drawDate}
                      onChange={(e) => handleNumberChange('drawDate', e.target.value)}
                      className="px-3 py-2 border rounded"
                    />
                  </div>
                  
                  <div className="flex space-x-2 mt-3">
                    <button
                      onClick={handleAddResult}
                      disabled={isLoading}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 hover:scale-105 transition-all duration-200 disabled:opacity-50"
                    >
                      Add Result
                    </button>
                    <button
                      onClick={() => setShowAddForm(false)}
                      className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 hover:scale-105 transition-all duration-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">Historical Results</h3>
                {pagination.total > 0 && (
                  <div className="text-sm text-gray-600 bg-blue-50 px-3 py-1 rounded-full">
                    Showing <span className="font-semibold">{historicalResults[selectedGameType]?.results?.length || 0}</span> of <span className="font-semibold">{pagination.total}</span>
                  </div>
                )}
              </div>

              {isLoading && (!historicalResults[selectedGameType]?.results || historicalResults[selectedGameType].results.length === 0) ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-2" />
                  <p className="text-gray-600">Loading results...</p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {historicalResults[selectedGameType]?.results?.length > 0 ? (
                      historicalResults[selectedGameType].results.map((result, index) => (
                        <div key={result.id || index} className="flex items-center justify-between p-3 bg-white border rounded-lg hover:shadow-md transition-all duration-200">
                          <div className="flex items-center space-x-4">
                            <div className="text-sm text-gray-500 min-w-[100px]">
                              {result.drawDate ? new Date(result.drawDate).toLocaleDateString() : 'N/A'}
                            </div>
                            <div className="flex space-x-1">
                              {result.numbers?.map((num, i) => (
                                <div key={i} className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center text-xs font-bold">
                                  {num}
                                </div>
                              ))}
                              {result.bonus && (
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-blue-800 text-white flex items-center justify-center text-xs font-bold">
                                  {result.bonus}
                                </div>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteResult(result.id)}
                            disabled={isLoading}
                            className="text-red-600 hover:text-red-800 hover:scale-105 transition-all duration-200 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                        <Database className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                        <p className="text-gray-500">No historical results</p>
                      </div>
                    )}
                  </div>

                  {pagination.hasMore && (
                    <div className="flex justify-center mt-6">
                      <button
                        onClick={handleLoadMore}
                        disabled={isLoading}
                        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 hover:scale-105 transition-all duration-200 disabled:opacity-50 flex items-center space-x-2"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Loading...</span>
                          </>
                        ) : (
                          <>
                            <span>Load More Results</span>
                            <span className="text-xs bg-blue-500 px-2 py-1 rounded">
                              {historicalResults[selectedGameType]?.results?.length || 0} / {pagination.total}
                            </span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {!pagination.hasMore && pagination.total > 0 && (
                    <div className="text-center text-sm bg-green-50 text-green-700 py-3 rounded-lg">
                      <CheckCircle2 className="h-4 w-4 inline mr-2" />
                      All {pagination.total} results loaded
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {showScraper && <WebScraperPanel gameType={selectedGameType} onClose={() => setShowScraper(false)} />}
      
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}

      {confirmDialog && (
        <ConfirmDialog
          message={confirmDialog.message}
          onConfirm={confirmDialog.onConfirm}
          onCancel={confirmDialog.onCancel}
        />
      )}
    </>
  );
};

// Web Scraper Panel Component 
const WebScraperPanel = ({ gameType, onClose }) => {
  const gameDetails = {
    '539': { 
      name: 'Taiwan Daily Cash 539', 
      numbers: '5 numbers (1-39)',
      url: 'Taiwan 539'
    },
    'mark6': { 
      name: 'Hong Kong Mark 6', 
      numbers: '6 numbers + bonus (1-49)',
      url: 'Hong Kong Mark Six'
    },
    'lotto649': { 
      name: 'Taiwan Lotto 649', 
      numbers: '6 numbers + bonus (1-49)',
      url: 'Taiwan Lotto 649'
    }
  };

  const details = gameDetails[gameType] || gameDetails['539'];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b bg-gradient-to-r from-blue-50 to-blue-100">
          <div>
            <h2 className="text-2xl font-bold flex items-center space-x-2">
              <Database className="h-6 w-6 text-blue-600" />
              <span>Automated Updates - {gameType.toUpperCase()}</span>
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Configure automatic lottery result updates for {details.name}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 hover:scale-110 transition-all duration-200 text-2xl">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <AutomatedScheduler gameType={gameType} />

          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="font-semibold text-blue-900 mb-2 flex items-center space-x-2">
              <Activity className="h-4 w-4" />
              <span>How It Works</span>
            </h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Automatically fetches latest lottery results from en.lottolyzer.com</li>
              <li>• Validates all numbers ({details.numbers})</li>
              <li>• Detects and handles duplicate dates automatically</li>
              <li>• Runs on your selected schedule (hourly, daily, etc.)</li>
              <li>• Creates automatic backups before updating</li>
              <li>• No manual intervention required once enabled</li>
            </ul>
          </div>

          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h4 className="font-semibold text-yellow-900 mb-2 flex items-center space-x-2">
              <AlertCircle className="h-4 w-4" />
              <span>⚠️ Server Requirements</span>
            </h4>
            <div className="text-sm text-yellow-800 space-y-2">
              <p className="font-medium">
                The web scraper requires Chrome/Chromium browser on the server.
              </p>
              <p className="text-xs">
                If you see: <span className="font-mono bg-red-100 text-red-700 px-1 rounded">"Browser was not found at the configured executablePath"</span>
              </p>
              <p className="text-xs">
                Solution: Ask your server administrator to install Chrome:
              </p>
              <div className="bg-gray-800 text-gray-100 p-2 rounded text-xs font-mono mt-2">
                <div className="text-gray-400"># Ubuntu/Debian:</div>
                <div className="text-green-400">sudo apt-get install google-chrome-stable</div>
                <div className="text-gray-400 mt-1"># Or Chromium:</div>
                <div className="text-green-400">sudo apt-get install chromium-browser</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Sign Up Form Component - FIXED VERSION
// Sign Up Form Component - FIXED VERSION
const SignUpForm = ({ onClose, onSwitchToLogin }) => {
  const { register } = useAuth();
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showGoogleUsernamePrompt, setShowGoogleUsernamePrompt] = useState(false);
  const [googleToken, setGoogleToken] = useState(null);
  const [googleUsername, setGoogleUsername] = useState('');

  const handleGoogleResponse = React.useCallback(async (response) => {
    // Store the token and show username prompt
    setGoogleToken(response.credential);
    setShowGoogleUsernamePrompt(true);
    setError('');
  }, []);

  const handleGoogleRegistration = async () => {
    if (!googleUsername || googleUsername.length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }

    if (!googleToken) {
      setError('Google token missing. Please try again.');
      setShowGoogleUsernamePrompt(false);
      return;
    }

    setIsLoading(true);
    setError('');
    
    console.log('🔵 Starting Google registration...');
    console.log('📝 Username:', googleUsername);
    console.log('🔑 Token exists:', !!googleToken);
    console.log('🌐 API URL:', `${API_BASE_URL}/auth/google/register`);
    
    try {
      const payload = { 
        token: googleToken,
        username: googleUsername 
      };
      
      console.log('📦 Sending payload:', payload);
      
      const response = await fetch(`${API_BASE_URL}/auth/google/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include'
      });

      console.log('📡 Response status:', response.status);
      
      // Try to parse response
      let data;
      try {
        data = await response.json();
        console.log('📄 Response data:', data);
      } catch (parseError) {
        console.error('❌ Failed to parse response:', parseError);
        throw new Error('Server returned invalid response');
      }

      if (response.ok && data.success) {
        console.log('✅ Registration successful!');
        // Registration successful - close the form
        onClose();
        window.location.reload(); // Refresh to update auth state
      } else {
        console.error('❌ Registration failed:', data.error || data.message);
        setError(data.error || data.message || 'Google sign-up failed');
        setShowGoogleUsernamePrompt(false);
        setGoogleToken(null);
        setGoogleUsername('');
      }
    } catch (err) {
      console.error('❌ Registration error:', err);
      setError('Google sign-up failed: ' + err.message);
      setShowGoogleUsernamePrompt(false);
      setGoogleToken(null);
      setGoogleUsername('');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Load Google Sign-In script for registration
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    script.onload = () => {
      if (window.google && GOOGLE_CLIENT_ID) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleResponse,
        });

        const buttonContainer = document.getElementById('googleSignUpButton');
        if (buttonContainer) {
          const containerWidth = buttonContainer.offsetWidth || 328;
          window.google.accounts.id.renderButton(
            buttonContainer,
            { 
              theme: 'filled_blue',
              size: 'large',
              width: containerWidth,
              text: 'signup_with',
              shape: 'rectangular'
            }
          );
        }
      }
    };

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, [handleGoogleResponse]);

  const validateForm = () => {
    if (!formData.username || formData.username.length < 3) {
      setError('Username must be at least 3 characters');
      return false;
    }
    if (!formData.password || formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return false;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!validateForm()) return;

    setIsLoading(true);
    
    try {
      const result = await register({
        username: formData.username,
        password: formData.password
      });

      if (result.success) {
        onClose();
      } else {
        setError(result.error || 'Registration failed');
      }
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Google Username Prompt Modal
  if (showGoogleUsernamePrompt) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full mb-4">
                <User className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Choose Your Username</h2>
              <p className="text-gray-600">You're signing up with Google</p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-3">
                <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Username (required)
                </label>
                <input
                  type="text"
                  value={googleUsername}
                  onChange={(e) => setGoogleUsername(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleGoogleRegistration()}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="Choose a username"
                  required
                  disabled={isLoading}
                  minLength={3}
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-1">Must be at least 3 characters</p>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setShowGoogleUsernamePrompt(false);
                    setGoogleToken(null);
                    setGoogleUsername('');
                    setError('');
                  }}
                  disabled={isLoading}
                  className="flex-1 py-3 px-4 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-all duration-200 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGoogleRegistration}
                  disabled={isLoading || !googleUsername || googleUsername.length < 3}
                  className="flex-1 py-3 px-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-semibold hover:shadow-lg hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-5 w-5" />
                      <span>Complete Sign Up</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main Sign-Up Form
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full mb-4">
              <Brain className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Create Account</h1>
            <p className="text-gray-600">Sign up to start predicting</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-3">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Google Sign-Up Button */}
          {GOOGLE_CLIENT_ID && (
            <div className="mb-6">
              <div id="googleSignUpButton" className={isLoading ? 'opacity-50 pointer-events-none' : ''} />
              <p className="text-xs text-gray-500 mt-2 text-center">
                You'll choose a username after signing in with Google
              </p>
            </div>
          )}

          {/* Divider */}
          {GOOGLE_CLIENT_ID && (
            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-gray-500">Or sign up with username</span>
              </div>
            </div>
          )}

          {/* Registration Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <User className="inline h-4 w-4 mr-1" />
                Username
              </label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="Choose a username"
                required
                disabled={isLoading}
                minLength={3}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Lock className="inline h-4 w-4 mr-1" />
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all pr-10"
                  placeholder="Create a password"
                  required
                  disabled={isLoading}
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">Must be at least 6 characters</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Lock className="inline h-4 w-4 mr-1" />
                Confirm Password
              </label>
              <input
                type={showPassword ? "text" : "password"}
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="Confirm your password"
                required
                disabled={isLoading}
                minLength={6}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-semibold hover:shadow-lg hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Creating Account...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5" />
                  <span>Create Account</span>
                </>
              )}
            </button>
          </form>

          {/* Sign In Link */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Already have an account?{' '}
              <button
                onClick={onSwitchToLogin}
                className="text-blue-600 hover:text-blue-800 font-medium hover:underline transition-colors"
              >
                Sign In
              </button>
            </p>
          </div>
        </div>

        <div className="mt-4 text-center text-sm text-gray-500">
          <p>By signing up, you agree to our Terms of Service</p>
        </div>
      </div>
    </div>
  );
};
// Google Sign-In Button Component
const GoogleSignInButton = ({ onSuccess, onError, disabled }) => {
  const handleCredentialResponse = React.useCallback(async (response) => {
    try {
      if (response.credential) {
        await onSuccess(response.credential);
      }
    } catch (error) {
      console.error('Google login error:', error);
      onError(error.message || 'Google login failed');
    }
  }, [onSuccess, onError]);

  useEffect(() => {
    // Load Google Sign-In script
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    script.onload = () => {
      if (window.google && GOOGLE_CLIENT_ID) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleCredentialResponse,
        });

        // Get the actual width of the container
        const buttonContainer = document.getElementById('googleSignInButton');
        if (buttonContainer) {
          const containerWidth = buttonContainer.offsetWidth || 328;
          
          window.google.accounts.id.renderButton(
            buttonContainer,
            {
              theme: 'filled_blue',
              size: 'large',
              width: containerWidth,
              text: 'signin_with',
              shape: 'rectangular',
            }
          );
        }
      }
    };

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, [handleCredentialResponse]);

  return (
    <div className="w-full">
      <div 
        id="googleSignInButton" 
        className={`w-full ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
      />
    </div>
  );
};
// Full-Screen Login Component - UPDATED
const GoogleLoginScreen = () => {
  const { login, googleLogin } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSignUp, setShowSignUp] = useState(false);

  const handleTraditionalLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await login({ username, password });
      if (!result.success) {
        setError(result.error || 'Login failed');
      }
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSuccess = async (token) => {
    setError('');
    setIsLoading(true);
    
    try {
      const result = await googleLogin(token);
      if (!result.success) {
        // Check if account needs to be registered
        if (result.error && result.error.includes('not registered')) {
          setError('Google account not registered. Please sign up first.');
        } else {
          setError(result.error || 'Google login failed');
        }
      }
    } catch (err) {
      setError(err.message || 'Google login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleError = (errorMessage) => {
    setError(errorMessage);
    setIsLoading(false);
  };

  if (showSignUp) {
    return (
      <SignUpForm 
        onClose={() => setShowSignUp(false)}
        onSwitchToLogin={() => setShowSignUp(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full mb-4">
              <Brain className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">AI Lottery Predictor</h1>
            <p className="text-gray-600">Sign in to continue</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-3">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Google Sign-In Button */}
          {GOOGLE_CLIENT_ID && (
            <div className="mb-6">
              <GoogleSignInButton 
                onSuccess={handleGoogleSuccess}
                onError={handleGoogleError}
                disabled={isLoading}
              />
            </div>
          )}

          {/* Divider */}
          {GOOGLE_CLIENT_ID && (
            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-gray-500">Or continue with</span>
              </div>
            </div>
          )}

          {/* Traditional Login Form */}
          <form onSubmit={handleTraditionalLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <User className="inline h-4 w-4 mr-1" />
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="Enter username"
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Lock className="inline h-4 w-4 mr-1" />
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="Enter password"
                required
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-semibold hover:shadow-lg hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <Shield className="h-5 w-5" />
                  <span>Sign In</span>
                </>
              )}
            </button>
          </form>

          {/* Sign Up Link */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600 mb-2">
              Don't have an account?{' '}
              <button
                onClick={() => setShowSignUp(true)}
                className="text-blue-600 hover:text-blue-800 font-medium hover:underline transition-colors"
              >
                Sign Up
              </button>
            </p>
            <p className="text-xs text-gray-500 border-t pt-4">Demo: admin / admin123</p>
          </div>
        </div>

        <div className="mt-4 text-center text-sm text-gray-500">
          <p>Powered by AI Algorithms</p>
        </div>
      </div>
    </div>
  );
};

// User Menu 
const UserMenu = () => {
  const { user, isAuthenticated, isAdmin, isGoogleUser, logout } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showAdminTooltip, setShowAdminTooltip] = useState(false);

  if (isAuthenticated) {
    return (
      <>
        <div className="flex items-center space-x-4">
          {isAdmin && !isGoogleUser && (
            <button
              onClick={() => setShowAdmin(true)}
              className="flex items-center space-x-2 px-3 py-1 bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 hover:scale-105 transition-all duration-200"
            >
              <Shield className="h-4 w-4" />
              <span className="text-sm">Admin Panel</span>
            </button>
          )}
          
          {isGoogleUser && (
            <div className="relative">
              <div
                onMouseEnter={() => setShowAdminTooltip(true)}
                onMouseLeave={() => setShowAdminTooltip(false)}
                className="flex items-center space-x-2 px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full cursor-help"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span className="text-sm font-medium">Google User</span>
                <Info className="h-3 w-3" />
              </div>
              
              {showAdminTooltip && (
                <div className="absolute top-full right-0 mt-2 w-64 p-3 bg-gray-800 text-white text-xs rounded-lg shadow-xl z-50">
                  <div className="flex items-start space-x-2">
                    <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-yellow-400" />
                    <div>
                      <p className="font-semibold mb-1">Limited Access</p>
                      <p className="text-gray-300">
                        Google Sign-In users cannot access the Admin Panel. Please use regular login credentials for admin access.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          
          <div className="flex items-center space-x-2 px-3 py-1 bg-blue-100 rounded-full">
            <User className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-800">{user.username || user.email}</span>
          </div>
          
          <button
            onClick={logout}
            className="flex items-center space-x-2 px-3 py-1 bg-red-100 text-red-700 rounded-full hover:bg-red-200 hover:scale-105 transition-all duration-200"
          >
            <LogOut className="h-4 w-4" />
            <span className="text-sm">Logout</span>
          </button>
        </div>
        
        {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
      </>
    );
  }

  return (
    <div>
      <button
        onClick={() => setShowLogin(true)}
        className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 hover:scale-105 transition-all duration-200"
      >
        <Lock className="h-4 w-4" />
        <span className="text-sm">Login</span>
      </button>
      
      {showLogin && <LoginForm onClose={() => setShowLogin(false)} />}
    </div>
  );
};

const LoadingSpinner = ({ size = 'md' }) => {
  const sizeClasses = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-8 w-8' };
  return <Loader2 className={`${sizeClasses[size]} animate-spin text-blue-500`} />;
};

const NumberBall = ({ number, isBonus = false, delay = 0, size = 'md', colorScheme = 'blue' }) => {
  const sizeClasses = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-12 h-12 text-base', xl: 'w-14 h-14 text-lg' };
  
  const colorSchemes = {
    blue: 'bg-gradient-to-br from-blue-500 to-blue-700',
    red: 'bg-gradient-to-br from-red-500 to-red-700',
    green: 'bg-gradient-to-br from-green-500 to-green-700',
    bonus: 'bg-gradient-to-br from-blue-600 to-blue-800 animate-pulse'
  };
  
  const colorClasses = isBonus ? colorSchemes.bonus : colorSchemes[colorScheme];

  return (
    <div 
      className={`${sizeClasses[size]} rounded-full flex items-center justify-center text-white font-bold shadow-lg ${colorClasses}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {number}
    </div>
  );
};

// Mock prediction generator
const generateMockPrediction = (gameType) => {
  const gameInfo = {
    '539': { maxNumbers: 39, numberCount: 8, hasBonus: false },
    'mark6': { maxNumbers: 49, numberCount: 6, hasBonus: true },
    'lotto649': { maxNumbers: 49, numberCount: 6, hasBonus: true }
  };

  const info = gameInfo[gameType];
  const numbers = [];
  
  while (numbers.length < info.numberCount) {
    const num = Math.floor(Math.random() * info.maxNumbers) + 1;
    if (!numbers.includes(num)) numbers.push(num);
  }
  
  numbers.sort((a, b) => a - b);

  const prediction = {
    numbers,
    confidence: 0.4 + Math.random() * 0.4,
    timestamp: new Date().toISOString()
  };

  if (info.hasBonus) {
    let bonus;
    do {
      bonus = Math.floor(Math.random() * info.maxNumbers) + 1;
    } while (numbers.includes(bonus));
    prediction.bonus = bonus;
  }

  return prediction;
};

// Mock automation 
const generateMockAutomation = (gameType, multiplier) => {
  const gameInfo = {
    '539': { maxNumbers: 39, numberCount:  8 },
    'mark6': { maxNumbers: 49, numberCount: 6 },
    'lotto649': { maxNumbers: 49, numberCount: 6 }
  };

  const info = gameInfo[gameType];
  const frequencyMap = {};
  const allResults = [];

  for (let i = 1; i <= info.maxNumbers; i++) {
    frequencyMap[i] = 0;
  }

  for (let i = 0; i < multiplier; i++) {
    const numbers = [];
    while (numbers.length < info.numberCount) {
      const num = Math.floor(Math.random() * info.maxNumbers) + 1;
      if (!numbers.includes(num)) numbers.push(num);
    }
    numbers.sort((a, b) => a - b);
    
    allResults.push({ numbers, iteration: i + 1 });
    numbers.forEach(num => frequencyMap[num]++);
  }

  const sortedByFrequency = Object.entries(frequencyMap)
    .map(([num, freq]) => ({ number: parseInt(num), frequency: freq }))
    .sort((a, b) => b.frequency - a.frequency);

  const topNumbers = sortedByFrequency.slice(0, info.numberCount).map(item => item.number).sort((a, b) => a - b);

  const result = {
    topNumbers,
    iterations: multiplier,
    allResults,
    frequencyData: sortedByFrequency,
    metadata: {
      totalIterations: multiplier,
      successfulIterations: allResults.length,
      averageConfidence: 0.75
    }
  };

  if (gameType === 'mark6' || gameType === 'lotto649') {
    const bonusCandidate = sortedByFrequency.find(item => !topNumbers.includes(item.number));
    if (bonusCandidate) {
      result.bonus = bonusCandidate.number;
    }
  }

  return result;
};

// Main App
function App() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  
  // Show login screen first if not authenticated
  if (!isAuthenticated && !authLoading) {
    return <GoogleLoginScreen />;
  }

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Main app for authenticated users
  const [selectedGame, setSelectedGame] = useState(null);
  const [predictions, setPredictions] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedMultipliers, setSelectedMultipliers] = useState({
    '539': 1,
    'mark6': 1,
    'lotto649': 1
  });
  const [selectedFrequencyDays, setSelectedFrequencyDays] = useState({
    '539': 30,
    'mark6': 30,
    'lotto649': 30
  });
  const [automationResults, setAutomationResults] = useState({});
  const [isAutomationRunning, setIsAutomationRunning] = useState(false);
  const [showAllPastResults, setShowAllPastResults] = useState(null);
  const [showRollingPrediction, setShowRollingPrediction] = useState(null);
  const [showLottoPicker, setShowLottoPicker] = useState(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  const handlePredict = async (gameType, customPrediction = null) => {
    if (customPrediction) {
      setPredictions(prev => ({ ...prev, [gameType]: customPrediction }));
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      let result;
      try {
        const apiResult = await api.predict(gameType, '1month');
        if (apiResult.success) {
          result = apiResult.prediction;
        } else {
          throw new Error('API failed');
        }
      } catch (apiError) {
        result = generateMockPrediction(gameType);
      }
      
      // Validate that prediction numbers are within correct range (1-39 for 539, 1-49 for others)
      const maxNumber = gameType === '539' ? 39 : 49;
      if (result && result.numbers) {
        result.numbers = result.numbers.map(num => {
          const validNum = parseInt(num);
          if (isNaN(validNum) || validNum < 1 || validNum > maxNumber) {
            // If invalid, generate a random valid number
            return Math.floor(Math.random() * maxNumber) + 1;
          }
          return validNum;
        }).sort((a, b) => a - b);
        
        // Also validate bonus number if it exists
        if (result.bonus) {
          const bonusNum = parseInt(result.bonus);
          if (isNaN(bonusNum) || bonusNum < 1 || bonusNum > maxNumber) {
            result.bonus = Math.floor(Math.random() * maxNumber) + 1;
          } else {
            result.bonus = bonusNum;
          }
        }
      }
      
      setPredictions(prev => ({ ...prev, [gameType]: result }));
    } catch (err) {
      setError(`Prediction failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };
 
const handleRunAutomation = async (gameType) => {
  setIsAutomationRunning(true);
  setError(null);

  try {
    const multiplier = selectedMultipliers[gameType] || 1;
    // Change this line:
    const result = await api.automation(gameType, '1month', multiplier);
      
     if (result.success) {
      let finalTopNumbers = [...(result.topNumbers || [])];
      const maxNumber = gameType === '539' ? 39 : 49;
      const desiredCount = 8;

      // Pad the array with unique random numbers if it's shorter than 8
      while (finalTopNumbers.length < desiredCount) {
        const randomNum = Math.floor(Math.random() * maxNumber) + 1;
        if (!finalTopNumbers.includes(randomNum)) {
          finalTopNumbers.push(randomNum);
        }
      }

      // Slice to ensure it's not more than 8 and then sort
      finalTopNumbers = finalTopNumbers.slice(0, desiredCount).sort((a, b) => a - b);
      // --- END OF MODIFICATION ---
      // highlight-end
  setAutomationResults(prev => ({ 
    ...prev, 
    [gameType]: {
      topNumbers: result.topNumbers,
      iterations: result.totalIterations || result.iterations,
      allResults: [],
      frequencyData: result.frequencyData,
      metadata: result.metadata
    }
  }));

      } else {
        const mockResults = generateMockAutomation(gameType, multiplier);
        setAutomationResults(prev => ({ ...prev, [gameType]: mockResults }));
      }
    } catch
    (err) {
      console.error('Automation failed:', err);
      const mockResults = generateMockAutomation(gameType, selectedMultipliers[gameType]);
      setAutomationResults(prev => ({ ...prev, [gameType]: mockResults }));
    } finally {
      setIsAutomationRunning(false);
    }
  };

  const handleMultiplierChange = (gameType, index) => {
    setSelectedMultipliers(prev => ({ ...prev, [gameType]: MULTIPLIER_OPTIONS[index].value }));
  };

  const handleFrequencyChange = (gameType, index) => {
    setSelectedFrequencyDays(prev => ({ ...prev, [gameType]: FREQUENCY_OPTIONS[index].value }));
  };

  const handleClearAutomation = (gameType) => {
    setAutomationResults(prev => ({ ...prev, [gameType]: null }));
  };

  const gameInfo = {
    '539': { title: '539 Lottery', description: 'Pick 8 numbers from 1-39', icon: '🎲', color: 'from-blue-500 to-blue-600' },
    'mark6': { title: 'Mark 6', description: 'Pick 6 numbers + bonus from 1-49', icon: '🎯', color: 'from-blue-500 to-blue-600' },
    'lotto649': { title: 'Lotto 649', description: 'Pick 6 numbers + bonus from 1-49', icon: '💎', color: 'from-blue-500 to-blue-600' }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-blue-100 to-blue-50 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-blue-100 to-blue-50">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-10">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <Brain className="h-10 w-10 text-blue-600" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">
              AI Lottery Predictor
            </h1>
          </div>
          <p className="text-gray-600">Single Roll with Restart Pattern</p>
          
          <div className="flex items-center justify-center space-x-4 mt-4">
            <div className="inline-flex items-center space-x-2 px-4 py-2 bg-green-100 text-green-800 rounded-full">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm">AI Active</span>
            </div>
            <UserMenu />
          </div>
        </header>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <p className="text-red-800">{error}</p>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {Object.entries(gameInfo).map(([gameType, info]) => (
            <div 
              key={gameType}
              className={`p-6 rounded-xl cursor-pointer transition-all duration-300 ${
                selectedGame === gameType 
                  ? 'bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300 shadow-lg' 
                  : 'bg-white hover:bg-gray-50 shadow-md hover:shadow-lg'
              }`}
              onClick={() => setSelectedGame(gameType)}
            >
              <div className="text-center mb-4">
                <div className="text-4xl mb-2">{info.icon}</div>
                <h3 className="text-xl font-bold text-gray-800">{info.title}</h3>
                <p className="text-gray-600 text-sm">{info.description}</p>
              </div>

              {selectedGame === gameType && (
                <div className="space-y-4">
                  <div className="space-y-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePredict(gameType);
                      }}
                      disabled={isLoading}
                      className={`w-full py-3 px-4 bg-gradient-to-r ${info.color} text-white rounded-lg font-semibold hover:shadow-lg hover:scale-105 transition-all duration-200 disabled:opacity-50 flex items-center justify-center space-x-2`}
                    >
                      {isLoading ? (
                        <>
                          <LoadingSpinner size="sm" />
                          <span>Generating...</span>
                        </>
                      ) : (
                        <>
                          <TrendingUp size={20} />
                          <span>Generate Prediction</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowAllPastResults(gameType);
                      }}
                      className="w-full py-2 px-4 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg font-medium hover:shadow-lg hover:scale-105 transition-all duration-200 flex items-center justify-center space-x-2"
                    >
                      <Database className="h-4 w-4" />
                      <span>All Past Results</span>
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowRollingPrediction(gameType);
                      }}
                      className="w-full py-2 px-4 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg font-medium hover:shadow-lg hover:scale-105 transition-all duration-200 flex items-center justify-center space-x-2"
                    >
                      <RotateCw className="h-4 w-4" />
                      <span>Rolling Prediction</span>
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowLottoPicker(gameType);
                      }}
                      className="w-full py-2 px-4 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg font-medium hover:shadow-lg hover:scale-105 transition-all duration-200 flex items-center justify-center space-x-2"
                    >
                      <Zap className="h-4 w-4" />
                      <span>Lotto Picker</span>
                    </button>

                    <CustomSlider
                      value={FREQUENCY_OPTIONS.findIndex(opt => opt.value === selectedFrequencyDays[gameType])}
                      max={FREQUENCY_OPTIONS.length - 1}
                      onChange={(e) => handleFrequencyChange(gameType, parseInt(e.target.value))}
                      disabled={isLoading}
                      label={`Based on: ${FREQUENCY_OPTIONS.find(opt => opt.value === selectedFrequencyDays[gameType])?.label}`}
                      color="blue"
                      icon={TrendingUp}
                    />

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRunAutomation(gameType);
                      }}
                      disabled={isLoading || isAutomationRunning}
                      className="w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-semibold hover:shadow-lg hover:scale-105 transition-all duration-200 disabled:opacity-50 flex items-center justify-center space-x-2"
                    >
                      {isAutomationRunning ? (
                        <>
                          <LoadingSpinner size="sm" />
                          <span>Running...</span>
                        </>
                      ) : (
                        <>
                          <Zap size={18} />
                          <span>Run Automation</span>
                        </>
                      )}
                    </button>

                    <CustomSlider
                      value={MULTIPLIER_OPTIONS.findIndex(opt => opt.value === selectedMultipliers[gameType])}
                      max={MULTIPLIER_OPTIONS.length - 1}
                      onChange={(e) => handleMultiplierChange(gameType, parseInt(e.target.value))}
                      disabled={isLoading || isAutomationRunning}
                      label={`Iterations: ${MULTIPLIER_OPTIONS.find(opt => opt.value === selectedMultipliers[gameType])?.label}`}
                      color="green"
                      icon={Zap}
                    />
                  </div>

                  {automationResults[gameType] && (
                    <AutomationResults
                      results={automationResults[gameType]}
                      onClear={() => handleClearAutomation(gameType)}
                    />
                  )}

                  {predictions[gameType] && (
                    <div className="space-y-4">
                      <div className="text-center">
                        <h4 className="font-semibold text-gray-700 mb-3">Predicted Numbers</h4>
                        
                        <div className="mb-4">
                          <div className="flex flex-wrap justify-center gap-2">
                            {predictions[gameType].numbers?.map((number, index) => (
                              <NumberBall 
                                key={`${gameType}-${number}-${index}`} 
                                number={number} 
                                delay={index * 100}
                                size="lg"
                              />
                            ))}
                          </div>
                        </div>

                        {predictions[gameType].bonus && (
                          <div className="mb-4">
                            <p className="text-sm text-gray-600 mb-2">Bonus</p>
                            <div className="flex justify-center">
                              <NumberBall 
                                number={predictions[gameType].bonus} 
                                isBonus={true}
                                size="xl"
                              />
                            </div>
                          </div>
                        )}

                        <div className="p-3 bg-gray-50 rounded-lg">
                          <div className="text-xs text-gray-600">
                            <div className="flex justify-between">
                              <span>Based on:</span>
                              <span className="font-semibold">
                                {FREQUENCY_OPTIONS.find(opt => opt.value === selectedFrequencyDays[gameType])?.label}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <footer className="text-center py-6 text-gray-600 text-sm">
          <div className="flex items-center justify-center space-x-2 mb-2">
            <Activity className="h-4 w-4" />
            <span>Powered by AI Algorithms</span>
          </div>
        </footer>
      </div>

      {showAllPastResults && (
        <AllPastResultsModal 
          gameType={showAllPastResults} 
          onClose={() => setShowAllPastResults(null)} 
        />
      )}

      {showRollingPrediction && (
        <RollingPredictionFeature 
          gameType={showRollingPrediction} 
          onClose={() => setShowRollingPrediction(null)} 
        />
      )}

      {showLottoPicker && (
        <LottoPickerFeature 
          gameType={showLottoPicker} 
          onClose={() => setShowLottoPicker(null)} 
        />
      )}
    </div>
  );
}

export default function AppWithAuth() {
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}