// test-nowpayments.js - Test your configuration
require('dotenv').config();
const NowPaymentsService = require('./services/nowpaymentsService');

async function testNowPayments() {
  console.log('🧪 Testing NowPayments Configuration...\n');
  
  // Check environment variables
  console.log('📋 Environment Variables Check:');
  console.log('   NOWPAYMENTS_API_KEY exists:', !!process.env.NOWPAYMENTS_API_KEY);
  console.log('   NOWPAYMENTS_SANDBOX:', process.env.NOWPAYMENTS_SANDBOX);
  console.log('   NOWPAYMENTS_IPN_SECRET exists:', !!process.env.NOWPAYMENTS_IPN_SECRET);
  console.log('   FRONTEND_URL:', process.env.FRONTEND_URL);
  console.log('   BASE_URL:', process.env.BASE_URL);
  
  if (!process.env.NOWPAYMENTS_API_KEY) {
    console.log('\n❌ ERROR: NOWPAYMENTS_API_KEY is missing from .env file');
    console.log('   Please add: NOWPAYMENTS_API_KEY=your_api_key_here');
    console.log('   Current .env keys:', Object.keys(process.env).filter(key => key.includes('NOW')));
    return;
  }
  
  // Test the service
  const nowPayments = new NowPaymentsService();
  
  if (!nowPayments.isConfigured()) {
    console.log('\n❌ NowPayments service is not configured properly');
    return;
  }
  
  console.log('\n🔗 Testing API Connection...');
  try {
    const result = await nowPayments.testConnection();
    console.log('✅ Connection Test Result:', result);
  } catch (error) {
    console.log('❌ Connection Failed:', error.message);
  }
}

testNowPayments();