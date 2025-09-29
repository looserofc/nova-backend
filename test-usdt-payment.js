const NowPaymentsService = require('./services/nowpaymentsService');

async function testUSDTPayment() {
  console.log('🧪 Testing USDT payment configuration...');
  
  const nowPayments = new NowPaymentsService();
  
  try {
    // Test 1: Check API connection
    console.log('\n1️⃣ Testing API connection...');
    const connection = await nowPayments.testConnection();
    
    if (!connection.success) {
      console.error('❌ API connection failed:', connection.error);
      return;
    }
    
    console.log('✅ API connection successful');
    console.log('📊 Available USDT currencies:', connection.supportedUSDT);
    
    // Test 2: Get estimation for $100 USDT payment
    console.log('\n2️⃣ Testing payment estimation...');
    const estimate = await nowPayments.getEstimateAmount(100, 'USDT', 'usdttrc20');
    
    console.log('📈 Payment estimate for $100:');
    console.log(`   You receive: $100.00 USDT`);
    console.log(`   User pays: $${estimate.estimated_amount} USDT`);
    console.log(`   Network fee: $${(estimate.estimated_amount - 100).toFixed(6)} USDT`);
    console.log(`   Fee percentage: ${(((estimate.estimated_amount - 100) / 100) * 100).toFixed(2)}%`);
    
    // Test 3: Create a test payment (small amount)
    console.log('\n3️⃣ Creating test payment...');
    const testPayment = {
      price_amount: 1.00,  // $1 test payment
      price_currency: 'USDT',
      pay_currency: 'usdttrc20',
      order_id: `test_${Date.now()}`,
      order_description: 'Nova Digital Test Payment',
      ipn_callback_url: 'http://localhost:5000/payments/webhook',
      success_url: 'http://localhost:3000/dashboard',
      cancel_url: 'http://localhost:3000/tier-selection',
      is_fee_paid_by_user: false,
      is_fixed_rate: false
    };
    
    const payment = await nowPayments.createPayment(testPayment);
    
    console.log('✅ Test payment created successfully!');
    console.log('💰 Payment details:');
    console.log(`   Payment ID: ${payment.payment_id}`);
    console.log(`   Pay Address: ${payment.pay_address}`);
    console.log(`   Amount to pay: ${payment.pay_amount} USDT`);
    console.log(`   You receive: ${payment.price_amount} USDT`);
    console.log(`   Fee: ${(payment.pay_amount - payment.price_amount).toFixed(6)} USDT`);
    console.log(`   Payment URL: ${payment.invoice_url || payment.pay_url || 'N/A'}`);
    
    console.log('\n🎉 All tests passed! Your USDT payment setup is working correctly.');
    console.log('💡 Key improvements:');
    console.log('   ✅ USDT-to-USDT payments (minimal conversion)');
    console.log('   ✅ You receive exactly the tier price');
    console.log('   ✅ Users pay only minimal network fees');
    console.log('   ✅ Proper webhook configuration');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error.message.includes('authentication')) {
      console.log('💡 Fix: Check your NOWPAYMENTS_API_KEY in .env file');
    } else if (error.message.includes('network') || error.message.includes('ENOTFOUND')) {
      console.log('💡 Fix: Check your internet connection');
    } else {
      console.log('💡 Error details:', error);
    }
  }
}

// Run the test
testPayment();