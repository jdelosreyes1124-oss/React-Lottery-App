require('dotenv').config();
const axios = require('axios');

const baseURL = 'http://localhost:5000/api';

async function testBackend() {
  console.log('🧪 Testing Backend API...\n');
  
  try {
    // Create session for cookies
    const agent = axios.create({
      baseURL,
      withCredentials: true,
      headers: { 'Content-Type': 'application/json' }
    });
    
    // 1. Test health
    console.log('1. Health Check');
    const health = await agent.get('/health');
    console.log('   ✓ Database:', health.data.database);
    console.log('   ✓ Total Results:', health.data.documents?.lottery_results || 0);
    
    // 2. Test login
    console.log('\n2. Authentication');
    const login = await agent.post('/auth/login', {
      username: 'admin',
      password: 'Admin123!'
    });
    console.log('   ✓ Login successful');
    console.log('   ✓ User role:', login.data.user.role);
    
    // Save cookie for subsequent requests
    const cookies = login.headers['set-cookie'];
    if (cookies) {
      agent.defaults.headers.Cookie = cookies.join('; ');
    }
    
    // 3. Test admin access
    console.log('\n3. Admin Stats');
    const stats = await agent.get('/admin/stats');
    console.log('   ✓ Total Users:', stats.data.stats.totalUsers);
    console.log('   ✓ Total Results:', stats.data.stats.totalResults);
    
    // 4. Test predictions
    console.log('\n4. Predictions');
    const frequency = await agent.get('/predictions/frequency/539');
    console.log('   ✓ Draws analyzed:', frequency.data.analysis.totalDrawsAnalyzed);
    
    console.log('\n✅ All backend tests passed!');
    console.log('\n✅ Your backend is ready for frontend updates');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    console.log('\n⚠️  Fix any errors above before updating frontend');
  }
}

// Make sure your server is running first!
console.log('Make sure your server is running (npm start)');
console.log('Testing in 2 seconds...\n');

setTimeout(testBackend, 2000);