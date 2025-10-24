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

// Helper Components
function NumberBall({ number, isBonus = false, delay = 0, size = 'md' }) {
  const [isAnimating, setIsAnimating] = useState(false);
  
  useEffect(() => {
    setTimeout(() => setIsAnimating(true), delay);
  }, [delay]);

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
        ${isBonus ? 'bg-red-500' : 'bg-blue-500'}
        text-white rounded-full flex items-center justify-center font-bold
        transform transition-all duration-500 hover:scale-110
        ${isAnimating ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}
      `}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {number}
    </div>
  );
}

function LoadingSpinner({ size = "md" }) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-8 w-8",
    lg: "h-12 w-12"
  };

  return (
    <Loader2 className={`${sizeClasses[size]} animate-spin`} />
  );
}

function CustomSlider({ value, max, onChange, disabled, label, color = 'blue', icon: Icon }) {
  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    purple: 'bg-purple-500'
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center space-x-2">
          {Icon && <Icon size={16} />}
          <span className="text-gray-600">{label}</span>
        </div>
      </div>
      <input
        type="range"
        min="0"
        max={max}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${colorClasses[color]} bg-opacity-20 disabled:opacity-50`}
        style={{
          background: `linear-gradient(to right, ${colorClasses[color]} 0%, ${colorClasses[color]} ${(value / max) * 100}%, #e5e7eb ${(value / max) * 100}%, #e5e7eb 100%)`
        }}
      />
    </div>
  );
}

function AutomationResults({ results, onClear }) {
  const [expandedSet, setExpandedSet] = useState(null);

  return (
    <div className="mt-4 p-4 bg-gray-50 rounded-lg">
      <div className="flex justify-between items-center mb-3">
        <h4 className="font-semibold text-gray-700">Automation Results</h4>
        <button
          onClick={onClear}
          className="text-red-500 hover:text-red-700 text-sm"
        >
          Clear
        </button>
      </div>
      
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {results.sets.map((set, idx) => (
          <div key={idx} className="bg-white p-3 rounded-lg shadow-sm">
            <div
              className="flex justify-between items-center cursor-pointer"
              onClick={() => setExpandedSet(expandedSet === idx ? null : idx)}
            >
              <div className="flex items-center space-x-3">
                <span className="text-sm text-gray-600">Set {idx + 1}</span>
                <div className="flex gap-1">
                  {set.numbers.slice(0, 3).map((num, i) => (
                    <span key={i} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                      {num}
                    </span>
                  ))}
                  {set.numbers.length > 3 && (
                    <span className="text-xs text-gray-500">+{set.numbers.length - 3}</span>
                  )}
                </div>
              </div>
              <span className={`text-xs px-2 py-1 rounded ${
                set.confidence > 70 ? 'bg-green-100 text-green-700' :
                set.confidence > 40 ? 'bg-yellow-100 text-yellow-700' :
                'bg-red-100 text-red-700'
              }`}>
                {set.confidence}% conf
              </span>
            </div>
            
            {expandedSet === idx && (
              <div className="mt-3 pt-3 border-t">
                <div className="flex flex-wrap gap-2">
                  {set.numbers.map((num, i) => (
                    <NumberBall key={i} number={num} size="sm" />
                  ))}
                </div>
                <div className="mt-2 text-xs text-gray-600">
                  <div>Pattern: {set.pattern}</div>
                  <div>Frequency Score: {set.frequencyScore}</div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      
      <div className="mt-3 pt-3 border-t text-sm text-gray-600">
        <div className="flex justify-between">
          <span>Total Sets: {results.sets.length}</span>
          <span>Avg Confidence: {results.averageConfidence}%</span>
        </div>
      </div>
    </div>
  );
}

// Auth Context
const AuthContext = React.createContext(null);

function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    verifyAuth();
  }, []);

  const verifyAuth = async () => {
    try {
      const response = await api.verifyAuth();
      if (response.authenticated) {
        setUser(response.user);
      }
    } catch (error) {
      console.error('Auth verification failed:', error);
    } finally {
      setIsLoading(false);
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
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

// Login Component
function LoginForm() {
  const { login } = useAuth();
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await login(credentials);
      if (!response.success) {
        setError(response.error || 'Login failed');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="p-4 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full">
              <Lock className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Lottery AI Login
          </h1>
          <p className="text-gray-600 mt-2">Sign in to access predictions</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Username
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={credentials.username}
                onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter username"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="password"
                value={credentials.password}
                onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter password"
                required
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-semibold hover:shadow-lg hover:scale-105 transition-all duration-200 disabled:opacity-50"
          >
            {isLoading ? (
              <div className="flex items-center justify-center space-x-2">
                <LoadingSpinner size="sm" />
                <span>Signing in...</span>
              </div>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-600">
          <Shield className="inline h-4 w-4 mr-1" />
          Secure authentication enabled
        </div>
      </div>
    </div>
  );
}

// UPDATED Historical Data Modal Component
function HistoricalDataModal({ gameType, onClose }) {
  const { user } = useAuth();
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newResult, setNewResult] = useState({
    drawDate: new Date().toISOString().split('T')[0],
    numbers: Array(gameType === '649' ? 6 : 5).fill('')
  });
  const [isAdding, setIsAdding] = useState(false);
  const [resultCount, setResultCount] = useState({ current: 0, total: 0 });

  const loadResults = async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log('📊 Loading historical results...');
      const response = await api.getHistoricalResults(gameType);
      console.log('📊 Loaded results:', response);
      
      if (response.success && response.results) {
        setResults(response.results);
        setResultCount({
          current: response.results.length,
          total: response.total || response.results.length
        });
      } else {
        setError('Failed to load results');
      }
    } catch (err) {
      console.error('❌ Error loading results:', err);
      setError(err.message || 'Failed to load results');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (gameType) {
      loadResults();
    }
  }, [gameType]);

  const handleAddResult = async () => {
    // Validate input
    const numbersArray = newResult.numbers.map(n => parseInt(n));
    
    if (numbersArray.some(n => isNaN(n) || n < 1 || n > (gameType === '649' ? 49 : 39))) {
      setError(`All numbers must be between 1 and ${gameType === '649' ? 49 : 39}`);
      return;
    }
    
    if (new Set(numbersArray).size !== numbersArray.length) {
      setError('Numbers must be unique');
      return;
    }

    setIsAdding(true);
    setError(null);

    try {
      console.log('📝 Adding new result:', { drawDate: newResult.drawDate, numbers: numbersArray });
      
      const response = await api.addHistoricalResult(gameType, {
        drawDate: newResult.drawDate,
        numbers: numbersArray
      });

      console.log('📝 Add result response:', response);

      if (response.success) {
        // SUCCESS PATH - Update UI with new data
        if (response.results) {
          // If backend returns updated results list, use it directly
          setResults(response.results);
          setResultCount({
            current: response.results.length,
            total: response.total || response.results.length
          });
        } else if (response.result) {
          // If backend only returns the new result, add it to the list
          setResults(prevResults => [response.result, ...prevResults]);
          setResultCount(prev => ({
            current: prev.current + 1,
            total: prev.total + 1
          }));
        } else {
          // Fallback: reload all results from backend
          await loadResults();
        }

        // Clear form and close modal
        setNewResult({
          drawDate: new Date().toISOString().split('T')[0],
          numbers: Array(gameType === '649' ? 6 : 5).fill('')
        });
        setShowAddForm(false);
        
        // Show success message (optional)
        console.log('✅ Result added successfully!');
      } else {
        setError(response.error || 'Failed to add result');
      }
    } catch (err) {
      console.error('❌ Error adding result:', err);
      setError(err.message || 'Failed to add result');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteResult = async (resultId) => {
    if (!window.confirm('Are you sure you want to delete this result?')) {
      return;
    }

    setError(null);
    try {
      console.log('🗑️ Deleting result:', resultId);
      const response = await api.deleteHistoricalResult(gameType, resultId);
      
      if (response.success) {
        if (response.results) {
          // Use updated results from backend
          setResults(response.results);
          setResultCount({
            current: response.results.length,
            total: response.total || response.results.length
          });
        } else {
          // Remove from local state
          setResults(prevResults => prevResults.filter(r => r.id !== resultId));
          setResultCount(prev => ({
            current: prev.current - 1,
            total: prev.total - 1
          }));
        }
        console.log('✅ Result deleted successfully');
      } else {
        setError(response.error || 'Failed to delete result');
      }
    } catch (err) {
      console.error('❌ Error deleting result:', err);
      setError(err.message || 'Failed to delete result');
    }
  };

  const handleSyncExcel = async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log('🔄 Syncing with Excel...');
      const response = await api.syncBackendExcel(gameType);
      
      if (response.success) {
        if (response.results) {
          setResults(response.results);
          setResultCount({
            current: response.results.length,
            total: response.total || response.results.length
          });
        } else {
          // Reload results after sync
          await loadResults();
        }
        console.log('✅ ' + response.message);
      } else {
        setError(response.error || 'Failed to sync');
      }
    } catch (err) {
      console.error('❌ Error syncing:', err);
      setError(err.message || 'Failed to sync with Excel');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAutoUpdateResults = async () => {
    const confirmed = window.confirm('This will fetch the latest results from the official website. Continue?');
    if (!confirmed) return;

    setIsLoading(true);
    setError(null);
    try {
      console.log('🔄 Auto-updating results...');
      const response = await api.scraperImport(gameType, 50, 'skip');
      
      if (response.success) {
        console.log('✅ ' + response.message);
        // Reload results after import
        await loadResults();
      } else {
        setError(response.error || 'Failed to auto-update');
      }
    } catch (err) {
      console.error('❌ Error auto-updating:', err);
      setError(err.message || 'Failed to auto-update results');
    } finally {
      setIsLoading(false);
    }
  };

  const gameInfo = {
    '539': { title: '539', icon: '🎯', color: 'from-purple-500 to-purple-600' },
    'MARK6': { title: 'Mark Six', icon: '🎰', color: 'from-green-500 to-green-600' },
    'LOTTO649': { title: 'Lotto 6/49', icon: '💎', color: 'from-blue-500 to-blue-600' }
  }[gameType];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden animate-slideIn">
        <div className={`bg-gradient-to-r ${gameInfo.color} text-white p-6 flex justify-between items-center`}>
          <div className="flex items-center space-x-3">
            <span className="text-3xl">{gameInfo.icon}</span>
            <h2 className="text-2xl font-bold">Admin Panel - Historical Data</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-lg transition-all"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Control buttons */}
          <div className="flex flex-wrap gap-2 justify-between">
            <div className="flex gap-2">
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all"
              >
                Add New Result
              </button>
              <button
                onClick={handleSyncExcel}
                disabled={isLoading}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all disabled:opacity-50"
              >
                {isLoading ? 'Syncing...' : '🔄 Sync Excel'}
              </button>
              <button
                onClick={handleAutoUpdateResults}
                disabled={isLoading}
                className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-all disabled:opacity-50"
              >
                {isLoading ? 'Updating...' : '🌐 Auto Update Results'}
              </button>
            </div>
            <div className="text-sm text-gray-600">
              Showing {resultCount.current} of {resultCount.total}
            </div>
          </div>

          {/* Error display */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Add new result form */}
          {showAddForm && (
            <div className="bg-gray-50 p-4 rounded-lg space-y-3">
              <h3 className="font-semibold text-gray-700">Add New Result</h3>
              <div className="text-sm text-gray-600">
                Numbers (1-{gameType === '649' ? 49 : 39})
              </div>
              <div className="flex gap-2">
                {newResult.numbers.map((num, index) => (
                  <input
                    key={index}
                    type="number"
                    min="1"
                    max={gameType === '649' ? 49 : 39}
                    value={num}
                    onChange={(e) => {
                      const newNumbers = [...newResult.numbers];
                      newNumbers[index] = e.target.value;
                      setNewResult({ ...newResult, numbers: newNumbers });
                    }}
                    className="w-16 px-2 py-1 border rounded text-center"
                    placeholder={`${index + 1}`}
                  />
                ))}
              </div>
              <input
                type="date"
                value={newResult.drawDate}
                onChange={(e) => setNewResult({ ...newResult, drawDate: e.target.value })}
                className="px-3 py-2 border rounded"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAddResult}
                  disabled={isAdding}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all disabled:opacity-50"
                >
                  {isAdding ? 'Adding...' : 'Add Result'}
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setNewResult({
                      drawDate: new Date().toISOString().split('T')[0],
                      numbers: Array(gameType === '649' ? 6 : 5).fill('')
                    });
                  }}
                  className="px-4 py-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Results list */}
          <div className="overflow-y-auto max-h-96 space-y-2">
            {isLoading ? (
              <div className="text-center py-8">
                <Loader2 className="animate-spin h-8 w-8 mx-auto text-blue-500" />
                <p className="text-gray-600 mt-2">Loading results...</p>
              </div>
            ) : results.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No results found
              </div>
            ) : (
              results.map((result) => (
                <div key={result.id} className="flex justify-between items-center p-3 bg-white border rounded-lg hover:shadow-md transition-all">
                  <div className="flex items-center space-x-4">
                    <span className="text-sm text-gray-600">{result.drawDate}</span>
                    <div className="flex gap-2">
                      {result.numbers?.map((num, idx) => (
                        <span key={idx} className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                          {num}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteResult(result.id)}
                    className="text-red-500 hover:text-red-700"
                  >
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// All Past Results Modal
function AllPastResultsModal({ gameType, onClose }) {
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadAllResults();
  }, [gameType]);

  const loadAllResults = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.getAllPastResults(gameType);
      if (response.success) {
        setResults(response.results || []);
      } else {
        setError('Failed to load results');
      }
    } catch (err) {
      setError(err.message || 'Failed to load results');
    } finally {
      setIsLoading(false);
    }
  };

  const gameInfo = {
    '539': { title: '539', icon: '🎯', color: 'from-purple-500 to-purple-600' },
    'MARK6': { title: 'Mark Six', icon: '🎰', color: 'from-green-500 to-green-600' },
    'LOTTO649': { title: 'Lotto 6/49', icon: '💎', color: 'from-blue-500 to-blue-600' }
  }[gameType];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        <div className={`bg-gradient-to-r ${gameInfo.color} text-white p-6 flex justify-between items-center`}>
          <div className="flex items-center space-x-3">
            <span className="text-3xl">{gameInfo.icon}</span>
            <h2 className="text-2xl font-bold">All Past Results - {gameInfo.title}</h2>
          </div>
          <button onClick={onClose} className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-lg">
            <X size={24} />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto max-h-[70vh]">
          {isLoading ? (
            <div className="text-center py-8">
              <LoadingSpinner size="lg" />
              <p className="text-gray-600 mt-4">Loading results...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-600">{error}</div>
          ) : results.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No results available</div>
          ) : (
            <div className="space-y-3">
              {results.map((result, idx) => (
                <div key={idx} className="flex items-center space-x-4 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-all">
                  <span className="text-sm text-gray-600 w-24">{result.date}</span>
                  <div className="flex gap-2">
                    {result.numbers.map((num, i) => (
                      <NumberBall key={i} number={num} size="sm" delay={i * 50} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Rolling Prediction Feature
function RollingPredictionFeature({ gameType, onClose }) {
  const [predictions, setPredictions] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [period, setPeriod] = useState(30);

  const handleRunRollingPrediction = async () => {
    setIsRunning(true);
    try {
      const response = await api.automation(gameType, `${period}days`, 10);
      if (response.success) {
        setPredictions(response.results.sets || []);
      }
    } catch (error) {
      console.error('Rolling prediction failed:', error);
    } finally {
      setIsRunning(false);
    }
  };

  const gameInfo = {
    '539': { title: '539', icon: '🎯', color: 'from-purple-500 to-purple-600' },
    'MARK6': { title: 'Mark Six', icon: '🎰', color: 'from-green-500 to-green-600' },
    'LOTTO649': { title: 'Lotto 6/49', icon: '💎', color: 'from-blue-500 to-blue-600' }
  }[gameType];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden">
        <div className={`bg-gradient-to-r ${gameInfo.color} text-white p-6 flex justify-between items-center`}>
          <div className="flex items-center space-x-3">
            <RotateCw className="h-8 w-8" />
            <h2 className="text-2xl font-bold">Rolling Prediction - {gameInfo.title}</h2>
          </div>
          <button onClick={onClose} className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-lg">
            <X size={24} />
          </button>
        </div>
        
        <div className="p-6">
          <div className="mb-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Analysis Period</label>
              <select 
                value={period} 
                onChange={(e) => setPeriod(Number(e.target.value))}
                className="w-full p-2 border rounded-lg"
              >
                <option value={7}>1 Week</option>
                <option value={14}>2 Weeks</option>
                <option value={30}>1 Month</option>
                <option value={90}>3 Months</option>
              </select>
            </div>
            
            <button
              onClick={handleRunRollingPrediction}
              disabled={isRunning}
              className="w-full py-3 px-4 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50"
            >
              {isRunning ? (
                <div className="flex items-center justify-center space-x-2">
                  <LoadingSpinner size="sm" />
                  <span>Running Analysis...</span>
                </div>
              ) : (
                'Run Rolling Prediction'
              )}
            </button>
          </div>
          
          {predictions.length > 0 && (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              <h3 className="font-semibold text-gray-700">Prediction Results</h3>
              {predictions.map((pred, idx) => (
                <div key={idx} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">Set {idx + 1}</span>
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                      {pred.confidence}% confidence
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {pred.numbers.map((num, i) => (
                      <NumberBall key={i} number={num} size="sm" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Lotto Picker Feature
function LottoPickerFeature({ gameType, onClose }) {
  const [pickedNumbers, setPickedNumbers] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateNumbers = async () => {
    setIsGenerating(true);
    try {
      const response = await api.predict(gameType, '1week');
      if (response.success) {
        setPickedNumbers(response.prediction.numbers || []);
      }
    } catch (error) {
      console.error('Number generation failed:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const gameInfo = {
    '539': { title: '539', icon: '🎯', color: 'from-purple-500 to-purple-600', max: 39 },
    'MARK6': { title: 'Mark Six', icon: '🎰', color: 'from-green-500 to-green-600', max: 49 },
    'LOTTO649': { title: 'Lotto 6/49', icon: '💎', color: 'from-blue-500 to-blue-600', max: 49 }
  }[gameType];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
        <div className={`bg-gradient-to-r ${gameInfo.color} text-white p-6 flex justify-between items-center`}>
          <div className="flex items-center space-x-3">
            <Zap className="h-8 w-8" />
            <h2 className="text-2xl font-bold">Lotto Picker - {gameInfo.title}</h2>
          </div>
          <button onClick={onClose} className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-lg">
            <X size={24} />
          </button>
        </div>
        
        <div className="p-6">
          <div className="text-center mb-6">
            <p className="text-gray-600 mb-4">Generate lucky numbers using AI analysis</p>
            <button
              onClick={handleGenerateNumbers}
              disabled={isGenerating}
              className={`py-3 px-6 bg-gradient-to-r ${gameInfo.color} text-white rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50`}
            >
              {isGenerating ? (
                <div className="flex items-center justify-center space-x-2">
                  <LoadingSpinner size="sm" />
                  <span>Generating...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-2">
                  <Pipette className="h-5 w-5" />
                  <span>Pick Numbers</span>
                </div>
              )}
            </button>
          </div>
          
          {pickedNumbers.length > 0 && (
            <div className="text-center">
              <h3 className="font-semibold text-gray-700 mb-4">Your Lucky Numbers</h3>
              <div className="flex justify-center gap-3">
                {pickedNumbers.map((num, i) => (
                  <NumberBall key={i} number={num} size="lg" delay={i * 100} />
                ))}
              </div>
              <p className="text-sm text-gray-500 mt-4">
                Numbers selected from 1-{gameInfo.max}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Main App Component
function App() {
  const { user, logout, isLoading: authLoading } = useAuth();
  const [selectedGame, setSelectedGame] = useState(null);
  const [predictions, setPredictions] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showHistoricalModal, setShowHistoricalModal] = useState(null);
  const [showAllPastResults, setShowAllPastResults] = useState(null);
  const [showRollingPrediction, setShowRollingPrediction] = useState(null);
  const [showLottoPicker, setShowLottoPicker] = useState(null);
  const [selectedFrequencyDays, setSelectedFrequencyDays] = useState({
    '539': 30,
    'MARK6': 30,
    'LOTTO649': 30
  });
  const [selectedMultipliers, setSelectedMultipliers] = useState({
    '539': 10,
    'MARK6': 10,
    'LOTTO649': 10
  });
  const [automationResults, setAutomationResults] = useState({});
  const [isAutomationRunning, setIsAutomationRunning] = useState(false);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  const handlePredict = async (gameType) => {
    setIsLoading(true);
    setError(null);
    try {
      const period = `${selectedFrequencyDays[gameType]}days`;
      const response = await api.predict(gameType, period);
      
      if (response.success) {
        setPredictions(prev => ({
          ...prev,
          [gameType]: response.prediction
        }));
      } else {
        setError(response.error || 'Prediction failed');
      }
    } catch (err) {
      setError(err.message || 'Network error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunAutomation = async (gameType) => {
    setIsAutomationRunning(true);
    setError(null);
    try {
      const period = `${selectedFrequencyDays[gameType]}days`;
      const multiplier = selectedMultipliers[gameType];
      const response = await api.automation(gameType, period, multiplier);
      
      if (response.success) {
        setAutomationResults(prev => ({
          ...prev,
          [gameType]: response.results
        }));
      } else {
        setError(response.error || 'Automation failed');
      }
    } catch (err) {
      setError(err.message || 'Network error');
    } finally {
      setIsAutomationRunning(false);
    }
  };

  const handleClearAutomation = (gameType) => {
    setAutomationResults(prev => ({
      ...prev,
      [gameType]: null
    }));
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

  const games = {
    '539': {
      title: '539 Lottery',
      icon: '🎯',
      description: 'Pick 5 from 39',
      color: 'from-purple-500 to-purple-600'
    },
    'MARK6': {
      title: 'Mark Six',
      icon: '🎰',
      description: 'Pick 6 from 49',
      color: 'from-green-500 to-green-600'
    },
    'LOTTO649': {
      title: 'Lotto 6/49',
      icon: '💎',
      description: 'Pick 6 from 49',
      color: 'from-blue-500 to-blue-600'
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-12">
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center space-x-4">
              {user.role === USER_ROLES.ADMIN && (
                <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-semibold">
                  Admin
                </span>
              )}
              <span className="text-gray-600">Welcome, {user.username}</span>
            </div>
            <button
              onClick={logout}
              className="flex items-center space-x-2 px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg transition-all"
            >
              <LogOut size={20} />
              <span>Logout</span>
            </button>
          </div>
          
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
            AI Lottery Predictor
          </h1>
          <p className="text-xl text-gray-600 flex items-center justify-center space-x-2">
            <Brain className="h-6 w-6" />
            <span>Advanced Machine Learning Predictions</span>
          </p>
        </header>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-3">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <span className="text-red-700">{error}</span>
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {Object.entries(games).map(([gameType, info]) => (
            <div
              key={gameType}
              className={`
                p-6 rounded-2xl transition-all duration-300 cursor-pointer
                ${selectedGame === gameType 
                  ? 'bg-gradient-to-br ' + info.color + ' text-white shadow-2xl scale-105'
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
                  {user.role === USER_ROLES.ADMIN && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowHistoricalModal(gameType);
                      }}
                      className="w-full py-2 px-4 bg-white bg-opacity-20 text-white rounded-lg font-medium hover:bg-opacity-30 transition-all flex items-center justify-center space-x-2"
                    >
                      <Shield className="h-4 w-4" />
                      <span>Admin Panel</span>
                    </button>
                  )}
                  
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

      {showHistoricalModal && (
        <HistoricalDataModal 
          gameType={showHistoricalModal} 
          onClose={() => setShowHistoricalModal(null)} 
        />
      )}

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