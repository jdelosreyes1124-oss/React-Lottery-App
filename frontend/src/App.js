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

// Lotto Picker Feature Component 
const LottoPickerFeature = ({ gameType, onClose }) => {
  const [predictions, setPredictions] = useState([]);
  const [selectedNumbers, setSelectedNumbers] = useState(new Set());
  const [frequencyData, setFrequencyData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [numberCount, setNumberCount] = useState(10);
  const [predictionCriteria, setPredictionCriteria] = useState('balanced');

  const maxNumber = gameType === '539' ? 39 : 49;
  const requiredNumbers = gameType === '539' ? 5 : 6;

  useEffect(() => {
    loadFrequencyData();
  }, [gameType]);

  const loadFrequencyData = async () => {
    setLoading(true);
    try {
      const data = await api.getAllPastResults(gameType);
      if (data.success) {
        const frequency = calculateFrequency(data.results);
        setFrequencyData(frequency);
      }
    } catch (error) {
      console.error('Error loading frequency:', error);
      // Use mock data if API fails
      const mockFrequency = generateMockFrequency(maxNumber);
      setFrequencyData(mockFrequency);
    } finally {
      setLoading(false);
    }
  };

  const calculateFrequency = (results) => {
    const freq = {};
    for (let i = 1; i <= maxNumber; i++) {
      freq[i] = { count: 0, lastSeen: null, gaps: [] };
    }

    results.forEach((draw, index) => {
      draw.numbers.forEach(num => {
        freq[num].count++;
        if (freq[num].lastSeen !== null) {
          freq[num].gaps.push(index - freq[num].lastSeen);
        }
        freq[num].lastSeen = index;
      });
    });

    // Calculate average gap
    Object.keys(freq).forEach(num => {
      const gaps = freq[num].gaps;
      freq[num].avgGap = gaps.length > 0 
        ? gaps.reduce((a, b) => a + b, 0) / gaps.length 
        : maxNumber;
    });

    return freq;
  };

  const generateMockFrequency = (max) => {
    const freq = {};
    for (let i = 1; i <= max; i++) {
      freq[i] = {
        count: Math.floor(Math.random() * 50) + 10,
        lastSeen: Math.floor(Math.random() * 20),
        avgGap: Math.random() * 10 + 3
      };
    }
    return freq;
  };

  const generatePredictions = () => {
    if (!frequencyData) return;
    setLoading(true);

    const newPredictions = [];
    
    for (let i = 0; i < numberCount; i++) {
      let selected;
      
      switch (predictionCriteria) {
        case 'hot':
          selected = selectHotNumbers();
          break;
        case 'cold':
          selected = selectColdNumbers();
          break;
        case 'overdue':
          selected = selectOverdueNumbers();
          break;
        case 'balanced':
        default:
          selected = selectBalancedNumbers();
          break;
      }
      
      newPredictions.push({
        id: Date.now() + i,
        numbers: selected.sort((a, b) => a - b),
        criteria: predictionCriteria
      });
    }
    
    setPredictions(newPredictions);
    setLoading(false);
  };

  const selectHotNumbers = () => {
    const sorted = Object.entries(frequencyData)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, requiredNumbers * 2)
      .map(([num]) => parseInt(num));
    
    return selectRandom(sorted, requiredNumbers);
  };

  const selectColdNumbers = () => {
    const sorted = Object.entries(frequencyData)
      .sort((a, b) => a[1].count - b[1].count)
      .slice(0, requiredNumbers * 2)
      .map(([num]) => parseInt(num));
    
    return selectRandom(sorted, requiredNumbers);
  };

  const selectOverdueNumbers = () => {
    const sorted = Object.entries(frequencyData)
      .sort((a, b) => b[1].lastSeen - a[1].lastSeen)
      .slice(0, requiredNumbers * 2)
      .map(([num]) => parseInt(num));
    
    return selectRandom(sorted, requiredNumbers);
  };

  const selectBalancedNumbers = () => {
    const hot = Object.entries(frequencyData)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, Math.floor(requiredNumbers / 2))
      .map(([num]) => parseInt(num));
    
    const cold = Object.entries(frequencyData)
      .sort((a, b) => a[1].count - b[1].count)
      .slice(0, Math.floor(requiredNumbers / 2))
      .map(([num]) => parseInt(num));
    
    const overdue = Object.entries(frequencyData)
      .sort((a, b) => b[1].lastSeen - a[1].lastSeen)
      .slice(0, requiredNumbers - hot.length - cold.length)
      .map(([num]) => parseInt(num));
    
    const combined = [...new Set([...hot, ...cold, ...overdue])];
    
    while (combined.length < requiredNumbers) {
      const random = Math.floor(Math.random() * maxNumber) + 1;
      if (!combined.includes(random)) {
        combined.push(random);
      }
    }
    
    return combined.slice(0, requiredNumbers);
  };

  const selectRandom = (pool, count) => {
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  };

  const toggleNumber = (num) => {
    const newSelected = new Set(selectedNumbers);
    if (newSelected.has(num)) {
      newSelected.delete(num);
    } else if (newSelected.size < requiredNumbers) {
      newSelected.add(num);
    }
    setSelectedNumbers(newSelected);
  };

  const clearSelection = () => {
    setSelectedNumbers(new Set());
  };

  const quickPick = () => {
    const numbers = [];
    while (numbers.length < requiredNumbers) {
      const num = Math.floor(Math.random() * maxNumber) + 1;
      if (!numbers.includes(num)) {
        numbers.push(num);
      }
    }
    setSelectedNumbers(new Set(numbers));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-500 to-green-600 text-white p-4 rounded-t-xl">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <Pipette className="h-6 w-6" />
              <h2 className="text-xl font-bold">Lotto Number Picker - {gameType.toUpperCase()}</h2>
            </div>
            <button onClick={onClose} className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-lg">
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Manual Selection */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3">Manual Selection ({selectedNumbers.size}/{requiredNumbers})</h3>
            
            {/* Number Grid */}
            <div className="grid grid-cols-10 gap-2 mb-4">
              {Array.from({length: maxNumber}, (_, i) => i + 1).map(num => (
                <button
                  key={num}
                  onClick={() => toggleNumber(num)}
                  className={`
                    p-2 rounded-lg font-semibold transition-all
                    ${selectedNumbers.has(num) 
                      ? 'bg-green-500 text-white scale-110 shadow-lg' 
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}
                  `}
                  disabled={!selectedNumbers.has(num) && selectedNumbers.size >= requiredNumbers}
                >
                  {num}
                </button>
              ))}
            </div>

            {/* Quick Actions */}
            <div className="flex space-x-2">
              <button
                onClick={clearSelection}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
              >
                Clear
              </button>
              <button
                onClick={quickPick}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                Quick Pick
              </button>
            </div>

            {/* Selected Numbers Display */}
            {selectedNumbers.size > 0 && (
              <div className="mt-4 p-4 bg-green-50 rounded-lg">
                <p className="font-semibold text-green-800">Your Numbers:</p>
                <div className="flex space-x-2 mt-2">
                  {Array.from(selectedNumbers).sort((a, b) => a - b).map(num => (
                    <span key={num} className="px-3 py-1 bg-green-500 text-white rounded-full font-bold">
                      {num}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* AI Predictions */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold mb-3">AI-Generated Predictions</h3>
            
            {/* Controls */}
            <div className="flex flex-wrap gap-4 mb-4">
              <div>
                <label className="text-sm text-gray-600">Prediction Strategy</label>
                <select 
                  value={predictionCriteria}
                  onChange={(e) => setPredictionCriteria(e.target.value)}
                  className="ml-2 px-3 py-1 border rounded-lg"
                >
                  <option value="balanced">Balanced Mix</option>
                  <option value="hot">Hot Numbers</option>
                  <option value="cold">Cold Numbers</option>
                  <option value="overdue">Overdue Numbers</option>
                </select>
              </div>

              <div>
                <label className="text-sm text-gray-600">Number of Sets</label>
                <input 
                  type="number"
                  min="1"
                  max="20"
                  value={numberCount}
                  onChange={(e) => setNumberCount(parseInt(e.target.value))}
                  className="ml-2 px-3 py-1 border rounded-lg w-20"
                />
              </div>

              <button
                onClick={generatePredictions}
                disabled={loading}
                className="px-6 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:shadow-lg disabled:opacity-50"
              >
                {loading ? 'Generating...' : 'Generate Predictions'}
              </button>
            </div>

            {/* Predictions Display */}
            {predictions.length > 0 && (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {predictions.map((pred, index) => (
                  <div key={pred.id} className="p-3 bg-gray-50 rounded-lg flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <span className="text-gray-600 font-semibold">#{index + 1}</span>
                      <div className="flex space-x-2">
                        {pred.numbers.map(num => (
                          <span key={num} className="px-2 py-1 bg-blue-500 text-white rounded-full text-sm font-bold">
                            {num}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className="text-xs text-gray-500 capitalize">{pred.criteria}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Frequency Stats */}
          {frequencyData && (
            <div className="border-t pt-6 mt-6">
              <h3 className="text-lg font-semibold mb-3">Number Statistics</h3>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="font-semibold text-red-600">🔥 Hot Numbers</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {Object.entries(frequencyData)
                      .sort((a, b) => b[1].count - a[1].count)
                      .slice(0, 5)
                      .map(([num]) => (
                        <span key={num} className="px-2 py-1 bg-red-100 text-red-600 rounded">
                          {num}
                        </span>
                      ))}
                  </div>
                </div>
                <div>
                  <p className="font-semibold text-blue-600">❄️ Cold Numbers</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {Object.entries(frequencyData)
                      .sort((a, b) => a[1].count - b[1].count)
                      .slice(0, 5)
                      .map(([num]) => (
                        <span key={num} className="px-2 py-1 bg-blue-100 text-blue-600 rounded">
                          {num}
                        </span>
                      ))}
                  </div>
                </div>
                <div>
                  <p className="font-semibold text-purple-600">⏰ Overdue</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {Object.entries(frequencyData)
                      .sort((a, b) => b[1].lastSeen - a[1].lastSeen)
                      .slice(0, 5)
                      .map(([num]) => (
                        <span key={num} className="px-2 py-1 bg-purple-100 text-purple-600 rounded">
                          {num}
                        </span>
                      ))}
                  </div>
                </div>
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
  const [iterations, setIterations] = useState(10);
  const [period, setPeriod] = useState('1month');
  const [results, setResults] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentIteration, setCurrentIteration] = useState(0);
  const [mostFrequent, setMostFrequent] = useState([]);

  const runRollingPrediction = async () => {
    setIsRunning(true);
    setResults([]);
    setCurrentIteration(0);
    
    const allNumbers = {};
    const newResults = [];

    for (let i = 0; i < iterations; i++) {
      setCurrentIteration(i + 1);
      
      try {
        const response = await api.predict(gameType, period);
        
        if (response.success) {
          const numbers = response.prediction.numbers;
          newResults.push({
            iteration: i + 1,
            numbers,
            bonus: response.prediction.bonus
          });
          
          // Track frequency
          numbers.forEach(num => {
            allNumbers[num] = (allNumbers[num] || 0) + 1;
          });
        }
      } catch (error) {
        console.error(`Iteration ${i + 1} failed:`, error);
      }
      
      // Small delay to show progress
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Calculate most frequent numbers
    const sorted = Object.entries(allNumbers)
      .sort((a, b) => b[1] - a[1])
      .slice(0, gameType === '539' ? 8 : 6);
    
    setMostFrequent(sorted);
    setResults(newResults);
    setIsRunning(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
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

        {/* Content */}
        <div className="p-6">
          {/* Controls */}
          <div className="flex flex-wrap gap-4 mb-6">
            <div>
              <label className="text-sm text-gray-600">Iterations</label>
              <input 
                type="number"
                min="5"
                max="100"
                value={iterations}
                onChange={(e) => setIterations(parseInt(e.target.value))}
                disabled={isRunning}
                className="ml-2 px-3 py-1 border rounded-lg w-20"
              />
            </div>

            <div>
              <label className="text-sm text-gray-600">Analysis Period</label>
              <select 
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                disabled={isRunning}
                className="ml-2 px-3 py-1 border rounded-lg"
              >
                <option value="1week">1 Week</option>
                <option value="1month">1 Month</option>
                <option value="3months">3 Months</option>
                <option value="6months">6 Months</option>
              </select>
            </div>

            <button
              onClick={runRollingPrediction}
              disabled={isRunning}
              className="px-6 py-2 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg hover:shadow-lg disabled:opacity-50"
            >
              {isRunning ? `Running ${currentIteration}/${iterations}...` : 'Start Rolling Prediction'}
            </button>
          </div>

          {/* Progress Bar */}
          {isRunning && (
            <div className="mb-6">
              <div className="bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(currentIteration / iterations) * 100}%` }}
                />
              </div>
              <p className="text-sm text-gray-600 mt-1">Processing iteration {currentIteration} of {iterations}</p>
            </div>
          )}

          {/* Most Frequent Numbers */}
          {mostFrequent.length > 0 && (
            <div className="mb-6 p-4 bg-purple-50 rounded-lg">
              <h3 className="font-semibold text-purple-800 mb-3">Most Frequently Predicted Numbers</h3>
              <div className="flex flex-wrap gap-3">
                {mostFrequent.map(([num, count]) => (
                  <div key={num} className="text-center">
                    <div className="px-4 py-2 bg-purple-500 text-white rounded-full font-bold text-lg">
                      {num}
                    </div>
                    <p className="text-xs text-purple-600 mt-1">{count} times</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Results Grid */}
          {results.length > 0 && (
            <div>
              <h3 className="font-semibold mb-3">All Predictions ({results.length})</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
                {results.map(result => (
                  <div key={result.iteration} className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-600 mb-2">Iteration #{result.iteration}</p>
                    <div className="flex flex-wrap gap-1">
                      {result.numbers.map(num => (
                        <span 
                          key={num} 
                          className={`px-2 py-1 rounded-full text-xs font-bold ${
                            mostFrequent.some(([n]) => n === num.toString())
                              ? 'bg-purple-500 text-white'
                              : 'bg-gray-200 text-gray-700'
                          }`}
                        >
                          {num}
                        </span>
                      ))}
                    </div>
                    {result.bonus && (
                      <div className="mt-2">
                        <span className="text-xs text-gray-600">Bonus: </span>
                        <span className="px-2 py-1 bg-yellow-400 text-white rounded-full text-xs font-bold">
                          {result.bonus}
                        </span>
                      </div>
                    )}
                  </div>
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
    loadResults();
  }, [gameType]);

  const loadResults = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.getAllPastResults(gameType);
      
      if (response.success) {
        // Sort by date, most recent first
        const sorted = response.results.sort((a, b) => 
          new Date(b.drawDate) - new Date(a.drawDate)
        );
        setResults(sorted);
      } else {
        throw new Error(response.error || 'Failed to load results');
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
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
              <p className="text-gray-600">Using sample data. {error}</p>
            </div>
          ) : (
            <>
              {/* Stats Summary */}
              {stats && (
                <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="font-semibold text-red-600 mb-2">🔥 Hot Numbers</p>
                      <div className="flex space-x-2">
                        {stats.hot.map(([num, count]) => (
                          <div key={num} className="text-center">
                            <div className="px-3 py-1 bg-red-500 text-white rounded-full font-bold">
                              {num}
                            </div>
                            <p className="text-xs text-gray-600 mt-1">{count}x</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="font-semibold text-blue-600 mb-2">❄️ Cold Numbers</p>
                      <div className="flex space-x-2">
                        {stats.cold.map(([num, count]) => (
                          <div key={num} className="text-center">
                            <div className="px-3 py-1 bg-blue-500 text-white rounded-full font-bold">
                              {num}
                            </div>
                            <p className="text-xs text-gray-600 mt-1">{count}x</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Search */}
              <div className="mb-4">
                <input
                  type="text"
                  placeholder="Search by date or number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg"
                />
              </div>

              {/* Results Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="px-4 py-2 text-left">Date</th>
                      <th className="px-4 py-2 text-left">Numbers</th>
                      {gameType !== '539' && <th className="px-4 py-2 text-left">Bonus</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedResults.map((result, index) => (
                      <tr key={result.id || index} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-3">
                          {new Date(result.drawDate).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex space-x-2">
                            {result.numbers.map(num => (
                              <span 
                                key={num}
                                className="px-2 py-1 bg-green-500 text-white rounded-full text-sm font-bold"
                              >
                                {num}
                              </span>
                            ))}
                          </div>
                        </td>
                        {gameType !== '539' && (
                          <td className="px-4 py-3">
                            {result.bonus && (
                              <span className="px-2 py-1 bg-yellow-400 text-white rounded-full text-sm font-bold">
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
                <div className="mt-6 flex justify-center space-x-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
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

// Admin Panel Component
const AdminPanel = ({ user, onClose }) => {
  const [activeTab, setActiveTab] = useState('539');
  const [historicalResults, setHistoricalResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [schedulerStatus, setSchedulerStatus] = useState({});

  useEffect(() => {
    loadHistoricalResults(activeTab);
    loadSchedulerStatus(activeTab);
  }, [activeTab]);

  const loadHistoricalResults = async (gameType) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getHistoricalResults(gameType);
      setHistoricalResults(data.data || []);
    } catch (err) {
      setError(err.message);
      console.error('Failed to load results:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadSchedulerStatus = async (gameType) => {
    try {
      const status = await api.getSchedulerStatus(gameType);
      setSchedulerStatus(status);
    } catch (err) {
      console.error('Failed to load scheduler status:', err);
    }
  };

  const handleSyncExcel = async () => {
    setLoading(true);
    try {
      const result = await api.syncBackendExcel(activeTab);
      setSuccess(result.message || 'Sync completed');
      loadHistoricalResults(activeTab);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAutoUpdate = async () => {
    setLoading(true);
    try {
      const result = await api.triggerManualScrape(activeTab);
      setSuccess(result.message || 'Update completed');
      loadHistoricalResults(activeTab);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddResult = async (result) => {
    try {
      await api.addHistoricalResult(activeTab, result);
      setSuccess('Result added successfully');
      setShowAddModal(false);
      loadHistoricalResults(activeTab);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteResult = async (id) => {
    if (!window.confirm('Delete this result?')) return;
    try {
      await api.deleteHistoricalResult(activeTab, id);
      setSuccess('Result deleted');
      loadHistoricalResults(activeTab);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-75 z-50 overflow-y-auto">
      <div className="min-h-screen px-4 py-8">
        <div className="max-w-7xl mx-auto bg-white rounded-xl shadow-2xl">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 rounded-t-xl">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <Shield className="h-8 w-8" />
                <h1 className="text-2xl font-bold">Admin Panel - Historical Data</h1>
              </div>
              <button onClick={onClose} className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-lg">
                <X size={24} />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b">
            {['539', 'mark6', 'lotto649'].map(game => (
              <button
                key={game}
                onClick={() => setActiveTab(game)}
                className={`px-6 py-3 font-semibold uppercase transition-colors ${
                  activeTab === game
                    ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {game}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Action Buttons */}
            <div className="mb-6 flex flex-wrap gap-3">
              <button
                onClick={() => setShowAddModal(true)}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center space-x-2"
              >
                <span>Add New Result</span>
              </button>
              
              <button
                onClick={handleSyncExcel}
                disabled={loading}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center space-x-2"
              >
                <span>Sync Excel</span>
              </button>

              <button
                onClick={handleAutoUpdate}
                disabled={loading}
                className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 flex items-center space-x-2"
              >
                <span>Auto Update Results</span>
              </button>
            </div>

            {/* Messages */}
            {error && (
              <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg">
                {error}
              </div>
            )}
            {success && (
              <div className="mb-4 p-4 bg-green-50 text-green-700 rounded-lg">
                {success}
              </div>
            )}

            {/* Historical Results */}
            <div className="bg-white border rounded-lg">
              <h2 className="text-lg font-semibold p-4 border-b">Historical Results</h2>
              
              {loading ? (
                <div className="p-8 text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                </div>
              ) : historicalResults.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Database className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No historical results</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="px-4 py-2 text-left">Date</th>
                        <th className="px-4 py-2 text-left">Numbers</th>
                        {activeTab !== '539' && <th className="px-4 py-2 text-left">Bonus</th>}
                        <th className="px-4 py-2 text-left">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historicalResults.map((result) => (
                        <tr key={result._id} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-3">
                            {new Date(result.drawDate).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex space-x-1">
                              {result.numbers.map((num, idx) => (
                                <span key={idx} className="px-2 py-1 bg-blue-500 text-white rounded-full text-sm">
                                  {num}
                                </span>
                              ))}
                            </div>
                          </td>
                          {activeTab !== '539' && (
                            <td className="px-4 py-3">
                              {result.bonus && (
                                <span className="px-2 py-1 bg-yellow-500 text-white rounded-full text-sm">
                                  {result.bonus}
                                </span>
                              )}
                            </td>
                          )}
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleDeleteResult(result._id)}
                              className="text-red-600 hover:text-red-800"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add Result Modal */}
      {showAddModal && (
        <AddResultModal
          gameType={activeTab}
          onAdd={handleAddResult}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
};

// Add Result Modal Component
const AddResultModal = ({ gameType, onAdd, onClose }) => {
  const [date, setDate] = useState('');
  const [numbers, setNumbers] = useState('');
  const [bonus, setBonus] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    
    const numbersArray = numbers.split(',').map(n => parseInt(n.trim()));
    
    onAdd({
      drawDate: date,
      numbers: numbersArray,
      bonus: bonus ? parseInt(bonus) : null
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h3 className="text-lg font-semibold mb-4">Add New Result - {gameType.toUpperCase()}</h3>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Draw Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              Numbers (comma separated)
            </label>
            <input
              type="text"
              value={numbers}
              onChange={(e) => setNumbers(e.target.value)}
              placeholder="1, 2, 3, 4, 5"
              required
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          
          {gameType !== '539' && (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Bonus Number</label>
              <input
                type="number"
                value={bonus}
                onChange={(e) => setBonus(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
          )}
          
          <div className="flex space-x-3">
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              Add Result
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Auth Provider Context (Simple version for admin only)
const AuthContext = React.createContext(null);

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await api.verifyAuth();
      if (response.authenticated) {
        setUser(response.user);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (credentials) => {
    const response = await api.login(credentials);
    if (response.success) {
      setUser(response.user);
    }
    return response;
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
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

// Login Modal for Admin Access
const LoginModal = ({ onLogin, onClose }) => {
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await onLogin(credentials);
      if (!response.success) {
        setError(response.error || 'Login failed');
      } else {
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
            <Lock className="h-8 w-8 text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800">Admin Login</h2>
          <p className="text-gray-600 mt-2">Enter admin credentials to access panel</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Username
            </label>
            <input
              type="text"
              value={credentials.username}
              onChange={(e) => setCredentials(prev => ({ ...prev, username: e.target.value }))}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              type="password"
              value={credentials.password}
              onChange={(e) => setCredentials(prev => ({ ...prev, password: e.target.value }))}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="flex space-x-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 px-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all duration-200 disabled:opacity-50"
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
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
    <div className={`animate-spin rounded-full border-b-2 border-blue-500 ${sizeClasses[size]}`}></div>
  );
};

// Number Ball Component for visual display
const NumberBall = ({ number, isBonus = false, delay = 0, size = 'md' }) => {
  const sizeClasses = {
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10 text-base',
    lg: 'w-12 h-12 text-lg',
    xl: 'w-14 h-14 text-xl'
  };

  return (
    <div
      className={`
        ${sizeClasses[size]} 
        ${isBonus ? 'bg-yellow-400' : 'bg-gradient-to-br from-blue-500 to-blue-600'}
        text-white font-bold rounded-full flex items-center justify-center shadow-lg
        animate-bounce
      `}
      style={{ animationDelay: `${delay}ms` }}
    >
      {number}
    </div>
  );
};

// Custom Slider Component
const CustomSlider = ({ value, max, onChange, disabled, label, color, icon: Icon }) => {
  const percentage = (value / max) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {Icon && <Icon className="h-4 w-4 text-gray-600" />}
          <span className="text-sm font-medium text-gray-700">{label}</span>
        </div>
      </div>
      <div className="relative">
        <input
          type="range"
          min="0"
          max={max}
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={`
            w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
          style={{
            background: `linear-gradient(to right, 
              ${color === 'blue' ? '#3B82F6' : '#10B981'} 0%, 
              ${color === 'blue' ? '#3B82F6' : '#10B981'} ${percentage}%, 
              #E5E7EB ${percentage}%, 
              #E5E7EB 100%)`
          }}
        />
      </div>
    </div>
  );
};

// Automation Results Component
const AutomationResults = ({ results, onClear }) => {
  if (!results || results.length === 0) return null;

  // Calculate statistics
  const allNumbers = {};
  results.forEach(result => {
    result.numbers.forEach(num => {
      allNumbers[num] = (allNumbers[num] || 0) + 1;
    });
  });

  const sortedNumbers = Object.entries(allNumbers)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return (
    <div className="mt-4 p-4 bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg">
      <div className="flex justify-between items-center mb-3">
        <h4 className="font-semibold text-gray-700">Automation Results</h4>
        <button
          onClick={onClear}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Clear
        </button>
      </div>
      
      <div className="space-y-3">
        <div>
          <p className="text-xs text-gray-600 mb-2">Top Predicted Numbers:</p>
          <div className="flex flex-wrap gap-2">
            {sortedNumbers.map(([num, count]) => (
              <div key={num} className="text-center">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-full flex items-center justify-center font-bold">
                  {num}
                </div>
                <p className="text-xs text-gray-600 mt-1">{count}x</p>
              </div>
            ))}
          </div>
        </div>
        
        <div className="pt-3 border-t border-gray-200">
          <p className="text-xs text-gray-600">
            Generated {results.length} predictions
          </p>
        </div>
      </div>
    </div>
  );
};

// Main App Component - NO LOGIN REQUIRED FOR PREDICTIONS
function App() {
  const { user, login, logout, loading: authLoading } = useAuth();
  const [predictions, setPredictions] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [selectedGame, setSelectedGame] = useState(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showAllPastResults, setShowAllPastResults] = useState(null);
  const [showRollingPrediction, setShowRollingPrediction] = useState(null);
  const [showLottoPicker, setShowLottoPicker] = useState(null);
  const [automationResults, setAutomationResults] = useState({});
  const [isAutomationRunning, setIsAutomationRunning] = useState(false);
  const [selectedMultipliers, setSelectedMultipliers] = useState({ 
    '539': 10, 
    'mark6': 10, 
    'lotto649': 10 
  });
  const [selectedFrequencyDays, setSelectedFrequencyDays] = useState({ 
    '539': 30, 
    'mark6': 30, 
    'lotto649': 30 
  });

  // Quick API Connection Test
  useEffect(() => {
    // Test API connection on mount
    const testConnection = async () => {
      console.log('🔍 Testing API Connection...');
      try {
        const health = await fetch(`${API_BASE_URL}/health`);
        const healthData = await health.json();
        console.log('✅ API Connected:', healthData);
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
      
      if (response.success) {
        setPredictions(prev => ({ 
          ...prev, 
          [gameType]: response.prediction 
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
    const multiplier = selectedMultipliers[gameType];
    const frequencyDays = selectedFrequencyDays[gameType];
    
    try {
      const frequencyMap = {
        7: '1week',
        14: '2weeks',
        30: '1month',
        90: '3months',
        180: '6months',
        365: '1year'
      };
      
      const period = frequencyMap[frequencyDays] || '1month';
      const response = await api.automation(gameType, period, multiplier);
      
      if (response.success && response.predictions) {
        setAutomationResults(prev => ({ 
          ...prev, 
          [gameType]: response.predictions.map((result, index) => ({
    iteration: index + 1,
    numbers: result.prediction?.numbers || result.numbers,
    bonus: result.prediction?.bonus || result.bonus,
    confidence: result.confidence,
    frequencyData: result.frequencyData,
    metadata: result.metadata
  }))
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

  const handleAdminClick = () => {
    if (user && user.role === USER_ROLES.ADMIN) {
      setShowAdminPanel(true);
    } else {
      setShowLoginModal(true);
    }
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
            <h1 className="text-4xl font-bold text-gray-800">AI Lottery Predictor</h1>
          </div>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Advanced AI-powered lottery prediction system using machine learning algorithms
          </p>
          
          {/* Admin Access Button */}
          <div className="mt-6 flex items-center justify-center space-x-4">
            {user && user.role === USER_ROLES.ADMIN ? (
              <>
                <div className="flex items-center space-x-2 px-4 py-2 bg-white rounded-lg shadow">
                  <User className="h-5 w-5 text-gray-600" />
                  <span className="font-medium">{user.username}</span>
                  <span className="text-sm text-gray-500">(Admin)</span>
                </div>
                
                <button
                  onClick={() => setShowAdminPanel(true)}
                  className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 flex items-center space-x-2"
                >
                  <Shield className="h-5 w-5" />
                  <span>Admin Panel</span>
                </button>
                
                <button
                  onClick={logout}
                  className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 flex items-center space-x-2"
                >
                  <LogOut className="h-5 w-5" />
                  <span>Logout</span>
                </button>
              </>
            ) : (
              <button
                onClick={handleAdminClick}
                className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 flex items-center space-x-2"
              >
                <Shield className="h-5 w-5" />
                <span>Admin Access</span>
              </button>
            )}
          </div>
        </header>

        {/* Main Prediction Cards - Available to Everyone */}
        <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {Object.entries(gameInfo).map(([gameType, info]) => (
            <div
              key={gameType}
              className={`
                bg-white rounded-xl shadow-lg p-6 transform transition-all duration-200
                hover:scale-105 hover:shadow-xl cursor-pointer border-2
                ${selectedGame === gameType 
                  ? 'border-blue-500 ring-2 ring-blue-300' 
                  : 'border-transparent hover:border-blue-300'}
              `}
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

      {/* Modals */}
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

      {showLoginModal && (
        <LoginModal 
          onLogin={login}
          onClose={() => setShowLoginModal(false)}
        />
      )}

      {showAdminPanel && user && user.role === USER_ROLES.ADMIN && (
        <AdminPanel 
          user={user}
          onClose={() => setShowAdminPanel(false)}
        />
      )}
      
      {/* Connection Test Component */}
      <ConnectionTest />
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