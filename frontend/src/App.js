import React, { useState, useEffect } from 'react';
import { Brain, Activity, AlertCircle, CheckCircle2, Zap, TrendingUp, Loader2, Database, Shield, Lock, User, LogOut, X, Info, Calendar, RotateCw, Pipette } from 'lucide-react';
import ConnectionTest from './ConnectionTest';  // Keep the debug component

// API Configuration
const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://lottery-backend-tdqv.onrender.com/api';
console.log('✅ API_BASE_URL:', API_BASE_URL);

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
  
  logout: () =>
    fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include'
    }).then(res => res.json()).catch(err => ({ success: false })),
  
  verifyAuth: () =>
    fetch(`${API_BASE_URL}/auth/verify`, {
      credentials: 'include'
    }).then(res => res.json()).catch(() => ({ authenticated: false })),
  
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
    credentials: 'include', // ✅ required for session cookies
    body: JSON.stringify(result)
  })
  .then(async res => {
    if (res.status === 401) {
      throw new Error('Unauthorized - please log in again');
    }
    if (res.status === 403) {
      throw new Error('Admin access required');
    }

    // Try to parse JSON safely, fallback if not valid JSON
    try {
      return await res.json();
    } catch {
      const text = await res.text();
      throw new Error(`Invalid JSON response: ${text.slice(0, 100)}`);
    }
  }),

  deleteHistoricalResult: (gameType, resultId) =>
    fetch(`${API_BASE_URL}/admin/historical-results/${gameType}/${resultId}`, {
      method: 'DELETE',
      credentials: 'include'
    }).then(res => {
      if (res.status === 403) throw new Error('Admin access required');
      return res.json();
    }),

  syncBackendExcel: (gameType) =>
    fetch(`${API_BASE_URL}/admin/historical-results/${gameType}/sync`, {
      method: 'POST',
      credentials: 'include'
    }).then(res => {
      if (res.status === 403) throw new Error('Admin access required');
      return res.json();
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

const RollingNumber = ({ number, delay }) => {
  const [displayNumber, setDisplayNumber] = useState(1);
  const [isRolling, setIsRolling] = useState(true);

  useEffect(() => {
    let interval;
    const startRolling = setTimeout(() => {
      interval = setInterval(() => {
        setDisplayNumber(prev => prev >= 39 ? 1 : prev + 1);
      }, 50);
    }, delay);

    const stopRolling = setTimeout(() => {
      clearInterval(interval);
      setIsRolling(false);
      setDisplayNumber(number);
    }, delay + 1000 + (Math.random() * 500));

    return () => {
      clearTimeout(startRolling);
      clearTimeout(stopRolling);
      clearInterval(interval);
    };
  }, [number, delay]);

  return (
    <div className={`rolling-number ${!isRolling ? 'stopped' : ''}`}>
      {displayNumber}
    </div>
  );
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

// Rolling Prediction Feature Component
const RollingPredictionFeature = ({ gameType, onClose }) => {
  const [predictions, setPredictions] = useState([]);
  const [isRolling, setIsRolling] = useState(false);
  const [rollCount, setRollCount] = useState(50);

  const generateRollingPredictions = () => {
    setIsRolling(true);
    const maxNumber = gameType === '539' ? 39 : 49;
    const count = gameType === '539' ? 5 : 6;
    
    // Simulate rolling effect
    setTimeout(() => {
      const numbers = [];
      while (numbers.length < count) {
        const num = Math.floor(Math.random() * maxNumber) + 1;
        if (!numbers.includes(num)) {
          numbers.push(num);
        }
      }
      setPredictions(numbers.sort((a, b) => a - b));
      setIsRolling(false);
    }, 2000);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl">
        <div className="bg-gradient-to-r from-purple-500 to-purple-600 text-white p-4 rounded-t-xl">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <RotateCw className="h-6 w-6" />
              <h2 className="text-xl font-bold">Rolling Prediction - {gameType.toUpperCase()}</h2>
            </div>
            <button onClick={onClose} className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-lg">
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="text-center mb-6">
            <h3 className="text-lg font-semibold mb-2">Generate Rolling Predictions</h3>
            <p className="text-gray-600 text-sm">Click to roll the numbers!</p>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Roll Count: {rollCount}
            </label>
            <input
              type="range"
              min={10}
              max={100}
              value={rollCount}
              onChange={(e) => setRollCount(parseInt(e.target.value))}
              className="w-full"
            />
          </div>

          <button
            onClick={generateRollingPredictions}
            disabled={isRolling}
            className="w-full py-3 px-4 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all duration-200 disabled:opacity-50 flex items-center justify-center space-x-2"
          >
            {isRolling ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Rolling...</span>
              </>
            ) : (
              <>
                <RotateCw className="h-5 w-5" />
                <span>Roll Predictions</span>
              </>
            )}
          </button>

          {predictions.length > 0 && !isRolling && (
            <div className="mt-6">
              <h4 className="text-center font-semibold text-gray-700 mb-4">Your Numbers</h4>
              <div className="flex flex-wrap justify-center gap-3">
                {predictions.map((num, index) => (
                  <RollingNumber key={index} number={num} delay={index * 100} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// All Past Results Modal Component
const AllPastResultsModal = ({ gameType, onClose }) => {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadPastResults();
  }, [gameType]);

  const loadPastResults = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await api.getAllPastResults(gameType);
      if (data.success) {
        setResults(data.results || []);
      } else {
        throw new Error(data.error || 'Failed to load results');
      }
    } catch (err) {
      console.error('Error loading past results:', err);
      setError(err.message);
      // Use mock data as fallback
      setResults(generateMockPastResults(gameType, 50));
    } finally {
      setLoading(false);
    }
  };

  const generateMockPastResults = (game, count) => {
    const results = [];
    const today = new Date();
    const maxNumber = game === '539' ? 39 : 49;
    const numberCount = game === '539' ? 5 : 6;
    
    for (let i = 0; i < count; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i * 3); // Every 3 days
      
      const numbers = [];
      while (numbers.length < numberCount) {
        const num = Math.floor(Math.random() * maxNumber) + 1;
        if (!numbers.includes(num)) {
          numbers.push(num);
        }
      }
      
      results.push({
        id: i + 1,
        drawDate: date.toISOString().split('T')[0],
        numbers: numbers.sort((a, b) => a - b),
        bonus: game !== '539' ? Math.floor(Math.random() * maxNumber) + 1 : null
      });
    }
    
    return results;
  };

  const filteredResults = results.filter(result => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return result.drawDate.includes(searchTerm) ||
           result.numbers.some(num => num.toString().includes(searchTerm));
  });

  const resultsPerPage = 20;
  const totalPages = Math.ceil(filteredResults.length / resultsPerPage);
  const paginatedResults = filteredResults.slice(
    (page - 1) * resultsPerPage,
    page * resultsPerPage
  );

  const analyzeFrequency = () => {
    const frequency = {};
    const maxNumber = gameType === '539' ? 39 : 49;
    
    for (let i = 1; i <= maxNumber; i++) {
      frequency[i] = 0;
    }
    
    results.forEach(result => {
      result.numbers.forEach(num => {
        frequency[num]++;
      });
    });
    
    const sorted = Object.entries(frequency).sort((a, b) => b[1] - a[1]);
    return {
      hot: sorted.slice(0, 5),
      cold: sorted.slice(-5).reverse()
    };
  };

  const stats = !loading && results.length > 0 ? analyzeFrequency() : null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-500 to-green-600 text-white p-4 rounded-t-xl">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <Database className="h-6 w-6" />
              <h2 className="text-xl font-bold">All Past Results - {gameType.toUpperCase()}</h2>
            </div>
            <button onClick={onClose} className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-lg">
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
                <p>Loading past results...</p>
              </div>
            </div>
          ) : error ? (
            <div className="text-center text-red-600 p-4">
              <AlertCircle className="h-8 w-8 mx-auto mb-2" />
              <p>{error}</p>
            </div>
          ) : (
            <>
              {/* Search Bar */}
              <div className="mb-6">
                <input
                  type="text"
                  placeholder="Search by date or number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              {/* Frequency Analysis */}
              {stats && (
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-red-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-red-800 mb-2">Hot Numbers 🔥</h4>
                    <div className="flex flex-wrap gap-2">
                      {stats.hot.map(([num, freq]) => (
                        <div key={num} className="bg-red-500 text-white px-3 py-1 rounded-full text-sm">
                          {num} ({freq}x)
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-blue-800 mb-2">Cold Numbers ❄️</h4>
                    <div className="flex flex-wrap gap-2">
                      {stats.cold.map(([num, freq]) => (
                        <div key={num} className="bg-blue-500 text-white px-3 py-1 rounded-full text-sm">
                          {num} ({freq}x)
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Results Table */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-100 border-b">
                      <th className="text-left p-3">Date</th>
                      <th className="text-left p-3">Numbers</th>
                      {gameType !== '539' && <th className="text-left p-3">Bonus</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedResults.map((result, index) => (
                      <tr key={result.id || index} className="border-b hover:bg-gray-50">
                        <td className="p-3 font-medium">{result.drawDate}</td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-2">
                            {result.numbers.map((num, idx) => (
                              <span key={idx} className="bg-gradient-to-r from-green-500 to-green-600 text-white px-2 py-1 rounded-full text-sm">
                                {num}
                              </span>
                            ))}
                          </div>
                        </td>
                        {gameType !== '539' && (
                          <td className="p-3">
                            {result.bonus && (
                              <span className="bg-gradient-to-r from-purple-500 to-purple-600 text-white px-2 py-1 rounded-full text-sm">
                                {result.bonus}
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-center mt-6 space-x-2">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="px-3 py-1 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// Number Ball Component
const NumberBall = ({ number, isBonus = false, delay = 0, size = 'md' }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  const sizeClasses = {
    sm: 'w-10 h-10 text-sm',
    md: 'w-12 h-12 text-base',
    lg: 'w-14 h-14 text-lg',
    xl: 'w-16 h-16 text-xl'
  };

  return (
    <div 
      className={`
        ${sizeClasses[size]}
        rounded-full flex items-center justify-center font-bold
        transform transition-all duration-500 shadow-lg
        ${isVisible ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}
        ${isBonus 
          ? 'bg-gradient-to-br from-purple-500 to-purple-700 text-white ring-2 ring-purple-300' 
          : 'bg-gradient-to-br from-blue-500 to-blue-700 text-white'
        }
      `}
    >
      {number}
    </div>
  );
};

// Loading Spinner Component
const LoadingSpinner = ({ size = 'md' }) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12'
  };

  return (
    <div className={`${sizeClasses[size]} animate-spin`}>
      <svg className="w-full h-full" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
    </div>
  );
};

// Automation Results Component
const AutomationResults = ({ results, onClear }) => {
  const frequencyAnalysis = () => {
    const freq = {};
    results.forEach(result => {
      result.numbers.forEach(num => {
        freq[num] = (freq[num] || 0) + 1;
      });
    });
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10);
  };

  const topNumbers = frequencyAnalysis();

  return (
    <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg">
      <div className="flex justify-between items-center mb-3">
        <h4 className="font-semibold text-blue-900">Automation Results ({results.length} iterations)</h4>
        <button 
          onClick={onClear}
          className="text-red-600 hover:text-red-800 text-sm"
        >
          Clear
        </button>
      </div>
      
      <div className="mb-3">
        <p className="text-sm font-medium text-blue-800 mb-2">Top 10 Most Frequent Numbers:</p>
        <div className="flex flex-wrap gap-2">
          {topNumbers.map(([num, freq], index) => (
            <div 
              key={num}
              className={`px-3 py-1 rounded-full text-xs font-semibold ${
                index < 3 ? 'bg-gradient-to-r from-yellow-400 to-yellow-500 text-white' :
                index < 6 ? 'bg-gradient-to-r from-gray-400 to-gray-500 text-white' :
                'bg-gradient-to-r from-orange-400 to-orange-500 text-white'
              }`}
            >
              #{num} ({freq}x)
            </div>
          ))}
        </div>
      </div>
      
      <div className="max-h-40 overflow-y-auto">
        <p className="text-sm font-medium text-blue-800 mb-2">Recent Predictions:</p>
        {results.slice(-3).reverse().map((result, index) => (
          <div key={index} className="mb-2 p-2 bg-white bg-opacity-70 rounded">
            <span className="text-xs text-gray-600">Iteration {result.iteration}:</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {result.numbers.map((num, idx) => (
                <span key={idx} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                  {num}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Custom Slider Component
const CustomSlider = ({ value, max, onChange, disabled, label, color = 'blue', icon: Icon }) => {
  const colors = {
    blue: 'from-blue-400 to-blue-600',
    green: 'from-green-400 to-green-600',
    purple: 'from-purple-400 to-purple-600'
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700 flex items-center space-x-2">
          {Icon && <Icon size={16} />}
          <span>{label}</span>
        </label>
      </div>
      <div className="relative">
        <input
          type="range"
          min={0}
          max={max}
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={`w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider ${disabled ? 'opacity-50' : ''}`}
          style={{
            background: `linear-gradient(to right, #3B82F6 0%, #3B82F6 ${(value / max) * 100}%, #E5E7EB ${(value / max) * 100}%, #E5E7EB 100%)`
          }}
        />
        <div className={`absolute -top-1 h-4 w-4 bg-gradient-to-r ${colors[color]} rounded-full shadow-lg transform -translate-x-1/2 pointer-events-none`}
             style={{ left: `${(value / max) * 100}%` }}>
        </div>
      </div>
    </div>
  );
};

// Auth Context
const AuthContext = React.createContext(null);

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    verifyAuth();
  }, []);

  const verifyAuth = async () => {
    try {
      const result = await api.verifyAuth();
      if (result.authenticated) {
        setUser(result.user);
      }
    } catch (error) {
      console.error('Auth verification failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (credentials) => {
    const result = await api.login(credentials);
    if (result.success) {
      setUser(result.user);
    }
    return result;
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, verifyAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

// Main App Component
function App() {
  const { user, login, logout, loading: authLoading } = useAuth();
  const [predictions, setPredictions] = useState({});
  const [selectedGame, setSelectedGame] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFrequencyDays, setSelectedFrequencyDays] = useState({
    '539': 30,
    'lotto649': 30,
    'mark6': 30
  });
  const [automationResults, setAutomationResults] = useState({});
  const [selectedMultipliers, setSelectedMultipliers] = useState({
    '539': 10,
    'lotto649': 10,
    'mark6': 10
  });
  const [isAutomationRunning, setIsAutomationRunning] = useState(false);
  const [showAllPastResults, setShowAllPastResults] = useState(null);
  const [showRollingPrediction, setShowRollingPrediction] = useState(null);
  const [showLottoPicker, setShowLottoPicker] = useState(null);
  const [connectionTest, setConnectionTest] = useState(null);

  useEffect(() => {
    // Test API connection on mount
    const testConnection = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/health`);
        if (response.ok) {
          console.log('✅ API Connection Successful');
        } else {
          console.error('❌ API Connection Failed:', response.status);
        }
      } catch (error) {
        console.error('❌ API Connection Failed:', error);
      }
    };
    
    testConnection();
  }, []);

  const generateMockPrediction = (gameType) => {
    const maxNumber = gameType === '539' ? 39 : 49;
    const numberCount = gameType === '539' ? 5 : 6;
    const numbers = [];
    
    while (numbers.length < numberCount) {
      const num = Math.floor(Math.random() * maxNumber) + 1;
      if (!numbers.includes(num)) {
        numbers.push(num);
      }
    }
    
    const bonus = gameType !== '539' ? Math.floor(Math.random() * maxNumber) + 1 : null;
    
    return {
      numbers: numbers.sort((a, b) => a - b),
      bonus,
      generatedAt: new Date().toISOString()
    };
  };

  const generateMockAutomation = (gameType, iterations) => {
    const results = [];
    for (let i = 0; i < iterations; i++) {
      results.push({
        iteration: i + 1,
        ...generateMockPrediction(gameType)
      });
    }
    return results;
  };

  const handlePredict = async (gameType) => {
    setIsLoading(true);
    try {
      const frequencyMap = {
        7: '1week',
        14: '2weeks', 
        30: '1month',
        90: '3months',
        180: '6months',
        365: '1year'
      };
      
      const period = frequencyMap[selectedFrequencyDays[gameType]] || '1month';
      const response = await api.predict(gameType, period);
      
      if (response.success && response.prediction) {
        // Validate that prediction numbers are within correct range
        const maxNumber = gameType === '539' ? 39 : 49;
        const validatedPrediction = {
          ...response.prediction,
          numbers: response.prediction.numbers?.map(num => {
            // Ensure numbers are within valid range
            const validNum = parseInt(num);
            if (isNaN(validNum) || validNum < 1 || validNum > maxNumber) {
              // If invalid, generate a random valid number
              return Math.floor(Math.random() * maxNumber) + 1;
            }
            return validNum;
          }).sort((a, b) => a - b)
        };
        
        setPredictions(prev => ({ 
          ...prev, 
          [gameType]: validatedPrediction 
        }));
      } else {
        // Use mock data if API fails
        const mockPrediction = generateMockPrediction(gameType);
        setPredictions(prev => ({ ...prev, [gameType]: mockPrediction }));
      }
    } catch (err) {
      console.error('Prediction failed:', err);
      // Use mock data on error
      const mockPrediction = generateMockPrediction(gameType);
      setPredictions(prev => ({ ...prev, [gameType]: mockPrediction }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunAutomation = async (gameType) => {
    setIsAutomationRunning(true);
    try {
      const frequencyMap = {
        7: '1week',
        14: '2weeks',
        30: '1month',
        90: '3months',
        180: '6months',
        365: '1year'
      };
      
      const period = frequencyMap[selectedFrequencyDays[gameType]] || '1month';
      const multiplier = selectedMultipliers[gameType];
      
      const response = await api.automation(gameType, period, multiplier);
      
      if (response.success && response.results) {
        // Validate automation results
        const maxNumber = gameType === '539' ? 39 : 49;
        const validatedResults = response.results.map(result => ({
          ...result,
          numbers: result.numbers?.map(num => {
            const validNum = parseInt(num);
            if (isNaN(validNum) || validNum < 1 || validNum > maxNumber) {
              return Math.floor(Math.random() * maxNumber) + 1;
            }
            return validNum;
          }).sort((a, b) => a - b)
        }));
        
        setAutomationResults(prev => ({
          ...prev,
          [gameType]: validatedResults
        }));
      } else {
        // Use mock data if API fails
        const mockResults = generateMockAutomation(gameType, multiplier);
        setAutomationResults(prev => ({
          ...prev,
          [gameType]: mockResults
        }));
      }
    } catch (err) {
      console.error('Automation failed:', err);
      // Use mock data on error
      const mockResults = generateMockAutomation(gameType, selectedMultipliers[gameType]);
      setAutomationResults(prev => ({
        ...prev,
        [gameType]: mockResults
      }));
    } finally {
      setIsAutomationRunning(false);
    }
  };

  const handleFrequencyChange = (gameType, index) => {
    setSelectedFrequencyDays(prev => ({
      ...prev,
      [gameType]: FREQUENCY_OPTIONS[index].value
    }));
  };

  const handleMultiplierChange = (gameType, index) => {
    setSelectedMultipliers(prev => ({
      ...prev,
      [gameType]: MULTIPLIER_OPTIONS[index].value
    }));
  };

  const handleClearAutomation = (gameType) => {
    setAutomationResults(prev => ({
      ...prev,
      [gameType]: null
    }));
  };

  const gameTypes = {
    '539': { title: '539 Lottery', description: 'Pick 5 numbers from 1-39', icon: '🎲', color: 'from-blue-500 to-blue-600' },
    'lotto649': { title: 'Lotto 649', description: 'Pick 6 from 1-49 + Bonus', icon: '🎰', color: 'from-green-500 to-green-600' },
    'mark6': { title: 'Mark Six', description: 'Pick 6 from 1-49 + Special', icon: '🎯', color: 'from-purple-500 to-purple-600' }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Header */}
      <header className="bg-white shadow-md sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Brain className="h-8 w-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-800">AI Lottery Predictor</h1>
                <p className="text-sm text-gray-600">Powered by Advanced AI Algorithms</p>
              </div>
            </div>
            {user && (
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <User className="h-5 w-5 text-gray-600" />
                  <span className="text-sm font-medium text-gray-700">{user.username}</span>
                  {user.role === USER_ROLES.ADMIN && (
                    <span className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded-full">Admin</span>
                  )}
                </div>
                <button
                  onClick={logout}
                  className="flex items-center space-x-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        {/* Info Banner */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl p-6 mb-8 shadow-xl">
          <div className="flex items-center space-x-3 mb-3">
            <Info className="h-6 w-6" />
            <h2 className="text-xl font-bold">How It Works</h2>
          </div>
          <p className="text-blue-100">
            Our AI analyzes historical lottery data using advanced machine learning algorithms to identify patterns and trends. 
            Select your preferred lottery game, adjust the frequency analysis period, and let our AI generate intelligent predictions!
          </p>
        </div>

        {/* Game Selection Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {Object.entries(gameTypes).map(([gameType, info]) => (
            <div
              key={gameType}
              className={`bg-white rounded-xl p-6 cursor-pointer transform transition-all duration-300 hover:scale-105 ${
                selectedGame === gameType 
                  ? `ring-4 ring-${info.color.split('-')[1]}-400 shadow-xl` 
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