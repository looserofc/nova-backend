const express = require('express');
const NowPaymentsService = require('./services/nowpaymentsService');

async function setupWebhook() {
  console.log('🔗 Setting up NowPayments webhook...');
  
  const nowPayments = new NowPaymentsService();
  
  try {
    // Your webhook URL should be publicly accessible
    // For development, use ngrok: https://ngrok.com/
    const webhookUrl = process.env.WEBHOOK_URL || 'http://localhost:5000/payments/webhook';
    
    console.log(`📡 Webhook URL: ${webhookUrl}`);
    console.log('');
    console.log('⚠️  IMPORTANT: For production, your webhook URL must be:');
    console.log('   1. Publicly accessible (not localhost)');
    console.log('   2. Use HTTPS');
    console.log('   3. Respond with 200 OK status');
    console.log('');
    console.log('🔧 For development testing, use ngrok:');
    console.log('   1. Install: npm install -g ngrok');
    console.log('   2. Run: ngrok http 5000');
    console.log('   3. Update WEBHOOK_URL in .env with ngrok URL');
    console.log('');
    console.log('✅ Webhook endpoint ready at: POST /payments/webhook');
    
  } catch (error) {
    console.error('❌ Webhook setup error:', error.message);
  }
}

setupWebhook();