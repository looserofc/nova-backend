const axios = require('axios');

const API_BASE = 'http://localhost:5000';

async function testEndpoints() {
  console.log('Testing API endpoints...');
  
  const endpoints = [
    '/admin/stats',
    '/admin/users', 
    '/admin/withdrawals',
    '/auth/login',
    '/auth/register'
  ];
  
  for (const endpoint of endpoints) {
    try {
      const response = await axios.get(API_BASE + endpoint);
      console.log(`✅ ${endpoint}: ${response.status}`);
    } catch (error) {
      if (error.response) {
        console.log(`❌ ${endpoint}: ${error.response.status} - ${error.response.statusText}`);
      } else {
        console.log(`❌ ${endpoint}: ${error.message}`);
      }
    }
  }
}

testEndpoints();