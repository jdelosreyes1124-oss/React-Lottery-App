import axios from 'axios';
const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";


// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30 second timeout 
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor 
api.interceptors.request.use(
  (config) => {
    console.log(`🔄 API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('❌ API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    console.log(`✅ API Response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error('❌ API Response Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// API service functions
export const lotteryAPI = {
  // Prediction endpoints
  predict539: () => api.post('/predictions/539'),
  predictMark6: () => api.post('/predictions/mark6'),
  predictLotto649: () => api.post('/predictions/lotto649'),
  
  // Status and info endpoints
  getStatus: () => api.get('/predictions/status'),
  getAnalysis: (gameType) => api.get(`/predictions/analysis/${gameType}`),
  getHealth: () => api.get('/health')
};

// Utility functions
export const predictNumbers = async (gameType) => {
  try {
    let response;
    
    switch (gameType) {
      case '539':
        response = await lotteryAPI.predict539();
        break;
      case 'mark6':
        response = await lotteryAPI.predictMark6();
        break;
      case 'lotto649':
        response = await lotteryAPI.predictLotto649();
        break;
      default:
        throw new Error(`Unsupported game type: ${gameType}`);
    }
    
    return response.data;
  } catch (error) {
    const message = error.response?.data?.message || error.message || 'Prediction failed';
    throw new Error(message);
  }
};

export const getAIStatus = async () => {
  try {
    const response = await lotteryAPI.getStatus();
    return response.data;
  } catch (error) {
    throw new Error('Failed to get AI status');
  }
};

export const getGameAnalysis = async (gameType) => {
  try {
    const response = await lotteryAPI.getAnalysis(gameType);
    return response.data;
  } catch (error) {
    throw new Error(`Failed to get analysis for ${gameType}`);
  }
};

export default api;
export const adminAPI = {
  login: (username, password) => api.post('/admin/login', { username, password }),
  excelInfo: () => api.get('/admin/excel-info'),
  uploadExcel: (formData) =>
    api.post('/admin/upload-excel', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
};