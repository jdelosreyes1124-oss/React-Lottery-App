// COMPLETE APP.JS WITH USER MANAGEMENT
// Replace your entire src/App.js file with this code

import React, { useState, useEffect } from 'react';
import { Brain, Activity, AlertCircle, CheckCircle2, Zap, TrendingUp, Loader2, Database, Shield, Lock, User, LogOut, X, Info, Calendar, RotateCw, Pipette, Trash2 } from 'lucide-react';

// API Configuration
const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://react-lottery-app.onrender.com/api';
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;

// Constants
const USER_ROLES = { ADMIN: 'admin', USER: 'user', GUEST: 'guest' };
const FREQUENCY_OPTIONS = [
  { value: 7, label: '1 Week' },
  { value: 14, label: '2 Weeks' },
  { value: 30, label: '1 Month' },
  { value: 90, label: '3 Months' },
  { value: 180, label: '6 Months' },
  { value: 365, label: '1 Year' }
];
const MULTIPLIER_OPTIONS = [
  { value: 1, label: '1x' },
  { value: 10, label: '10x' },
  { value: 50, label: '50x' },
  { value: 100, label: '100x' },
  { value: 300, label: '300x' },
  { value: 1000, label: '1000x' }
];

// API Service
const api = {
  login: ({ username, password }) =>
    fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      credentials: 'include'
    }).then(res => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))),
  
  register: ({ username, password, email }) =>
    fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, email }),
      credentials: 'include'
    }).then(res => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))),
  
  googleLogin: (tokenId) =>
    fetch(`${API_BASE_URL}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tokenId }),
      credentials: 'include'
    }).then(res => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))),
  
  verifyAuth: () =>
    fetch(`${API_BASE_URL}/auth/verify`, { credentials: 'include' })
      .then(res => res.json())
      .catch(() => ({ authenticated: false })),
  
  logout: () =>
    fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    }).then(res => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))),

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
    }).then(res => res.json())
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
      await api.logout();
      setUser(null);
    } catch (error) {
      console.error('Logout error:', error);
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

// UI Components
const LoadingSpinner = ({ size = 'md' }) => {
  const sizeClasses = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-8 w-8' };
  return <Loader2 className={`${sizeClasses[size]} animate-spin text-blue-500`} />;
};

const NumberBall = ({ number, isBonus = false, delay = 0, size = 'md', colorScheme = 'blue' }) => {
  const sizeClasses = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-12 h-12 text-base', xl: 'w-14 h-14 text-lg' };
  const colorSchemes = {
    blue: 'bg-gradient-to-br from-blue-500 to-blue-700',
    red: 'bg-gradient-to-br from-red-500 to-red-700',
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

const Notification = ({ message, type = 'info', onClose }) => {
  const styles = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800'
  };
  const icons = {
    success: <CheckCircle2 className="h-5 w-5" />,
    error: <AlertCircle className="h-5 w-5" />,
    info: <Info className="h-5 w-5" />
  };

  return (
    <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg border-2 shadow-lg ${styles[type]} max-w-md`}>
      <div className="flex items-start space-x-3">
        {icons[type]}
        <p className="text-sm font-medium flex-1">{message}</p>
        {onClose && (
          <button onClick={onClose} className="hover:opacity-70">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};

const ConfirmDialog = ({ message, onConfirm, onCancel }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
      <div className="flex items-start space-x-3 mb-4">
        <AlertCircle className="h-6 w-6 text-red-500 flex-shrink-0" />
        <div>
          <h3 className="text-lg font-semibold mb-2">Confirm Action</h3>
          <p className="text-gray-600">{message}</p>
        </div>
      </div>
      <div className="flex space-x-3 justify-end">
        <button onClick={onCancel} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">Cancel</button>
        <button onClick={onConfirm} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Confirm</button>
      </div>
    </div>
  </div>
);

// User Management Component
const UserManagementContent = ({ showNotification, showConfirm }) => {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/users/list`, { credentials: 'include' });
      if (response.status === 401) return showNotification('Please log in as admin', 'error');
      if (response.status === 403) return showNotification('Admin access required', 'error');
      const data = await response.json();
      if (data.success) {
        setUsers(data.users);
        showNotification(`Loaded ${data.total} users`, 'success');
      }
    } catch (error) {
      showNotification('Failed to load users: ' + error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteUser = async (userId, username) => {
    if (!await showConfirm(`Delete user "${username}"? This cannot be undone.`)) return;
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/users/${userId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await response.json();
      if (data.success) {
        showNotification(`User "${username}" deleted`, 'success');
        loadUsers();
      } else {
        showNotification(data.error || 'Delete failed', 'error');
      }
    } catch (error) {
      showNotification('Delete failed: ' + error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteAllUsers = async () => {
    if (!await showConfirm('⚠️ WARNING: Delete ALL non-admin users?')) return;
    if (!await showConfirm('🚨 FINAL CONFIRMATION: Proceed with deletion?')) return;
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/users/delete-all`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await response.json();
      if (data.success) {
        showNotification(`Deleted ${data.deletedCount} users`, 'success');
        loadUsers();
      } else {
        showNotification(data.error || 'Delete failed', 'error');
      }
    } catch (error) {
      showNotification('Delete failed: ' + error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-2">
          <User className="h-6 w-6 text-blue-600" />
          <h3 className="text-xl font-bold">User Management</h3>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={loadUsers}
            disabled={isLoading}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 hover:scale-105 transition-all"
          >
            <RotateCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={deleteAllUsers}
            disabled={isLoading || users.length <= 1}
            className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 hover:scale-105 transition-all"
          >
            <Trash2 className="h-4 w-4" />
            <span>Delete All</span>
          </button>
        </div>
      </div>

      <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
        <div className="flex items-start space-x-2">
          <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
          <div className="text-sm text-yellow-800">
            <p className="font-medium">Important:</p>
            <ul className="mt-1 ml-4 list-disc">
              <li>Admin accounts cannot be deleted</li>
              <li>You cannot delete your own account</li>
              <li>"Delete All" removes all non-admin users</li>
            </ul>
          </div>
        </div>
      </div>

      {isLoading && users.length === 0 ? (
        <div className="flex flex-col items-center py-12">
          <LoadingSpinner size="lg" />
          <p className="text-gray-600 mt-2">Loading users...</p>
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed">
          <User className="h-12 w-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600">No users found</p>
        </div>
      ) : (
        <>
          <div className="mb-2 p-2 bg-blue-50 rounded-lg border border-blue-200">
            <span className="text-sm text-blue-800">
              Total Users: <span className="font-bold text-lg">{users.length}</span>
            </span>
          </div>
          {users.map((user) => (
            <div key={user._id} className="flex items-center justify-between p-4 mb-2 bg-white border-2 rounded-lg hover:shadow-lg hover:border-blue-300 transition-all">
              <div className="flex items-center space-x-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${user.role === 'admin' ? 'bg-red-100' : 'bg-blue-100'}`}>
                  {user.role === 'admin' ? <Shield className="h-5 w-5 text-red-600" /> : <User className="h-5 w-5 text-blue-600" />}
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold">{user.username}</span>
                    {user.role === 'admin' && <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full">ADMIN</span>}
                    {user.authProvider === 'google' && <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">Google</span>}
                  </div>
                  <div className="text-sm text-gray-600">{user.email || 'No email'}</div>
                  <div className="text-xs text-gray-400">
                    ID: {user._id} | Last Login: {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                  </div>
                </div>
              </div>
              <button
                onClick={() => deleteUser(user._id, user.username)}
                disabled={isLoading || user.role === 'admin'}
                className="flex items-center space-x-2 px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 hover:scale-105 transition-all disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                <span className="text-sm font-medium">Delete</span>
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  );
};

// Admin Panel Component
const AdminPanel = ({ onClose }) => {
  const { isGoogleUser } = useAuth();
  const [activeTab, setActiveTab] = useState('users');
  const [notification, setNotification] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const showConfirm = (message) => new Promise((resolve) => {
    setConfirmDialog({
      message,
      onConfirm: () => { setConfirmDialog(null); resolve(true); },
      onCancel: () => { setConfirmDialog(null); resolve(false); }
    });
  });

  if (isGoogleUser) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg p-8 max-w-md">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold flex items-center space-x-2">
              <AlertCircle className="h-6 w-6 text-red-500" />
              <span>Access Denied</span>
            </h2>
            <button onClick={onClose}><X className="h-6 w-6" /></button>
          </div>
          <p className="text-gray-600 mb-4">Google users cannot access Admin Panel. Use regular admin credentials.</p>
          <button onClick={onClose} className="w-full py-2 bg-blue-600 text-white rounded-lg">Close</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <div className="p-6 border-b bg-gradient-to-r from-blue-50 to-blue-100">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold flex items-center space-x-2">
                <Shield className="h-6 w-6 text-blue-600" />
                <span>Admin Panel</span>
              </h2>
              <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">×</button>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setActiveTab('users')}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${activeTab === 'users' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
              >
                <User className="inline h-4 w-4 mr-2" />
                User Management
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <UserManagementContent showNotification={showNotification} showConfirm={showConfirm} />
          </div>
        </div>
      </div>
      {notification && <Notification message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
      {confirmDialog && <ConfirmDialog message={confirmDialog.message} onConfirm={confirmDialog.onConfirm} onCancel={confirmDialog.onCancel} />}
    </>
  );
};

// Google Sign-In Component
const GoogleSignInButton = ({ onSuccess, onError, disabled }) => {
  const handleCredentialResponse = React.useCallback(async (response) => {
    try {
      if (response.credential) await onSuccess(response.credential);
    } catch (error) {
      onError(error.message || 'Google login failed');
    }
  }, [onSuccess, onError]);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    document.body.appendChild(script);

    script.onload = () => {
      if (window.google && GOOGLE_CLIENT_ID) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleCredentialResponse,
        });
        const btn = document.getElementById('googleSignInButton');
        if (btn) {
          window.google.accounts.id.renderButton(btn, {
            theme: 'filled_blue',
            size: 'large',
            width: btn.offsetWidth || 328,
            text: 'signin_with'
          });
        }
      }
    };
    return () => document.body.contains(script) && document.body.removeChild(script);
  }, [handleCredentialResponse]);

  return <div id="googleSignInButton" className={disabled ? 'opacity-50 pointer-events-none' : ''} />;
};

// Login Screen
const GoogleLoginScreen = () => {
  const { login, googleLogin } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleTraditionalLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const result = await login({ username, password });
      if (!result.success) setError(result.error || 'Login failed');
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
        setError(result.error?.includes('not registered') ? 'Account not registered. Please sign up first.' : result.error || 'Google login failed');
      }
    } catch (err) {
      setError(err.message || 'Google login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full mb-4">
              <Brain className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold mb-2">AI Lottery Predictor</h1>
            <p className="text-gray-600">Sign in to continue</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-3">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {GOOGLE_CLIENT_ID && (
            <>
              <div className="mb-6">
                <GoogleSignInButton onSuccess={handleGoogleSuccess} onError={setError} disabled={isLoading} />
              </div>
              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-300"></div></div>
                <div className="relative flex justify-center text-sm"><span className="px-4 bg-white text-gray-500">Or continue with</span></div>
              </div>
            </>
          )}

          <form onSubmit={handleTraditionalLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <User className="inline h-4 w-4 mr-1" />Username
              </label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="Enter username" required disabled={isLoading} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Lock className="inline h-4 w-4 mr-1" />Password
              </label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="Enter password" required disabled={isLoading} />
            </div>
            <button type="submit" disabled={isLoading}
              className="w-full py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-semibold hover:shadow-lg hover:scale-105 transition-all disabled:opacity-50 flex items-center justify-center space-x-2">
              {isLoading ? <><LoadingSpinner size="sm" /><span>Signing in...</span></> : <><Shield className="h-5 w-5" /><span>Sign In</span></>}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-gray-500 border-t pt-4">Demo: admin / admin123</p>
        </div>
        <p className="mt-4 text-center text-sm text-gray-500">Powered by AI</p>
      </div>
    </div>
  );
};

// User Menu
const UserMenu = () => {
  const { user, isAuthenticated, isAdmin, isGoogleUser, logout } = useAuth();
  const [showAdmin, setShowAdmin] = useState(false);

  if (!isAuthenticated) return null;

  return (
    <>
      <div className="flex items-center space-x-4">
        {isAdmin && !isGoogleUser && (
          <button onClick={() => setShowAdmin(true)} className="flex items-center space-x-2 px-3 py-1 bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 hover:scale-105 transition-all">
            <Shield className="h-4 w-4" /><span className="text-sm">Admin Panel</span>
          </button>
        )}
        <div className="flex items-center space-x-2 px-3 py-1 bg-blue-100 rounded-full">
          <User className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-medium text-blue-800">{user.username || user.email}</span>
        </div>
        <button onClick={logout} className="flex items-center space-x-2 px-3 py-1 bg-red-100 text-red-700 rounded-full hover:bg-red-200 hover:scale-105 transition-all">
          <LogOut className="h-4 w-4" /><span className="text-sm">Logout</span>
        </button>
      </div>
      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
    </>
  );
};

// Mock Data Generators
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
  const prediction = { numbers, confidence: 0.4 + Math.random() * 0.4, timestamp: new Date().toISOString() };
  if (info.hasBonus) {
    let bonus;
    do { bonus = Math.floor(Math.random() * info.maxNumbers) + 1; } while (numbers.includes(bonus));
    prediction.bonus = bonus;
  }
  return prediction;
};

const generateMockAutomation = (gameType, multiplier) => {
  const gameInfo = {
    '539': { maxNumbers: 39, numberCount: 8 },
    'mark6': { maxNumbers: 49, numberCount: 6 },
    'lotto649': { maxNumbers: 49, numberCount: 6 }
  };
  const info = gameInfo[gameType];
  const frequencyMap = {};
  for (let i = 1; i <= info.maxNumbers; i++) frequencyMap[i] = 0;
  
  for (let i = 0; i < multiplier; i++) {
    const numbers = [];
    while (numbers.length < info.numberCount) {
      const num = Math.floor(Math.random() * info.maxNumbers) + 1;
      if (!numbers.includes(num)) numbers.push(num);
    }
    numbers.forEach(num => frequencyMap[num]++);
  }

  const sortedByFrequency = Object.entries(frequencyMap)
    .map(([num, freq]) => ({ number: parseInt(num), frequency: freq }))
    .sort((a, b) => b.frequency - a.frequency);
  const topNumbers = sortedByFrequency.slice(0, info.numberCount).map(item => item.number).sort((a, b) => a - b);
  
  const result = { topNumbers, iterations: multiplier, frequencyData: sortedByFrequency };
  if (gameType === 'mark6' || gameType === 'lotto649') {
    const bonusCandidate = sortedByFrequency.find(item => !topNumbers.includes(item.number));
    if (bonusCandidate) result.bonus = bonusCandidate.number;
  }
  return result;
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
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">{results.iterations} iterations</span>
        </div>
        <button onClick={onClear} className="text-gray-500 hover:text-gray-700 text-xl">×</button>
      </div>
      <div className="mb-4">
        <p className="text-sm text-blue-700 mb-3 font-medium">Top Numbers from {results.iterations} iterations:</p>
        <div className="flex flex-wrap gap-2 justify-center">
          {results.topNumbers.map((number, index) => (
            <NumberBall key={`auto-${number}-${index}`} number={number} size="lg" delay={index * 100} colorScheme="red" />
          ))}
        </div>
        {results.bonus && (
          <div className="mt-4">
            <p className="text-sm text-blue-700 mb-2 font-medium">Bonus Number:</p>
            <div className="flex justify-center"><NumberBall number={results.bonus} isBonus={true} size="xl" /></div>
          </div>
        )}
      </div>
    </div>
  );
};

// Main App
function App() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [selectedGame, setSelectedGame] = useState(null);
  const [predictions, setPredictions] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedMultipliers, setSelectedMultipliers] = useState({ '539': 1, 'mark6': 1, 'lotto649': 1 });
  const [automationResults, setAutomationResults] = useState({});
  const [isAutomationRunning, setIsAutomationRunning] = useState(false);

  if (!isAuthenticated && !authLoading) return <GoogleLoginScreen />;
  if (authLoading) return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
      <div className="text-center">
        <LoadingSpinner size="lg" />
        <p className="text-gray-600 mt-4">Loading...</p>
      </div>
    </div>
  );

  const handlePredict = async (gameType) => {
    setIsLoading(true);
    setError(null);
    try {
      let result;
      try {
        const apiResult = await api.predict(gameType, '1month');
        result = apiResult.success ? apiResult.prediction : generateMockPrediction(gameType);
      } catch {
        result = generateMockPrediction(gameType);
      }
      const maxNumber = gameType === '539' ? 39 : 49;
      if (result?.numbers) {
        result.numbers = result.numbers.map(num => {
          const validNum = parseInt(num);
          return (isNaN(validNum) || validNum < 1 || validNum > maxNumber) ? Math.floor(Math.random() * maxNumber) + 1 : validNum;
        }).sort((a, b) => a - b);
        if (result.bonus) {
          const bonusNum = parseInt(result.bonus);
          result.bonus = (isNaN(bonusNum) || bonusNum < 1 || bonusNum > maxNumber) ? Math.floor(Math.random() * maxNumber) + 1 : bonusNum;
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
      const result = await api.automation(gameType, '1month', multiplier);
      if (result.success) {
        let finalTopNumbers = [...(result.topNumbers || [])];
        const maxNumber = gameType === '539' ? 39 : 49;
        const desiredCount = 8;
        while (finalTopNumbers.length < desiredCount) {
          const randomNum = Math.floor(Math.random() * maxNumber) + 1;
          if (!finalTopNumbers.includes(randomNum)) finalTopNumbers.push(randomNum);
        }
        finalTopNumbers = finalTopNumbers.slice(0, desiredCount).sort((a, b) => a - b);
        setAutomationResults(prev => ({ 
          ...prev, 
          [gameType]: {
            topNumbers: finalTopNumbers,
            iterations: result.totalIterations || result.iterations,
            frequencyData: result.frequencyData
          }
        }));
      } else {
        setAutomationResults(prev => ({ ...prev, [gameType]: generateMockAutomation(gameType, multiplier) }));
      }
    } catch {
      setAutomationResults(prev => ({ ...prev, [gameType]: generateMockAutomation(gameType, selectedMultipliers[gameType]) }));
    } finally {
      setIsAutomationRunning(false);
    }
  };

  const gameInfo = {
    '539': { title: '539 Lottery', description: 'Pick 8 numbers from 1-39', icon: '🎲', color: 'from-blue-500 to-blue-600' },
    'mark6': { title: 'Mark 6', description: 'Pick 6 numbers + bonus from 1-49', icon: '🎯', color: 'from-blue-500 to-blue-600' },
    'lotto649': { title: 'Lotto 649', description: 'Pick 6 numbers + bonus from 1-49', icon: '💎', color: 'from-blue-500 to-blue-600' }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-blue-100 to-blue-50">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-10">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <Brain className="h-10 w-10 text-blue-600" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">AI Lottery Predictor</h1>
          </div>
          <p className="text-gray-600">Advanced AI-Powered Predictions</p>
          <div className="flex items-center justify-center space-x-4 mt-4">
            <div className="inline-flex items-center space-x-2 px-4 py-2 bg-green-100 text-green-800 rounded-full">
              <CheckCircle2 className="h-4 w-4" /><span className="text-sm">AI Active</span>
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
            <div key={gameType} className={`p-6 rounded-xl cursor-pointer transition-all duration-300 ${selectedGame === gameType ? 'bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300 shadow-lg' : 'bg-white hover:bg-gray-50 shadow-md hover:shadow-lg'}`}
              onClick={() => setSelectedGame(gameType)}>
              <div className="text-center mb-4">
                <div className="text-4xl mb-2">{info.icon}</div>
                <h3 className="text-xl font-bold text-gray-800">{info.title}</h3>
                <p className="text-gray-600 text-sm">{info.description}</p>
              </div>

              {selectedGame === gameType && (
                <div className="space-y-4">
                  <button onClick={(e) => { e.stopPropagation(); handlePredict(gameType); }} disabled={isLoading}
                    className={`w-full py-3 px-4 bg-gradient-to-r ${info.color} text-white rounded-lg font-semibold hover:shadow-lg hover:scale-105 transition-all disabled:opacity-50 flex items-center justify-center space-x-2`}>
                    {isLoading ? <><LoadingSpinner size="sm" /><span>Generating...</span></> : <><TrendingUp size={20} /><span>Generate Prediction</span></>}
                  </button>

                  <button onClick={(e) => { e.stopPropagation(); handleRunAutomation(gameType); }} disabled={isLoading || isAutomationRunning}
                    className="w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-semibold hover:shadow-lg hover:scale-105 transition-all disabled:opacity-50 flex items-center justify-center space-x-2">
                    {isAutomationRunning ? <><LoadingSpinner size="sm" /><span>Running...</span></> : <><Zap size={18} /><span>Run Automation ({MULTIPLIER_OPTIONS.find(opt => opt.value === selectedMultipliers[gameType])?.label})</span></>}
                  </button>

                  {automationResults[gameType] && <AutomationResults results={automationResults[gameType]} onClear={() => setAutomationResults(prev => ({ ...prev, [gameType]: null }))} />}

                  {predictions[gameType] && (
                    <div className="space-y-4">
                      <div className="text-center">
                        <h4 className="font-semibold text-gray-700 mb-3">Predicted Numbers</h4>
                        <div className="mb-4">
                          <div className="flex flex-wrap justify-center gap-2">
                            {predictions[gameType].numbers?.map((number, index) => (
                              <NumberBall key={`${gameType}-${number}-${index}`} number={number} delay={index * 100} size="lg" />
                            ))}
                          </div>
                        </div>
                        {predictions[gameType].bonus && (
                          <div className="mb-4">
                            <p className="text-sm text-gray-600 mb-2">Bonus</p>
                            <div className="flex justify-center"><NumberBall number={predictions[gameType].bonus} isBonus={true} size="xl" /></div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <footer className="text-center py-6 text-gray-600 text-sm">
          <div className="flex items-center justify-center space-x-2">
            <Activity className="h-4 w-4" />
            <span>Powered by AI Algorithms</span>
          </div>
        </footer>
      </div>
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