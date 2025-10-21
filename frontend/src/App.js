import React, { useState, useEffect } from 'react';
import { Brain, Activity, AlertCircle, CheckCircle2, Zap, TrendingUp, Loader2, Database, Shield, Lock, User, LogOut, X, Info, Calendar, RotateCw, Pipette } from 'lucide-react';

// API Configuration
const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

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
    fetch(`${API_BASE}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password }),
  credentials: 'include'
    }).then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }),
  
  logout: () =>
    fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include'
    }).then(res => res.json()).catch(err => ({ success: false })),
  
  verifyAuth: () =>
    fetch(`${API_BASE}/auth/verify`, {
      credentials: 'include'
    }).then(res => res.json()).catch(() => ({ authenticated: false })),
  
  predict: (gameType, period = '1month') => 
    fetch(`${API_BASE}/predictions/${gameType}`, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ period, extended: true })
    }).then(res => res.json()),

  automation: (gameType, period, multiplier) =>
    fetch(`${API_BASE}/predictions/${gameType}/automation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ period, iterations: multiplier })
    }).then(res => res.json()),
  
  getHistoricalResults: (gameType) =>
    fetch(`${API_BASE}/admin/historical-results/${gameType}`, {
      credentials: 'include'
    }).then(res => {
      if (res.status === 403) throw new Error('Admin access required');
      return res.json();
    }),

  addHistoricalResult: (gameType, result) =>
    fetch(`${API_BASE}/admin/historical-results/${gameType}/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(result)
    }).then(res => {
      if (res.status === 403) throw new Error('Admin access required');
      return res.json();
    }),

  deleteHistoricalResult: (gameType, resultId) =>
    fetch(`${API_BASE}/admin/historical-results/${gameType}/${resultId}`, {
      method: 'DELETE',
      credentials: 'include'
    }).then(res => {
      if (res.status === 403) throw new Error('Admin access required');
      return res.json();
    }),

  syncBackendExcel: (gameType) =>
    fetch(`${API_BASE}/admin/historical-results/${gameType}/sync`, {
      method: 'POST',
      credentials: 'include'
    }).then(res => {
      if (res.status === 403) throw new Error('Admin access required');
      return res.json();
    }),

  scraperPreview: (gameType, maxResults = 30) =>
    fetch(`${API_BASE}/admin/scraper/preview/${gameType}?maxResults=${maxResults}`, {
      credentials: 'include'
    }).then(res => {
      if (res.status === 403) throw new Error('Admin access required');
      return res.json();
    }),

  scraperImport: (gameType, maxResults = 50, mergeStrategy = 'skip') =>
    fetch(`${API_BASE}/admin/scraper/import/${gameType}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ maxResults, mergeStrategy })
    }).then(res => {
      if (res.status === 403) throw new Error('Admin access required');
      return res.json();
    }),

  scraperStatus: (gameType) =>
    fetch(`${API_BASE}/admin/scraper/status/${gameType}`, {
      credentials: 'include'
    }).then(res => res.json()),

  getSchedulerStatus: (gameType) =>
    fetch(`${API_BASE}/admin/scheduler/status/${gameType}`, {
      credentials: 'include'
    }).then(res => res.json()),

  getAllSchedulerStatus: () =>
    fetch(`${API_BASE}/admin/scheduler/status`, {
      credentials: 'include'
    }).then(res => res.json()),

  startScheduler: (gameType, schedule) =>
    fetch(`${API_BASE}/admin/scheduler/start/${gameType}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ schedule })
    }).then(res => res.json()),

  stopScheduler: (gameType) =>
    fetch(`${API_BASE}/admin/scheduler/stop/${gameType}`, {
      method: 'POST',
      credentials: 'include'
    }).then(res => res.json()),

  triggerManualScrape: (gameType) =>
    fetch(`${API_BASE}/admin/scheduler/trigger/${gameType}`, {
      method: 'POST',
      credentials: 'include'
    }).then(res => res.json()),

  getAllPastResults: (gameType) =>
    fetch(`${API_BASE}/predictions/all-past-results/${gameType}`, {
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

  const logout = async () => {
    await api.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isAdmin: user?.role === USER_ROLES.ADMIN,
      login,
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
  const { login } = useAuth();

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
            <span>Login</span>
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 hover:scale-110 transition-all duration-200 text-xl">×</button>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input
              type="text"
              value={credentials.username}
              onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
              onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
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
            className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 hover:scale-105 transition-all duration-200 disabled:opacity-50"
          >
            {isLoading ? 'Logging in...' : 'Login'}
          </button>
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
        showNotification(response.error || 'Manual update failed', 'error');
      }
    } catch (error) {
      showNotification(error.message, 'error');
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
        <div className={`mb-3 p-2 rounded text-sm ${
          notification.type === 'success' ? 'bg-green-100 text-green-800' :
          notification.type === 'error' ? 'bg-red-100 text-red-800' :
          'bg-blue-100 text-blue-800'
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

// Admin Panel Component 
const AdminPanel = ({ onClose }) => {
  const [historicalResults, setHistoricalResults] = useState({});
  const [selectedGameType, setSelectedGameType] = useState('539');
  const [isLoading, setIsLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showScraper, setShowScraper] = useState(false);
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
      const response = await fetch(`/api/admin/historical-results/${gameType}?page=${page}&limit=50`, {
        credentials: 'include'
      });
      
      if (response.status === 403) throw new Error('Admin access required');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      
      if (data.success) {
        setHistoricalResults(prev => ({
          ...prev,
          [gameType]: {
            results: append 
              ? [...(prev[gameType]?.results || []), ...(data.results || [])]
              : data.results || []
          }
        }));
        
        if (data.pagination) {
          setPagination(data.pagination);
        }
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

  const handleAddResult = async () => {
    const numbers = [];
    const numberCount = selectedGameType === '539' ? 5 : 6;
    
    for (let i = 1; i <= numberCount; i++) {
      const num = parseInt(newResult[`number${i}`]);
      if (isNaN(num) || num < 1) {
        showNotification(`Please enter valid number ${i}`, 'error');
        return;
      }
      numbers.push(num);
    }

    const result = {
      numbers,
      drawDate: newResult.drawDate || new Date().toISOString().split('T')[0]
    };

    if (newResult.bonus && (selectedGameType === 'mark6' || selectedGameType === 'lotto649')) {
      const bonusNum = parseInt(newResult.bonus);
      if (!isNaN(bonusNum)) {
        result.bonus = bonusNum;
      }
    }

    setIsLoading(true);
    try {
      await api.addHistoricalResult(selectedGameType, result);
      setNewResult({ 
        number1: '', number2: '', number3: '', number4: '', number5: '', number6: '',
        bonus: '', drawDate: '' 
      });
      setShowAddForm(false);
      loadHistoricalResults(selectedGameType, 1);
      showNotification('Result added successfully', 'success');
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
      
      if (response.success) {
        showNotification(
          `Sync completed! ${response.imported} imported, ${response.skipped} skipped`,
          'success'
        );
        
        await loadHistoricalResults(selectedGameType, 1);
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
        </div>
      </div>
    </div>
  );
};

// User Menu 
const UserMenu = () => {
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  if (isAuthenticated) {
    return (
      <>
        <div className="flex items-center space-x-4">
          {isAdmin && (
            <button
              onClick={() => setShowAdmin(true)}
              className="flex items-center space-x-2 px-3 py-1 bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 hover:scale-105 transition-all duration-200"
            >
              <Shield className="h-4 w-4" />
              <span className="text-sm">Data</span>
            </button>
          )}
          
          <div className="flex items-center space-x-2 px-3 py-1 bg-blue-100 rounded-full">
            <User className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-800">{user.username}</span>
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
    '539': { maxNumbers: 39, numberCount: 8 },
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
  const { isLoading: authLoading } = useAuth();
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