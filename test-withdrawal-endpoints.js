// test-withdrawal-endpoints.js
const axios = require('axios');

const API_BASE = 'http://localhost:5000';

async function testWithdrawalEndpoints() {
  console.log('=== TESTING WITHDRAWAL ENDPOINTS ===\n');
  
  // Test endpoints without authentication (should return 401)
  const endpoints = [
    { method: 'GET', path: '/withdraw/address', description: 'Get withdrawal address' },
    { method: 'POST', path: '/withdraw/address', description: 'Set withdrawal address' },
    { method: 'POST', path: '/withdraw', description: 'Submit withdrawal request' },
    { method: 'GET', path: '/withdraw/history', description: 'Get withdrawal history' },
    { method: 'GET', path: '/withdraw/stats', description: 'Get withdrawal stats' }
  ];
  
  for (const endpoint of endpoints) {
    try {
      let response;
      if (endpoint.method === 'GET') {
        response = await axios.get(API_BASE + endpoint.path);
      } else {
        response = await axios.post(API_BASE + endpoint.path, {});
      }
      console.log(`✅ ${endpoint.method} ${endpoint.path}: ${response.status} - ${endpoint.description}`);
    } catch (error) {
      if (error.response) {
        console.log(`🔒 ${endpoint.method} ${endpoint.path}: ${error.response.status} - ${endpoint.description} (${error.response.statusText})`);
      } else {
        console.log(`❌ ${endpoint.method} ${endpoint.path}: ${error.message} - ${endpoint.description}`);
      }
    }
  }
  
  console.log('\n=== TEST NOTES ===');
  console.log('- Status 401 (Unauthorized) is expected for withdrawal endpoints without authentication');
  console.log('- Status 404 means the endpoint is not found (this is the problem we fixed)');
  console.log('- If you see 404 errors, make sure you updated routes/withdraw.js and restarted the server');
  
  // Test basic health check
  try {
    const health = await axios.get(API_BASE + '/health');
    console.log(`\n✅ Server health check: ${health.status} - ${health.data.status}`);
  } catch (error) {
    console.log(`\n❌ Server health check failed: ${error.message}`);
  }
}

testWithdrawalEndpoints();