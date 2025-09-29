const TronWeb = require('tronweb');
const bip32 = require('bip32');
const bip39 = require('bip39');
const crypto = require('crypto');

class WalletService {
  constructor() {
    // Initialize TronWeb
    this.tronWeb = new TronWeb({
      fullHost: 'https://api.trongrid.io',
      headers: { 'TRON-PRO-API-KEY': process.env.TRON_API_KEY || 'your-api-key' },
      privateKey: process.env.MASTER_PRIVATE_KEY // Your master wallet private key
    });
    
    // Master wallet for receiving payments
    this.masterAddress = process.env.MASTER_WALLET_ADDRESS;
    this.usdtContractAddress = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'; // USDT TRC20
  }

  // Generate unique address for each invoice
  generateInvoiceAddress(invoiceId) {
    try {
      // Create deterministic address based on invoice ID
      const seed = crypto.createHash('sha256').update(invoiceId + process.env.WALLET_SEED).digest();
      const keyPair = this.tronWeb.utils.accounts.generateAccount();
      
      // For simplicity, we'll use a single master address but generate unique invoice IDs
      // In production, you might want to implement HD wallet derivation
      return {
        address: this.masterAddress,
        invoiceId: this.generateInvoiceId()
      };
    } catch (error) {
      console.error('Error generating invoice address:', error);
      throw error;
    }
  }

  generateInvoiceId() {
    return 'INV_' + crypto.randomBytes(16).toString('hex').toUpperCase();
  }

  // Check USDT balance for address
  async getUSDTBalance(address) {
    try {
      const contract = await this.tronWeb.contract().at(this.usdtContractAddress);
      const balance = await contract.balanceOf(address).call();
      return this.tronWeb.fromSun(balance) / 1000000; // Convert to USDT
    } catch (error) {
      console.error('Error getting USDT balance:', error);
      return 0;
    }
  }

  // Get transactions for address
  async getTransactions(address, limit = 20) {
    try {
      const response = await fetch(
        `https://api.trongrid.io/v1/accounts/${address}/transactions/trc20?limit=${limit}&contract_address=${this.usdtContractAddress}`
      );
      const data = await response.json();
      return data.data || [];
    } catch (error) {
      console.error('Error fetching transactions:', error);
      return [];
    }
  }

  // Verify specific transaction
  async verifyTransaction(txHash) {
    try {
      const response = await fetch(`https://api.trongrid.io/wallet/gettransactionbyid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: txHash })
      });
      
      const transaction = await response.json();
      return this.parseTransaction(transaction);
    } catch (error) {
      console.error('Error verifying transaction:', error);
      return null;
    }
  }

  parseTransaction(transaction) {
    if (!transaction || !transaction.ret || transaction.ret[0].contractRet !== 'SUCCESS') {
      return null;
    }

    const contract = transaction.raw_data.contract[0];
    if (contract.type !== 'TriggerSmartContract') return null;

    try {
      // Parse TRC20 transfer
      const parameter = contract.parameter.value;
      const data = parameter.data;
      
      // Check if it's a transfer function call (first 8 characters should be 'a9059cbb')
      if (!data.startsWith('a9059cbb')) return null;

      // Extract recipient and amount from data
      const recipient = '41' + data.substring(32, 72);
      const amountHex = data.substring(72, 136);
      const amount = parseInt(amountHex, 16) / 1000000; // Convert to USDT

      return {
        txHash: transaction.txID,
        from: this.tronWeb.address.fromHex(transaction.raw_data.contract[0].parameter.value.owner_address),
        to: this.tronWeb.address.fromHex(recipient),
        amount: amount,
        timestamp: transaction.raw_data.timestamp,
        confirmed: !!transaction.ret[0].contractRet
      };
    } catch (error) {
      console.error('Error parsing transaction:', error);
      return null;
    }
  }

  // Validate network (ensure it's TRC20)
  isValidNetwork(transaction) {
    return transaction && transaction.to && 
           this.tronWeb.isAddress(transaction.to) &&
           transaction.to === this.masterAddress;
  }

  // Validate amount (allow small tolerance)
  isValidAmount(expectedAmount, actualAmount, tolerance = 0.1) {
    const difference = Math.abs(expectedAmount - actualAmount);
    return difference <= tolerance;
  }
}

module.exports = new WalletService();