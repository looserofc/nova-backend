const axios = require('axios');
const crypto = require('crypto');

class NowPaymentsService {
  constructor() {
    this.apiKey = process.env.NOWPAYMENTS_API_KEY;
    this.webhookSecret = process.env.NOWPAYMENTS_WEBHOOK_SECRET;
    this.sandboxMode = process.env.NOWPAYMENTS_SANDBOX === 'true';
    
    // Use sandbox URL if in sandbox mode
    this.baseURL = this.sandboxMode 
      ? 'https://api.sandbox.nowpayments.io/v1'
      : 'https://api.nowpayments.io/v1';
    
    console.log(`NowPayments initialized: ${this.sandboxMode ? 'SANDBOX' : 'LIVE'} mode`);
    
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 second timeout
    });

    // Add request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        console.log('🔗 NowPayments Request:', {
          method: config.method.toUpperCase(),
          url: config.url,
          data: config.data ? JSON.stringify(config.data).substring(0, 500) : 'No data'
        });
        return config;
      },
      (error) => {
        console.error('❌ Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        console.log('✅ NowPayments Response:', {
          status: response.status,
          url: response.config.url,
          data: JSON.stringify(response.data).substring(0, 500)
        });
        return response;
      },
      (error) => {
        console.error('❌ Response Error:', {
          status: error.response?.status,
          url: error.config?.url,
          data: error.response?.data
        });
        return Promise.reject(error);
      }
    );
  }

  // Check if service is properly configured
  isConfigured() {
    return !!(this.apiKey);
  }

  // Get API status
  async getStatus() {
    try {
      const response = await this.client.get('/status');
      return response.data;
    } catch (error) {
      console.error('NowPayments status error:', error.response?.data || error.message);
      throw new Error(`NowPayments status check failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // Get list of supported currencies
  async getCurrencies() {
    try {
      const response = await this.client.get('/currencies');
      return response.data.currencies || [];
    } catch (error) {
      console.error('NowPayments currencies error:', error.response?.data || error.message);
      throw new Error(`Failed to get currencies: ${error.response?.data?.message || error.message}`);
    }
  }

  // Create a payment (recommended method) - OPTIMIZED FOR DIRECT USDT
  async createPayment(paymentData) {
    try {
      console.log('🟢 Creating NowPayments payment:', paymentData);
      
      // Validate required fields
      const requiredFields = ['price_amount', 'price_currency', 'pay_currency', 'order_id'];
    for (const field of requiredFields) {
      if (!paymentData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

      // FIXED: Ensure same currency for price and payment to minimize fees
      const enhancedPaymentData = {
      price_amount: paymentData.price_amount,
      price_currency: paymentData.price_currency,
      pay_currency: paymentData.pay_currency,
      payout_currency: paymentData.payout_currency || paymentData.pay_currency,
      order_id: paymentData.order_id,
      order_description: paymentData.order_description,
      ipn_callback_url: paymentData.ipn_callback_url,
      success_url: paymentData.success_url,
      cancel_url: paymentData.cancel_url,
      is_fee_paid_by_user: paymentData.is_fee_paid_by_user !== false,
      is_fixed_rate: paymentData.is_fixed_rate !== false
      };
      // If paying in USDT, ensure price is also in USDT
      Object.keys(enhancedPaymentData).forEach(key => {
      if (enhancedPaymentData[key] === null || enhancedPaymentData[key] === undefined) {
        delete enhancedPaymentData[key];
      }
    });

    if (paymentData.pay_currency.toLowerCase().includes('usdt') && 
        !paymentData.price_currency.toLowerCase().includes('usdt')) {
      console.warn('⚠️ Converting from USD to USDT may incur conversion fees. Consider setting price_currency to USDT.');
    }

      // Log optimized payment configuration
       console.log('🟢 Optimized payment configuration:', {
      price_currency: enhancedPaymentData.price_currency,
      pay_currency: enhancedPaymentData.pay_currency,
      payout_currency: enhancedPaymentData.payout_currency,
      same_currency: enhancedPaymentData.price_currency === enhancedPaymentData.pay_currency,
      fees_paid_by_user: enhancedPaymentData.is_fee_paid_by_user,
      fixed_rate: enhancedPaymentData.is_fixed_rate
    });

      const response = await this.client.post('/payment', enhancedPaymentData);
      
      console.log('✅ NowPayments payment created successfully:', {
      payment_id: response.data.payment_id,
      payment_status: response.data.payment_status,
      price_amount: response.data.price_amount,
      price_currency: response.data.price_currency,
      pay_amount: response.data.pay_amount,
      pay_currency: response.data.pay_currency,
      payout_currency: response.data.payout_currency || 'Not specified',
      conversion_fee: response.data.price_currency === response.data.pay_currency ? 'MINIMAL' : 'STANDARD',
      estimated_fee_percentage: ((response.data.pay_amount - response.data.price_amount) / response.data.price_amount * 100).toFixed(2) + '%'
    });
      
      return response.data;
  } catch (error) {
    console.error('❌ NowPayments create payment error:', error.response?.data || error.message);
      
      // Provide specific error messages
      if (error.response?.status === 400) {
      const errorMsg = error.response.data?.message || 'Invalid payment data';
      throw new Error(`Payment creation failed: ${errorMsg}`);
    } else if (error.response?.status === 401) {
      throw new Error('Invalid API key - check your NowPayments configuration');
    } else if (error.response?.status === 403) {
      throw new Error('API key does not have required permissions');
    } else {
      throw new Error(`Payment creation failed: ${error.response?.data?.message || error.message}`);
      }
    }
  }

  // Get payment status with retry logic for 404 errors
  async getPaymentStatus(paymentId, maxRetries = 3, retryDelay = 2000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔍 Checking payment status (attempt ${attempt}/${maxRetries}):`, paymentId);
        
        const response = await this.client.get(`/payment/${paymentId}`);
        
        console.log('✅ Payment status retrieved successfully:', {
          payment_id: response.data.payment_id,
          status: response.data.payment_status
        });
        
        return response.data;
      } catch (error) {
        // Handle 404 errors with retry logic
        if (error.response?.status === 404 && attempt < maxRetries) {
          console.log(`⏳ Payment not found yet, retrying in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
        
        // For other errors or final attempt, throw the error
        console.error('NowPayments payment status error:', error.response?.data || error.message);
        
        if (error.response?.status === 404) {
          throw new Error(`Payment not found or not yet available: ${paymentId}`);
        } else {
          throw new Error(`Failed to get payment status: ${error.response?.data?.message || error.message}`);
        }
      }
    }
  }

  // Get estimate amount for currency conversion
  async getEstimateAmount(fromAmount, fromCurrency, toCurrency) {
    try {
      const response = await this.client.get('/estimate', {
        params: {
          amount: fromAmount,
          currency_from: fromCurrency.toLowerCase(),
          currency_to: toCurrency.toLowerCase()
        }
      });
      
      return {
        estimated_amount: response.data.estimated_amount,
        currency_from: response.data.currency_from,
        currency_to: response.data.currency_to,
        amount_from: fromAmount,
        conversion_rate: response.data.estimated_amount / fromAmount,
        fees_included: true
      };
    } catch (error) {
      console.error('NowPayments estimate error:', error.response?.data || error.message);
      throw new Error(`Failed to get estimate: ${error.response?.data?.message || error.message}`);
    }
  }

  // Get minimum payment amount for a currency
  async getMinimumAmount(fromCurrency, toCurrency) {
    try {
      const response = await this.client.get('/min-amount', {
        params: {
          currency_from: fromCurrency.toLowerCase(),
          currency_to: toCurrency.toLowerCase()
        }
      });
      return response.data;
    } catch (error) {
      console.error('NowPayments minimum amount error:', error.response?.data || error.message);
      throw new Error(`Failed to get minimum amount: ${error.response?.data?.message || error.message}`);
    }
  }

  // Verify webhook signature
  verifyWebhookSignature(body, signature) {
    try {
      if (!this.webhookSecret) {
        console.warn('⚠️ Webhook secret not configured, skipping signature verification');
        return true; // Allow webhook if no secret is configured
      }

      if (!signature) {
        console.warn('⚠️ No signature provided in webhook');
        return false;
      }

      // Create HMAC signature
      const hmac = crypto.createHmac('sha512', this.webhookSecret);
      hmac.update(body, 'utf8');
      const computedSignature = hmac.digest('hex');
      
      // Compare signatures
      const providedSignature = signature.replace('sha512=', '');
      const isValid = crypto.timingSafeEqual(
        Buffer.from(computedSignature, 'hex'),
        Buffer.from(providedSignature, 'hex')
      );
      
      if (!isValid) {
        console.error('❌ Webhook signature verification failed');
        return false;
      }
      
      console.log('✅ Webhook signature verified');
      return true;
      
    } catch (error) {
      console.error('❌ Webhook signature verification error:', error.message);
      return false;
    }
  }

  // Get list of payments (for admin)
  async getPaymentsList(limit = 10, page = 1) {
    try {
      const response = await this.client.get('/payment', {
        params: {
          limit,
          page,
          sortBy: 'created_at',
          orderBy: 'desc'
        }
      });
      return response.data;
    } catch (error) {
      console.error('NowPayments payments list error:', error.response?.data || error.message);
      throw new Error(`Failed to get payments list: ${error.response?.data?.message || error.message}`);
    }
  }

  // Get exchange rate
  async getExchangeRate(fromCurrency, toCurrency) {
    try {
      const response = await this.client.get('/exchange-rate', {
        params: {
          currency_from: fromCurrency.toLowerCase(),
          currency_to: toCurrency.toLowerCase()
        }
      });
      return response.data;
    } catch (error) {
      console.error('NowPayments exchange rate error:', error.response?.data || error.message);
      throw new Error(`Failed to get exchange rate: ${error.response?.data?.message || error.message}`);
    }
  }

  // Check if currency is available
  async isCurrencyAvailable(currency) {
    try {
      const currencies = await this.getCurrencies();
      return currencies.some(c => c.toLowerCase() === currency.toLowerCase());
    } catch (error) {
      console.error('Currency availability check error:', error.message);
      return false;
    }
  }

  // Validate payout address
  async validatePayoutAddress(currency, address) {
    try {
      const response = await this.client.post('/payout/validate-address', {
        currency: currency.toLowerCase(),
        address: address
      });
      return response.data;
    } catch (error) {
      console.error('Address validation error:', error.response?.data || error.message);
      return {
        valid: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  // Create payout (for automated withdrawals)
  async createPayout(payoutData) {
    try {
      console.log('🟢 Creating NowPayments payout:', payoutData);
      const response = await this.client.post('/payout', payoutData);
      return response.data;
    } catch (error) {
      console.error('❌ NowPayments payout error:', error.response?.data || error.message);
      throw new Error(`Payout creation failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // Get payout status
  async getPayoutStatus(payoutId) {
    try {
      const response = await this.client.get(`/payout/${payoutId}`);
      return response.data;
    } catch (error) {
      console.error('NowPayments payout status error:', error.response?.data || error.message);
      throw new Error(`Failed to get payout status: ${error.response?.data?.message || error.message}`);
    }
  }

  // Test API connection
  async testConnection() {
    try {
      console.log('🧪 Testing NowPayments API connection...');
      
      // Test basic API status
      const status = await this.getStatus();
      console.log('✅ API Status:', status.message);
      
      // Test currencies endpoint
      const currencies = await this.getCurrencies();
      console.log(`✅ Currencies available: ${currencies.length}`);
      
      // Check for USDT support
      const usdtSupported = currencies.some(c => c.toLowerCase().includes('usdt'));
      console.log(`✅ USDT supported: ${usdtSupported}`);
      
      return {
        success: true,
        status: status.message,
        currencies_count: currencies.length,
        usdt_supported: usdtSupported,
        mode: this.sandboxMode ? 'SANDBOX' : 'LIVE'
      };
    } catch (error) {
      console.error('❌ NowPayments connection test failed:', error.message);
      return {
        success: false,
        error: error.message,
        mode: this.sandboxMode ? 'SANDBOX' : 'LIVE'
      };
    }
  }

  // Format currency display name
  formatCurrencyName(currency) {
    const currencyMap = {
      'usdttrc20': 'USDT (TRC20)',
      'usdterc20': 'USDT (ERC20)',
      'usdcbsc': 'USDC (BSC)',
      'btc': 'Bitcoin',
      'eth': 'Ethereum',
      'bnb': 'BNB',
      'ltc': 'Litecoin'
    };
    
    return currencyMap[currency.toLowerCase()] || currency.toUpperCase();
  }

  // Get optimal currency for lowest fees
  getOptimalCurrency(targetAmount) {
    // For USDT amounts, TRC20 usually has lower fees than ERC20
    return 'usdttrc20'; // Always recommend TRC20 for lowest fees
  }

  // Calculate estimated total cost including fees - OPTIMIZED FOR USDT
  async calculateTotalCost(amount, fromCurrency = 'usdttrc20', toCurrency = 'usdttrc20') {
    try {
      const estimate = await this.getEstimateAmount(amount, fromCurrency, toCurrency);
      
      // Estimate network fees (approximate values)
      const networkFees = {
        'usdttrc20': 1.5,  // ~$1.5 for TRC20
        'usdterc20': 15,   // ~$15 for ERC20
        'btc': 5,          // Variable
        'eth': 20,         // Variable
        'bnb': 0.5,        // ~$0.5 for BSC
        'ltc': 0.1         // ~$0.1
      };
      
      const estimatedNetworkFee = networkFees[toCurrency.toLowerCase()] || 2;
      const conversionFee = fromCurrency === toCurrency ? 0 : estimate.estimated_amount - amount;
      
      return {
        base_amount: amount,
        estimated_pay_amount: estimate.estimated_amount,
        estimated_network_fee: estimatedNetworkFee,
        estimated_conversion_fee: conversionFee,
        estimated_total: estimate.estimated_amount + estimatedNetworkFee,
        currency: toCurrency,
        conversion_rate: estimate.conversion_rate,
        fees_paid_by_user: true,
        same_currency: fromCurrency === toCurrency
      };
    } catch (error) {
      console.error('Cost calculation error:', error.message);
      
      // Fallback calculation for same currency (USDT to USDT)
      const networkFee = toCurrency.toLowerCase() === 'usdttrc20' ? 1.5 : 5;
      const isSameCurrency = fromCurrency.toLowerCase() === toCurrency.toLowerCase();
      const conversionBuffer = isSameCurrency ? 0 : 0.05; // 0% for same currency, 5% for different
      
      return {
        base_amount: amount,
        estimated_pay_amount: amount * (1 + conversionBuffer),
        estimated_network_fee: networkFee,
        estimated_conversion_fee: isSameCurrency ? 0 : amount * 0.05,
        estimated_total: amount * (1 + conversionBuffer) + networkFee,
        currency: toCurrency,
        conversion_rate: 1 + conversionBuffer,
        fees_paid_by_user: true,
        same_currency: isSameCurrency,
        fallback: true
      };
    }
  }
}

module.exports = NowPaymentsService;