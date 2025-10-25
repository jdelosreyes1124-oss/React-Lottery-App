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
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      }
    })
    .then(async res => {
      if (!res.ok) {
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

// Game configurations
const GAME_INFO = {
  '539': {
    title: '539 Lottery',
    description: 'Pick 5 from 39',
    icon: '🎰',
    color: 'from-blue-500 to-blue-600',
    maxNumber: 39,
    ballCount: 5
  },
  'mark6': {
    title: 'Mark Six',
    description: 'Pick 6 from 49',
    icon: '🎲',
    color: 'from-purple-500 to-purple-600',
    maxNumber: 49,
    ballCount: 6
  },
  'lotto649': {
    title: 'Lotto 649',
    description: 'Pick 6 from 49',
    icon: '🎯',
    color: 'from-green-500 to-green-600',
    maxNumber: 49,
    ballCount: 6
  }
};

// Auth Context
const AuthContext = React.createContext();

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    verifyAuth();
  }, []);

  const verifyAuth = async () => {
    try {
      const response = await api.verifyAuth();
      if (response.authenticated) {
        setIsAuthenticated(true);
        setUser(response.user);
      } else {
        setIsAuthenticated(false);
        setUser(null);
      }
    } catch (error) {
      console.error('Auth verification failed:', error);
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (username, password) => {
    try {
      const response = await api.login({ username, password });
      if (response.success) {
        setIsAuthenticated(true);
        setUser(response.user);
        await verifyAuth();
        return { success: true };
      }
      return { success: false, error: response.error || 'Login failed' };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: error.message };
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setIsAuthenticated(false);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isLoading, login, logout, verifyAuth }}>
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

// Loading Spinner Component
const LoadingSpinner = ({ size = 'md' }) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12'
  };
  
  return (
    <div className={`${sizeClasses[size]} animate-spin rounded-full border-2 border-gray-300 border-t-blue-600`} />
  );
};

// Number Ball Component
const NumberBall = ({ number, isBonus = false, size = 'md', delay = 0 }) => {
  const [isVisible, setIsVisible] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);
  
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-14 h-14 text-lg'
  };
  
  return (
    <div
      className={`${sizeClasses[size]} rounded-full flex items-center justify-center font-bold text-white transform transition-all duration-500 hover:scale-110 ${
        isVisible ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
      } ${
        isBonus 
          ? 'bg-gradient-to-br from-red-500 to-red-700 shadow-red-300' 
          : 'bg-gradient-to-br from-blue-500 to-blue-700 shadow-blue-300'
      } shadow-lg`}
    >
      {number}
    </div>
  );
};

// Custom Slider Component
const CustomSlider = ({ value, max, onChange, disabled, label, color, icon: Icon }) => {
  const percentage = (value / max) * 100;
  
  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    purple: 'bg-purple-500'
  };
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center space-x-2 text-gray-600">
          {Icon && <Icon size={16} />}
          <span>{label}</span>
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
          className={`w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider ${
            disabled ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          style={{
            background: `linear-gradient(to right, ${
              color === 'blue' ? '#3B82F6' : color === 'green' ? '#10B981' : '#8B5CF6'
            } 0%, ${
              color === 'blue' ? '#3B82F6' : color === 'green' ? '#10B981' : '#8B5CF6'
            } ${percentage}%, #E5E7EB ${percentage}%, #E5E7EB 100%)`
          }}
        />
      </div>
    </div>
  );
};

// Automation Results Component
const AutomationResults = ({ results, onClear }) => {
  if (!results) return null;
  
  const topNumbers = results.topNumbers || [];
  const statistics = results.statistics || {};
  
  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-200">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-gray-700 flex items-center space-x-2">
          <Zap className="h-4 w-4 text-blue-600" />
          <span>Automation Results</span>
        </h4>
        <button
          onClick={onClear}
          className="text-gray-500 hover:text-gray-700 transition-colors"
        >
          <X size={16} />
        </button>
      </div>
      
      {topNumbers.length > 0 && (
        <div className="space-y-3">
          <div>
            <p className="text-sm text-gray-600 mb-2">Top Recommended Numbers:</p>
            <div className="flex flex-wrap gap-2">
              {topNumbers.slice(0, 10).map((item, idx) => (
                <div key={idx} className="flex items-center space-x-1 bg-white px-2 py-1 rounded-full shadow-sm">
                  <NumberBall number={item.number} size="sm" />
                  <span className="text-xs text-gray-600">({item.frequency})</span>
                </div>
              ))}
            </div>
          </div>
          
          {statistics.totalIterations && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white p-2 rounded">
                <span className="text-gray-600">Iterations:</span>
                <span className="font-semibold ml-1">{statistics.totalIterations}</span>
              </div>
              <div className="bg-white p-2 rounded">
                <span className="text-gray-600">Unique Sets:</span>
                <span className="font-semibold ml-1">{statistics.uniqueSets || 0}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Notification Component
const Notification = ({ message, type = 'info', onClose }) => {
  const typeClasses = {
    info: 'bg-blue-500',
    success: 'bg-green-500',
    error: 'bg-red-500',
    warning: 'bg-yellow-500'
  };
  
  const icons = {
    info: <Info className="h-5 w-5" />,
    success: <CheckCircle2 className="h-5 w-5" />,
    error: <AlertCircle className="h-5 w-5" />,
    warning: <AlertCircle className="h-5 w-5" />
  };
  
  return (
    <div className={`fixed top-4 right-4 z-50 ${typeClasses[type]} text-white p-4 rounded-lg shadow-lg flex items-center space-x-3 animate-slideIn max-w-md`}>
      {icons[type]}
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="hover:opacity-80">
        <X size={20} />
      </button>
    </div>
  );
};

// Login Component
const LoginComponent = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    const result = await login(username, password);
    if (!result.success) {
      setError(result.error || 'Login failed');
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full">
              <Lock className="h-8 w-8 text-white" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-gray-800">Lottery Prediction System</h2>
          <p className="text-gray-600 mt-2">Sign in to access predictions</p>
        </div>
        
        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your username"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your password"
              required
            />
          </div>
          
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-center space-x-2">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}
          
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-semibold hover:from-blue-600 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
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
      </div>
    </div>
  );
};

// Scraper Component
const ScraperComponent = ({ gameType, onClose, onImportComplete }) => {
  const [preview, setPreview] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [maxResults, setMaxResults] = useState(30);
  const [mergeStrategy, setMergeStrategy] = useState('skip');
  const [schedulerStatus, setSchedulerStatus] = useState(null);
  const [scheduleTime, setScheduleTime] = useState('09:00');

  useEffect(() => {
    loadPreview();
    loadSchedulerStatus();
  }, [gameType]);

  const loadPreview = async () => {
    setIsLoading(true);
    try {
      const data = await api.scraperPreview(gameType, maxResults);
      setPreview(data);
    } catch (error) {
      console.error('Failed to load preview:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSchedulerStatus = async () => {
    try {
      const status = await api.getSchedulerStatus(gameType);
      setSchedulerStatus(status);
    } catch (error) {
      console.error('Failed to load scheduler status:', error);
    }
  };

  const handleImport = async () => {
    setIsLoading(true);
    try {
      const result = await api.scraperImport(gameType, maxResults, mergeStrategy);
      if (result.success) {
        onImportComplete(result.imported, result.skipped);
        onClose();
      }
    } catch (error) {
      console.error('Import failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartScheduler = async () => {
    setIsLoading(true);
    try {
      const result = await api.startScheduler(gameType, scheduleTime);
      if (result.success) {
        loadSchedulerStatus();
      }
    } catch (error) {
      console.error('Failed to start scheduler:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopScheduler = async () => {
    setIsLoading(true);
    try {
      const result = await api.stopScheduler(gameType);
      if (result.success) {
        loadSchedulerStatus();
      }
    } catch (error) {
      console.error('Failed to stop scheduler:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTriggerManual = async () => {
    setIsLoading(true);
    try {
      const result = await api.triggerManualScrape(gameType);
      if (result.success) {
        onImportComplete(result.imported || 0, result.skipped || 0);
      }
    } catch (error) {
      console.error('Failed to trigger manual scrape:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold flex items-center space-x-2">
            <Database className="h-6 w-6 text-blue-600" />
            <span>Auto Update Results - {gameType.toUpperCase()}</span>
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Scheduler Section */}
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="font-semibold mb-3 flex items-center space-x-2">
                <Calendar className="h-5 w-5" />
                <span>Auto-Update Scheduler</span>
              </h3>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span>Status:</span>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    schedulerStatus?.isActive 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {schedulerStatus?.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>

                {schedulerStatus?.isActive && schedulerStatus?.schedule && (
                  <>
                    <div className="text-sm text-gray-600">
                      <p>Schedule: Daily at {schedulerStatus.schedule}</p>
                      {schedulerStatus.lastRun && (
                        <p>Last Run: {new Date(schedulerStatus.lastRun).toLocaleString()}</p>
                      )}
                      {schedulerStatus.nextRun && (
                        <p>Next Run: {new Date(schedulerStatus.nextRun).toLocaleString()}</p>
                      )}
                    </div>
                  </>
                )}

                <div className="flex items-center space-x-2">
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="px-3 py-2 border rounded"
                    disabled={schedulerStatus?.isActive}
                  />
                  
                  {!schedulerStatus?.isActive ? (
                    <button
                      onClick={handleStartScheduler}
                      disabled={isLoading}
                      className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                    >
                      Start Scheduler
                    </button>
                  ) : (
                    <button
                      onClick={handleStopScheduler}
                      disabled={isLoading}
                      className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                    >
                      Stop Scheduler
                    </button>
                  )}

                  <button
                    onClick={handleTriggerManual}
                    disabled={isLoading}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    Run Now
                  </button>
                </div>
              </div>
            </div>

            {/* Manual Import Section */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold mb-3">Manual Import Settings</h3>
              
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Results to Import
                  </label>
                  <input
                    type="number"
                    value={maxResults}
                    onChange={(e) => setMaxResults(parseInt(e.target.value))}
                    min="1"
                    max="500"
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Merge Strategy
                  </label>
                  <select
                    value={mergeStrategy}
                    onChange={(e) => setMergeStrategy(e.target.value)}
                    className="w-full px-3 py-2 border rounded"
                  >
                    <option value="skip">Skip Duplicates</option>
                    <option value="replace">Replace Existing</option>
                    <option value="merge">Merge All</option>
                  </select>
                </div>
              </div>

              <button
                onClick={loadPreview}
                disabled={isLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {isLoading ? 'Loading...' : 'Refresh Preview'}
              </button>
            </div>

            {/* Preview Section */}
            {preview && (
              <div>
                <h3 className="font-semibold mb-3">
                  Preview ({preview.results?.length || 0} results available)
                </h3>
                
                {preview.status && (
                  <div className="mb-3 p-3 bg-yellow-50 rounded text-sm">
                    <p>Source: {preview.status.source}</p>
                    <p>Last Updated: {new Date(preview.status.lastUpdate).toLocaleString()}</p>
                  </div>
                )}

                <div className="max-h-60 overflow-y-auto border rounded p-3 space-y-2">
                  {preview.results?.slice(0, 10).map((result, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-white rounded">
                      <span className="text-sm text-gray-600">{result.date}</span>
                      <div className="flex space-x-1">
                        {result.numbers?.map((num, i) => (
                          <NumberBall key={i} number={num} size="sm" />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4">
                  <button
                    onClick={handleImport}
                    disabled={isLoading}
                    className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-semibold"
                  >
                    {isLoading ? 'Importing...' : `Import ${maxResults} Results`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Confirm Dialog Component
const ConfirmDialog = ({ message, onConfirm, onCancel }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
        <p className="text-gray-700 mb-6">{message}</p>
        <div className="flex justify-end space-x-3">
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

// Fixed Admin Panel Component 
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
      const response = await api.getHistoricalResults(gameType, page, 50);
      
      if (response && response.success) {
        setHistoricalResults(prev => ({
          ...prev,
          [gameType]: {
            results: append 
              ? [...(prev[gameType]?.results || []), ...(response.results || [])]
              : response.results || []
          }
        }));
        
        if (response.total !== undefined) {
          setPagination(prev => ({
            ...prev,
            total: response.total,
            totalPages: Math.ceil(response.total / prev.limit)
          }));
        }
      }
    } catch (error) {
      console.error('Failed to load historical results:', error);
      showNotification('Failed to load results: ' + error.message, 'error');
    } finally {
      setIsLoading(false);
    }
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

    // Validate number range
    const maxNumber = selectedGameType === '539' ? 39 : 49;
    if (numbers.some(n => n > maxNumber)) {
      showNotification(`Numbers must be between 1 and ${maxNumber}`, 'error');
      return;
    }

    // Check for duplicates
    if (new Set(numbers).size !== numbers.length) {
      showNotification('Numbers must be unique', 'error');
      return;
    }

    const result = {
      numbers,
      drawDate: newResult.drawDate || new Date().toISOString().split('T')[0]
    };

    if (newResult.bonus && (selectedGameType === 'mark6' || selectedGameType === 'lotto649')) {
      const bonusNum = parseInt(newResult.bonus);
      if (!isNaN(bonusNum) && bonusNum >= 1 && bonusNum <= maxNumber) {
        result.bonus = bonusNum;
      }
    }

    setIsLoading(true);
    try {
      const response = await api.addHistoricalResult(selectedGameType, result);
      
      if (response && response.success) {
        // Reset form
        setNewResult({ 
          number1: '', number2: '', number3: '', number4: '', number5: '', number6: '',
          bonus: '', drawDate: '' 
        });
        setShowAddForm(false);
        
        // Update results
        if (response.results) {
          setHistoricalResults(prev => ({
            ...prev,
            [selectedGameType]: {
              results: response.results
            }
          }));
          
          if (response.total !== undefined) {
            setPagination(prev => ({
              ...prev,
              total: response.total,
              totalPages: Math.ceil(response.total / prev.limit)
            }));
          }
        } else {
          await loadHistoricalResults(selectedGameType, 1);
        }
        showNotification('Result added successfully!', 'success');
      } else {
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
      const response = await api.deleteHistoricalResult(selectedGameType, resultId);
      
      if (response && response.success) {
        if (response.results) {
          setHistoricalResults(prev => ({
            ...prev,
            [selectedGameType]: {
              results: response.results
            }
          }));
          
          if (response.total !== undefined) {
            setPagination(prev => ({
              ...prev,
              total: response.total,
              totalPages: Math.ceil(response.total / prev.limit)
            }));
          }
        } else {
          await loadHistoricalResults(selectedGameType, 1);
        }
        showNotification('Result deleted successfully', 'success');
      } else {
        showNotification(response?.error || 'Failed to delete', 'error');
      }
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
      
      if (response && response.success) {
        if (response.results) {
          setHistoricalResults(prev => ({
            ...prev,
            [selectedGameType]: {
              results: response.results
            }
          }));
          
          if (response.total !== undefined) {
            setPagination(prev => ({
              ...prev,
              total: response.total,
              totalPages: Math.ceil(response.total / prev.limit)
            }));
          }
          
          showNotification(
            `Sync completed! ${response.total || response.results.length} results loaded`,
            'success'
          );
        } else {
          showNotification(
            `Sync completed! ${response.imported || 0} imported, ${response.skipped || 0} skipped`,
            'success'
          );
          await loadHistoricalResults(selectedGameType, 1);
        }
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
  
  // Fixed grid classes - using explicit Tailwind classes
  const getGridClassName = () => {
    if (numberCount === 5) {
      return "grid grid-cols-5 gap-2 mb-3";
    } else {
      return "grid grid-cols-6 gap-2 mb-3";
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between p-6 border-b">
            <h2 className="text-2xl font-bold flex items-center space-x-2">
              <Shield className="h-6 w-6 text-blue-600" />
              <span>Admin Panel - Historical Data</span>
            </h2>
            <button 
              onClick={onClose} 
              className="text-gray-500 hover:text-gray-700 hover:scale-110 transition-all duration-200 text-2xl"
            >
              ×
            </button>
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
                    <div className={getGridClassName()}>
                      {Array.from({ length: numberCount }).map((_, index) => (
                        <input
                          key={index}
                          type="number"
                          min="1"
                          max={selectedGameType === '539' ? '39' : '49'}
                          placeholder={`${index + 1}`}
                          value={newResult[`number${index + 1}`]}
                          onChange={(e) => handleNumberChange(`number${index + 1}`, e.target.value)}
                          className="px-3 py-2 border rounded text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      ))}
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-3">
                    <input
                      type="date"
                      value={newResult.drawDate}
                      onChange={(e) => handleNumberChange('drawDate', e.target.value)}
                      className="px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {(selectedGameType === 'mark6' || selectedGameType === 'lotto649') && (
                      <input
                        type="number"
                        min="1"
                        max="49"
                        placeholder="Bonus Number"
                        value={newResult.bonus}
                        onChange={(e) => handleNumberChange('bonus', e.target.value)}
                        className="px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    )}
                  </div>
                  
                  <div className="flex space-x-2 mt-3">
                    <button
                      onClick={handleAddResult}
                      disabled={isLoading}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 hover:scale-105 transition-all duration-200 disabled:opacity-50"
                    >
                      {isLoading ? 'Adding...' : 'Add Result'}
                    </button>
                    <button
                      onClick={() => {
                        setShowAddForm(false);
                        setNewResult({ 
                          number1: '', number2: '', number3: '', number4: '', 
                          number5: '', number6: '', bonus: '', drawDate: '' 
                        });
                      }}
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
                        <div key={result.id || result._id || index} className="flex items-center justify-between p-3 bg-white border rounded-lg hover:shadow-md transition-all duration-200">
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
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-red-700 text-white flex items-center justify-center text-xs font-bold ml-2">
                                  {result.bonus}
                                </div>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteResult(result.id || result._id)}
                            className="text-red-500 hover:text-red-700 hover:scale-110 transition-all duration-200"
                          >
                            <X className="h-5 w-5" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-12 text-gray-500">
                        <Database className="h-12 w-12 mx-auto mb-4 opacity-30" />
                        <p>No historical results available</p>
                        <p className="text-sm mt-2">Add some results to get started</p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

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

      {showScraper && (
        <ScraperComponent
          gameType={selectedGameType}
          onClose={() => setShowScraper(false)}
          onImportComplete={(imported, skipped) => {
            loadHistoricalResults(selectedGameType, 1);
            showNotification(`Import complete! ${imported} imported, ${skipped} skipped`, 'success');
          }}
        />
      )}
    </>
  );
};

// All Past Results Modal Component
const AllPastResultsModal = ({ gameType, onClose }) => {
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  useEffect(() => {
    loadAllResults();
  }, [gameType]);

  const loadAllResults = async () => {
    setIsLoading(true);
    try {
      const data = await api.getAllPastResults(gameType);
      if (data.success && data.results) {
        setResults(data.results);
      }
    } catch (error) {
      console.error('Failed to load all past results:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredResults = results.filter(result => {
    const matchesSearch = !searchTerm || 
      result.numbers?.some(num => num.toString().includes(searchTerm));
    const matchesDate = !dateFilter || 
      (result.drawDate && result.drawDate.includes(dateFilter));
    return matchesSearch && matchesDate;
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold flex items-center space-x-2">
            <Database className="h-6 w-6 text-green-600" />
            <span>All Past Results - {GAME_INFO[gameType]?.title}</span>
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={24} />
          </button>
        </div>

        <div className="p-4 border-b bg-gray-50">
          <div className="grid md:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Search numbers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div className="mt-3 text-sm text-gray-600">
            Found {filteredResults.length} of {results.length} results
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-green-500 mb-2" />
              <p className="text-gray-600">Loading all results...</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredResults.length > 0 ? (
                filteredResults.map((result, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-white border rounded-lg hover:shadow-md transition-all duration-200">
                    <div className="flex items-center space-x-4">
                      <div className="text-sm text-gray-500 min-w-[100px]">
                        {result.drawDate ? new Date(result.drawDate).toLocaleDateString() : 'N/A'}
                      </div>
                      <div className="flex space-x-1">
                        {result.numbers?.map((num, i) => (
                          <NumberBall key={i} number={num} size="sm" />
                        ))}
                        {result.bonus && (
                          <NumberBall number={result.bonus} isBonus={true} size="sm" />
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <Database className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p>No results found</p>
                </div>
              )}
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
  const [isLoading, setIsLoading] = useState(false);
  const [iterations, setIterations] = useState(10);
  const [period, setPeriod] = useState(30);

  const handleGenerateRolling = async () => {
    setIsLoading(true);
    try {
      const results = [];
      for (let i = 0; i < iterations; i++) {
        const data = await api.predict(gameType, `${period}days`);
        if (data.success && data.prediction) {
          results.push(data.prediction);
        }
        // Add small delay between requests
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      setPredictions(results);
    } catch (error) {
      console.error('Failed to generate rolling predictions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold flex items-center space-x-2">
            <RotateCw className="h-6 w-6 text-purple-600" />
            <span>Rolling Prediction - {GAME_INFO[gameType]?.title}</span>
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={24} />
          </button>
        </div>

        <div className="p-6">
          <div className="bg-purple-50 p-4 rounded-lg mb-6">
            <h3 className="font-semibold mb-3">Settings</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Number of Iterations
                </label>
                <input
                  type="number"
                  value={iterations}
                  onChange={(e) => setIterations(parseInt(e.target.value))}
                  min="1"
                  max="50"
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Analysis Period (days)
                </label>
                <input
                  type="number"
                  value={period}
                  onChange={(e) => setPeriod(parseInt(e.target.value))}
                  min="7"
                  max="365"
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
            </div>
            <button
              onClick={handleGenerateRolling}
              disabled={isLoading}
              className="mt-4 w-full px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 font-semibold"
            >
              {isLoading ? 'Generating...' : `Generate ${iterations} Predictions`}
            </button>
          </div>

          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-purple-500 mb-2" />
              <p className="text-gray-600">Generating rolling predictions...</p>
            </div>
          )}

          {predictions.length > 0 && !isLoading && (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {predictions.map((pred, index) => (
                <div key={index} className="p-3 bg-white border rounded-lg hover:shadow-md transition-all duration-200">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-600">
                      Prediction #{index + 1}
                    </span>
                    <div className="flex space-x-1">
                      {pred.numbers?.map((num, i) => (
                        <NumberBall key={i} number={num} size="sm" />
                      ))}
                      {pred.bonus && (
                        <NumberBall number={pred.bonus} isBonus={true} size="sm" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Lotto Picker Feature Component
const LottoPickerFeature = ({ gameType, onClose }) => {
  const [quickPicks, setQuickPicks] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [numberOfSets, setNumberOfSets] = useState(5);

  const generateQuickPicks = () => {
    setIsGenerating(true);
    const gameInfo = GAME_INFO[gameType];
    const picks = [];

    for (let i = 0; i < numberOfSets; i++) {
      const numbers = new Set();
      while (numbers.size < gameInfo.ballCount) {
        numbers.add(Math.floor(Math.random() * gameInfo.maxNumber) + 1);
      }
      picks.push({
        numbers: Array.from(numbers).sort((a, b) => a - b),
        bonus: gameType !== '539' ? Math.floor(Math.random() * gameInfo.maxNumber) + 1 : null
      });
    }

    setQuickPicks(picks);
    setTimeout(() => setIsGenerating(false), 500);
  };

  useEffect(() => {
    generateQuickPicks();
  }, []);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold flex items-center space-x-2">
            <Zap className="h-6 w-6 text-green-600" />
            <span>Lotto Picker - {GAME_INFO[gameType]?.title}</span>
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={24} />
          </button>
        </div>

        <div className="p-6">
          <div className="bg-green-50 p-4 rounded-lg mb-6">
            <h3 className="font-semibold mb-3">Quick Pick Generator</h3>
            <div className="flex items-center space-x-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Number of Sets
                </label>
                <input
                  type="number"
                  value={numberOfSets}
                  onChange={(e) => setNumberOfSets(Math.min(20, Math.max(1, parseInt(e.target.value) || 1)))}
                  min="1"
                  max="20"
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <button
                onClick={generateQuickPicks}
                disabled={isGenerating}
                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-semibold"
              >
                {isGenerating ? 'Generating...' : 'Generate New'}
              </button>
            </div>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {quickPicks.map((pick, index) => (
              <div
                key={index}
                className="p-4 bg-white border rounded-lg hover:shadow-md transition-all duration-200"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-600">
                    Set #{index + 1}
                  </span>
                  <div className="flex items-center space-x-2">
                    <div className="flex space-x-1">
                      {pick.numbers.map((num, i) => (
                        <NumberBall 
                          key={i} 
                          number={num} 
                          size="md" 
                          delay={isGenerating ? i * 50 : 0}
                        />
                      ))}
                    </div>
                    {pick.bonus && (
                      <>
                        <span className="text-gray-400">+</span>
                        <NumberBall 
                          number={pick.bonus} 
                          isBonus={true} 
                          size="md"
                          delay={isGenerating ? pick.numbers.length * 50 : 0}
                        />
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-yellow-50 rounded-lg">
            <p className="text-sm text-gray-700">
              <strong>Note:</strong> These are randomly generated numbers for entertainment purposes. 
              The lottery is a game of chance, and all numbers have equal probability of being drawn.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Main App Component
function App() {
  const { user, isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const [predictions, setPredictions] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [selectedGame, setSelectedGame] = useState(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [notification, setNotification] = useState(null);
  const [selectedFrequencyDays, setSelectedFrequencyDays] = useState({
    '539': 30,
    'mark6': 30,
    'lotto649': 30
  });
  const [selectedMultipliers, setSelectedMultipliers] = useState({
    '539': 100,
    'mark6': 100,
    'lotto649': 100
  });
  const [automationResults, setAutomationResults] = useState({});
  const [isAutomationRunning, setIsAutomationRunning] = useState(false);
  const [showAllPastResults, setShowAllPastResults] = useState(null);
  const [showRollingPrediction, setShowRollingPrediction] = useState(null);
  const [showLottoPicker, setShowLottoPicker] = useState(null);

  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const handlePredict = async (gameType) => {
    setIsLoading(true);
    try {
      const frequencyDays = selectedFrequencyDays[gameType];
      const period = `${frequencyDays}days`;
      const data = await api.predict(gameType, period);
      
      if (data.success && data.prediction) {
        setPredictions(prev => ({
          ...prev,
          [gameType]: data.prediction
        }));
        showNotification('Prediction generated successfully!', 'success');
      } else {
        showNotification('Failed to generate prediction', 'error');
      }
    } catch (error) {
      console.error('Prediction error:', error);
      showNotification('Error generating prediction', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunAutomation = async (gameType) => {
    setIsAutomationRunning(true);
    try {
      const frequencyDays = selectedFrequencyDays[gameType];
      const multiplier = selectedMultipliers[gameType];
      const period = `${frequencyDays}days`;
      
      const data = await api.automation(gameType, period, multiplier);
      
      if (data.success) {
        setAutomationResults(prev => ({
          ...prev,
          [gameType]: data
        }));
        showNotification(`Automation completed! Generated ${multiplier} iterations`, 'success');
      } else {
        showNotification('Automation failed', 'error');
      }
    } catch (error) {
      console.error('Automation error:', error);
      showNotification('Error running automation', 'error');
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
    const value = FREQUENCY_OPTIONS[index].value;
    setSelectedFrequencyDays(prev => ({
      ...prev,
      [gameType]: value
    }));
  };

  const handleMultiplierChange = (gameType, index) => {
    const value = MULTIPLIER_OPTIONS[index].value;
    setSelectedMultipliers(prev => ({
      ...prev,
      [gameType]: value
    }));
  };

  const handleLogout = async () => {
    await logout();
    setPredictions({});
    setAutomationResults({});
    setSelectedGame(null);
    showNotification('Logged out successfully', 'info');
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginComponent />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}

      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-10">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full">
                <Brain className="h-8 w-8 text-white" />
              </div>
              <div className="text-left">
                <h1 className="text-3xl font-bold text-gray-800">Lottery Prediction System</h1>
                <p className="text-gray-600">AI-Powered Number Analysis</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              {user && (
                <div className="flex items-center space-x-2 px-4 py-2 bg-white rounded-lg shadow">
                  <User className="h-5 w-5 text-gray-600" />
                  <span className="text-gray-700">{user.username}</span>
                  {user.role === USER_ROLES.ADMIN && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">Admin</span>
                  )}
                </div>
              )}
              
              {user?.role === USER_ROLES.ADMIN && (
                <button
                  onClick={() => setShowAdminPanel(true)}
                  className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-200 flex items-center space-x-2 shadow hover:shadow-lg"
                >
                  <Shield className="h-5 w-5" />
                  <span>Admin Panel</span>
                </button>
              )}
              
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all duration-200 flex items-center space-x-2 shadow hover:shadow-lg"
              >
                <LogOut className="h-5 w-5" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </header>

        <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {Object.entries(GAME_INFO).map(([gameType, info]) => (
            <div
              key={gameType}
              className={`p-6 rounded-xl transition-all duration-300 cursor-pointer ${
                selectedGame === gameType
                  ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-2xl scale-105'
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

      {showAdminPanel && (
        <AdminPanel onClose={() => setShowAdminPanel(false)} />
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