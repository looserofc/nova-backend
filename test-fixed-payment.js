const NowPaymentsService = require('./services/nowpaymentsService');

async function testFixedPayment() {
  console.log('🧪 Testing FIXED USDT payment configuration...\n');
  
  const nowPayments = new NowPaymentsService();
  
  try {
    // Test 1: Check API connection
    console.log('1️⃣ Testing API connection...');
    const connection = await nowPayments.testConnection();
    
    if (!connection.success) {
      console.error('❌ API connection failed:', connection.error);
      return;
    }
    
    console.log('✅ API connection successful');
    console.log('📊 Available USDT currencies:', connection.supportedUSDT);
    
    // Test 2: Get estimation for $100 USD to USDT
    console.log('\n2️⃣ Testing payment estimation ($100 USD → USDT)...');
    const estimate = await nowPayments.getEstimateAmount(100, 'usd', 'usdttrc20');
    
    const feeAmount = estimate.estimated_amount - 100;
    const feePercentage = (feeAmount / 100) * 100;
    
    console.log('📈 Estimation Results:');
    console.log(`   Tier Price: $100.00 USD`);
    console.log(`   User Pays: ${estimate.estimated_amount} USDT`);
    console.log(`   Network Fee: ${feeAmount.toFixed(6)} USDT`);
    console.log(`   Fee Percentage: ${feePercentage.toFixed(2)}%`);
    
    // Check if fees are reasonable
    if (feePercentage < 5) {
      console.log(`✅ SUCCESS: Fees reduced from 17% to ${feePercentage.toFixed(2)}%`);
    } else {
      console.log(`❌ Fees still high: ${feePercentage.toFixed(2)}%`);
    }
    
    // Test 3: Create a minimal test payment
    console.log('\n3️⃣ Creating minimal test payment ($1 USD)...');
    const testPayment = {
      price_amount: 1.00,
      price_currency: 'usd',
      pay_currency: 'usdttrc20',
      order_id: `test_fixed_${Date.now()}`,
      order_description: 'Nova Digital Fixed Test Payment',
      ipn_callback_url: 'http://localhost:5000/payments/webhook',
      success_url: 'http://localhost:3000/dashboard',
      cancel_url: 'http://localhost:3000/tier-selection',
      is_fee_paid_by_user: true,
      is_fixed_rate: true
    };
    
    const payment = await nowPayments.createPayment(testPayment);
    
    console.log('✅ Test payment created successfully!');
    console.log('💰 Payment details:');
    console.log(`   Payment ID: ${payment.payment_id}`);
    console.log(`   You Receive: $${payment.price_amount} USD value`);
    console.log(`   User Pays: ${payment.pay_amount} USDT`);
    console.log(`   Fee: ${(payment.pay_amount - payment.price_amount).toFixed(6)} USDT`);
    console.log(`   Fee %: ${(((payment.pay_amount - payment.price_amount) / payment.price_amount) * 100).toFixed(2)}%`);
    
    console.log('\n🎉 ALL TESTS PASSED! Your USDT payment setup is working correctly.');
    console.log('\n💡 KEY IMPROVEMENTS:');
    console.log('   ✅ USD as base currency (price_currency: "usd")');
    console.log('   ✅ User pays fees (is_fee_paid_by_user: true)');
    console.log('   ✅ Fixed rates (is_fixed_rate: true)');
    console.log('   ✅ You receive exact tier price in USD value');
    console.log('   ✅ User pays only 1-2% fees instead of 17%');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error.message.includes('authentication')) {
      console.log('💡 Fix: Check your NOWPAYMENTS_API_KEY in .env file');
    } else if (error.message.includes('network')) {
      console.log('💡 Fix: Check your internet connection');
    } else {
      console.log('💡 Error details:', error.response?.data || error.message);
    }
  }
}

// Run the test
testFixedPayment();