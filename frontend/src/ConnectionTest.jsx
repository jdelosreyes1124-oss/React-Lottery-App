import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, XCircle, Wifi, Database, Shield, RefreshCw } from 'lucide-react';

// Connection Test Component for debugging API issues
const ConnectionTest = () => {
  const [tests, setTests] = useState({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  // Get API URL from environment or fallback
  const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://lottery-backend-tdqv.onrender.com/api';

  const runTests = async () => {
    setLoading(true);
    const results = {};

    // Test 1: Environment check
    results.environment = {
      name: 'Environment Variables',
      status: process.env.REACT_APP_API_URL ? 'success' : 'warning',
      message: process.env.REACT_APP_API_URL 
        ? `API URL: ${API_BASE_URL}` 
        : `Using fallback URL: ${API_BASE_URL}`,
      details: {
        'REACT_APP_API_URL': process.env.REACT_APP_API_URL || 'Not set',
        'NODE_ENV': process.env.NODE_ENV,
        'Fallback URL': 'https://lottery-backend-tdqv.onrender.com/api'
      }
    };

    // Test 2: Basic connectivity
    try {
      const startTime = Date.now();
      const response = await fetch(`${API_BASE_URL}/health`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      const responseTime = Date.now() - startTime;

      if (response.ok) {
        const data = await response.json();
        results.health = {
          name: 'Backend Health Check',
          status: 'success',
          message: `Connected (${responseTime}ms)`,
          details: {
            'Database': data.database || 'Unknown',
            'Collections': data.collections || 0,
            'Version': data.version || 'Unknown',
            'Response Time': `${responseTime}ms`
          }
        };
      } else {
        results.health = {
          name: 'Backend Health Check',
          status: 'error',
          message: `HTTP ${response.status} - ${response.statusText}`,
          details: {
            'Status Code': response.status,
            'Status Text': response.statusText,
            'Response Time': `${responseTime}ms`
          }
        };
      }
    } catch (error) {
      results.health = {
        name: 'Backend Health Check',
        status: 'error',
        message: error.message,
        details: {
          'Error Type': error.name,
          'Error Message': error.message,
          'Possible Cause': 'Backend not running or network issue'
        }
      };
    }

    // Test 3: CORS headers check
    try {
      const response = await fetch(`${API_BASE_URL}/health`, {
        method: 'OPTIONS',
        headers: {
          'Origin': window.location.origin,
          'Access-Control-Request-Method': 'GET'
        }
      });

      const corsHeaders = {
        'Access-Control-Allow-Origin': response.headers.get('access-control-allow-origin'),
        'Access-Control-Allow-Credentials': response.headers.get('access-control-allow-credentials'),
        'Access-Control-Allow-Methods': response.headers.get('access-control-allow-methods')
      };

      results.cors = {
        name: 'CORS Configuration',
        status: corsHeaders['Access-Control-Allow-Origin'] ? 'success' : 'warning',
        message: corsHeaders['Access-Control-Allow-Origin'] 
          ? 'CORS properly configured' 
          : 'CORS headers might be missing',
        details: corsHeaders
      };
    } catch (error) {
      results.cors = {
        name: 'CORS Configuration',
        status: 'error',
        message: 'Could not check CORS headers',
        details: {
          'Error': error.message,
          'Current Origin': window.location.origin
        }
      };
    }

    // Test 4: Authentication check
    try {
      const response = await fetch(`${API_BASE_URL}/auth/verify`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });

      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        results.auth = {
          name: 'Authentication Status',
          status: data.authenticated ? 'success' : 'info',
          message: data.authenticated 
            ? `Logged in as: ${data.user?.username || 'Unknown'}` 
            : 'Not authenticated',
          details: {
            'Authenticated': data.authenticated || false,
            'Username': data.user?.username || 'N/A',
            'Role': data.user?.role || 'N/A',
            'Session Cookie': document.cookie.includes('connect.sid') ? 'Present' : 'Missing'
          }
        };
      } else {
        results.auth = {
          name: 'Authentication Status',
          status: 'error',
          message: `Received ${contentType} instead of JSON`,
          details: {
            'Content-Type': contentType,
            'Status': response.status,
            'Issue': 'Backend returning HTML instead of JSON'
          }
        };
      }
    } catch (error) {
      results.auth = {
        name: 'Authentication Status',
        status: 'error',
        message: error.message,
        details: {
          'Error': error.message,
          'Credentials': 'include mode active',
          'Cookies': document.cookie ? 'Some cookies present' : 'No cookies'
        }
      };
    }

    // Test 5: Admin endpoint check (if authenticated as admin)
    try {
      const response = await fetch(`${API_BASE_URL}/admin/historical-results/539?limit=1`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });

      const contentType = response.headers.get('content-type');

      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        if (response.ok) {
          results.admin = {
            name: 'Admin Endpoints',
            status: 'success',
            message: 'Admin endpoints accessible',
            details: {
              'Endpoint': '/admin/historical-results/:gameType',
              'Data Retrieved': data.data ? `${data.data.length} records` : '0 records',
              'Success': data.success || false
            }
          };
        } else {
          results.admin = {
            name: 'Admin Endpoints',
            status: response.status === 401 ? 'info' : 'warning',
            message: data.error || `HTTP ${response.status}`,
            details: {
              'Status': response.status,
              'Error': data.error || 'Unknown error',
              'Message': data.message || 'No message'
            }
          };
        }
      } else {
        results.admin = {
          name: 'Admin Endpoints',
          status: 'error',
          message: 'Received HTML instead of JSON',
          details: {
            'Content-Type': contentType,
            'Status': response.status,
            'Issue': 'Endpoint returning HTML - might not exist'
          }
        };
      }
    } catch (error) {
      results.admin = {
        name: 'Admin Endpoints',
        status: 'error',
        message: error.message,
        details: {
          'Error': error.message,
          'Endpoint': '/admin/historical-results/539'
        }
      };
    }

    setTests(results);
    setLoading(false);
  };

  useEffect(() => {
    runTests();
  }, []);

  const getStatusIcon = (status) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'info':
        return <AlertCircle className="w-5 h-5 text-blue-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'success': return 'border-green-500 bg-green-50';
      case 'warning': return 'border-yellow-500 bg-yellow-50';
      case 'error': return 'border-red-500 bg-red-50';
      case 'info': return 'border-blue-500 bg-blue-50';
      default: return 'border-gray-500 bg-gray-50';
    }
  };

  return (
    <div className="fixed bottom-4 right-4 max-w-md z-50">
      <div className="bg-white rounded-lg shadow-xl border-2 border-gray-200">
        {/* Header */}
        <div 
          className="p-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-t-lg cursor-pointer flex items-center justify-between"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center space-x-2">
            <Wifi className="w-5 h-5" />
            <span className="font-semibold">API Connection Test</span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                runTests();
              }}
              className="p-1 hover:bg-white hover:bg-opacity-20 rounded"
              title="Refresh tests"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <span className="text-sm">{expanded ? '−' : '+'}</span>
          </div>
        </div>

        {/* Content */}
        {expanded && (
          <div className="p-4 max-h-96 overflow-y-auto">
            {loading ? (
              <div className="text-center py-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                <p className="mt-2 text-sm text-gray-600">Running connection tests...</p>
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(tests).map(([key, test]) => (
                  <div 
                    key={key} 
                    className={`border-l-4 p-3 rounded ${getStatusColor(test.status)}`}
                  >
                    <div className="flex items-start space-x-2">
                      {getStatusIcon(test.status)}
                      <div className="flex-1">
                        <div className="font-semibold text-sm">{test.name}</div>
                        <div className="text-xs text-gray-700 mt-1">{test.message}</div>
                        {test.details && (
                          <div className="mt-2 text-xs bg-white bg-opacity-70 p-2 rounded">
                            {Object.entries(test.details).map(([detailKey, value]) => (
                              <div key={detailKey} className="flex justify-between py-0.5">
                                <span className="text-gray-600">{detailKey}:</span>
                                <span className="font-mono text-gray-800 ml-2">
                                  {String(value) || 'null'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Summary */}
                <div className="mt-4 pt-3 border-t border-gray-200">
                  <div className="text-xs text-gray-600">
                    <div className="flex justify-between mb-1">
                      <span>Tests Run:</span>
                      <span>{Object.keys(tests).length}</span>
                    </div>
                    <div className="flex justify-between mb-1">
                      <span>Successful:</span>
                      <span className="text-green-600">
                        {Object.values(tests).filter(t => t.status === 'success').length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Failed:</span>
                      <span className="text-red-600">
                        {Object.values(tests).filter(t => t.status === 'error').length}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="text-xs text-gray-600 space-y-1">
                    <div>👉 Check browser console for detailed logs</div>
                    <div>👉 Verify backend is deployed on Render</div>
                    <div>👉 Ensure REACT_APP_API_URL is set in Vercel</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ConnectionTest;