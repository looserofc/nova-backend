const { getDb } = require('../database');
const walletService = require('./walletService');
const revenueService = require('./revenueService');

class PaymentVerifier {
  constructor() {
    this.isRunning = false;
    this.checkInterval = 30000; // Check every 30 seconds
  }

  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('Payment verifier started');
    this.checkPendingPayments();
    this.interval = setInterval(() => this.checkPendingPayments(), this.checkInterval);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
    console.log('Payment verifier stopped');
  }

  async checkPendingPayments() {
    try {
      const db = getDb();
      
      // Get all pending invoices that haven't expired
      const pendingInvoices = db.prepare(`
        SELECT * FROM invoices 
        WHERE status = 'pending' 
        AND expires_at > datetime('now')
      `).all();

      console.log(`Checking ${pendingInvoices.length} pending invoices...`);

      for (const invoice of pendingInvoices) {
        await this.verifyInvoicePayment(invoice);
      }

      // Mark expired invoices
      await this.markExpiredInvoices();

    } catch (error) {
      console.error('Error checking pending payments:', error);
    }
  }

  async verifyInvoicePayment(invoice) {
    try {
      const db = getDb();

      // Get recent transactions for the wallet address
      const transactions = await walletService.getTransactions(invoice.wallet_address, 50);

      for (const tx of transactions) {
        // Skip if we've already processed this transaction
        const existingLog = db.prepare(
          'SELECT * FROM payment_logs WHERE tx_hash = ? AND invoice_id = ?'
        ).get(tx.transaction_id, invoice.invoice_id);

        if (existingLog) continue;

        // Parse and verify transaction
        const parsedTx = await walletService.verifyTransaction(tx.transaction_id);
        
        if (!parsedTx) {
          this.logPaymentAttempt(invoice.invoice_id, tx.transaction_id, 'failed', 'Invalid transaction format');
          continue;
        }

        // Log the payment attempt
        this.logPaymentAttempt(
          invoice.invoice_id,
          tx.transaction_id,
          'detected',
          null,
          parsedTx.from,
          parsedTx.to,
          parsedTx.amount
        );

        // Verify payment criteria
        const verification = this.verifyPaymentCriteria(invoice, parsedTx);
        
        if (verification.valid) {
          await this.processSuccessfulPayment(invoice, parsedTx);
        } else {
          await this.processFailedPayment(invoice, parsedTx, verification.errors);
        }
      }

    } catch (error) {
      console.error(`Error verifying invoice ${invoice.invoice_id}:`, error);
    }
  }

  verifyPaymentCriteria(invoice, transaction) {
    const errors = [];

    // Check network (ensure it's to the correct address)
    if (!walletService.isValidNetwork(transaction)) {
      errors.push('Wrong network or address');
    }

    // Check amount
    if (!walletService.isValidAmount(invoice.amount, transaction.amount)) {
      if (transaction.amount < invoice.amount) {
        errors.push(`Underpaid: Expected ${invoice.amount} USDT, received ${transaction.amount} USDT`);
      } else {
        errors.push(`Overpaid: Expected ${invoice.amount} USDT, received ${transaction.amount} USDT`);
      }
    }

    // Check timing (transaction should be after invoice creation)
    const invoiceTime = new Date(invoice.created_at).getTime();
    const txTime = transaction.timestamp;
    
    if (txTime < invoiceTime) {
      errors.push('Transaction timestamp is before invoice creation');
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  async processSuccessfulPayment(invoice, transaction) {
    const db = getDb();

    try {
      // Start transaction
      const updateInvoice = db.transaction(() => {
        // Update invoice status
        db.prepare(`
          UPDATE invoices 
          SET status = 'paid', 
              paid_at = datetime('now'),
              tx_hash = ?,
              sender_address = ?,
              actual_amount = ?,
              confirmations = 1
          WHERE _id = ?
        `).run(transaction.txHash, transaction.from, transaction.amount, invoice._id);

        // Update user subscription
        db.prepare(`
          UPDATE users 
          SET tier_id = ?, 
              payment_status = 'paid', 
              locked_balance = ?
          WHERE _id = ?
        `).run(invoice.tier_id, invoice.amount, invoice.user_id);

        // Log successful payment
        this.logPaymentAttempt(
          invoice.invoice_id,
          transaction.txHash,
          'confirmed',
          'Payment successful',
          transaction.from,
          transaction.to,
          transaction.amount
        );
      });

      updateInvoice();

      // Record revenue
      revenueService.recordTransaction(
        invoice.user_id,
        invoice.tier_id,
        invoice.amount,
        'subscription',
        'completed'
      );

      // Process referral if applicable
      await this.processReferralReward(invoice);

      console.log(`✅ Payment confirmed for invoice ${invoice.invoice_id}`);

    } catch (error) {
      console.error('Error processing successful payment:', error);
    }
  }

  async processFailedPayment(invoice, transaction, errors) {
    const db = getDb();

    const errorMessage = errors.join(', ');
    
    // Update invoice with error
    if (errors.includes('Underpaid')) {
      db.prepare(`
        UPDATE invoices 
        SET status = 'underpaid',
            tx_hash = ?,
            sender_address = ?,
            actual_amount = ?
        WHERE _id = ?
      `).run(transaction.txHash, transaction.from, transaction.amount, invoice._id);
    } else if (errors.includes('Overpaid')) {
      // For overpayment, still activate subscription but log the difference
      await this.processSuccessfulPayment(invoice, transaction);
      console.log(`⚠️ Overpayment detected for invoice ${invoice.invoice_id}: +${transaction.amount - invoice.amount} USDT`);
      return;
    } else {
      db.prepare(`
        UPDATE invoices 
        SET status = 'failed'
        WHERE _id = ?
      `).run(invoice._id);
    }

    // Log failed payment
    this.logPaymentAttempt(
      invoice.invoice_id,
      transaction.txHash,
      'failed',
      errorMessage,
      transaction.from,
      transaction.to,
      transaction.amount
    );

    console.log(`❌ Payment failed for invoice ${invoice.invoice_id}: ${errorMessage}`);
  }

  async processReferralReward(invoice) {
    try {
      const db = getDb();
      
      const user = db.prepare('SELECT referrer_id FROM users WHERE _id = ?').get(invoice.user_id);
      
      if (user && user.referrer_id) {
        const referralReward = invoice.amount * 0.05; // 5% commission
        
        db.prepare(`
          UPDATE users 
          SET withdrawable_balance = withdrawable_balance + ?, 
              total_earnings = total_earnings + ?
          WHERE _id = ?
        `).run(referralReward, referralReward, user.referrer_id);

        console.log(`💰 Referral reward of ${referralReward} USDT credited to user ${user.referrer_id}`);
      }
    } catch (error) {
      console.error('Error processing referral reward:', error);
    }
  }

  async markExpiredInvoices() {
    const db = getDb();
    
    const result = db.prepare(`
      UPDATE invoices 
      SET status = 'expired' 
      WHERE status = 'pending' 
      AND expires_at <= datetime('now')
    `).run();

    if (result.changes > 0) {
      console.log(`⏰ Marked ${result.changes} invoices as expired`);
    }
  }

  logPaymentAttempt(invoiceId, txHash, status, errorMessage = null, fromAddress = null, toAddress = null, amount = null) {
    try {
      const db = getDb();
      
      db.prepare(`
        INSERT INTO payment_logs 
        (invoice_id, tx_hash, from_address, to_address, amount, network, status, error_message)
        VALUES (?, ?, ?, ?, ?, 'TRC20', ?, ?)
      `).run(invoiceId, txHash, fromAddress, toAddress, amount, status, errorMessage);
    } catch (error) {
      console.error('Error logging payment attempt:', error);
    }
  }
}

module.exports = new PaymentVerifier();