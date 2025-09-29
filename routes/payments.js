const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { getDb } = require('../database');
const revenueService = require('../services/revenueService');
const router = express.Router();

// Create manual deposit request
router.post('/manual-deposit', authenticateToken, async (req, res) => {
  try {
    const { tierId, amount, network, transactionId } = req.body;
    const userId = req.user._id;

    // Validation
    if (!tierId || !amount || !network || !transactionId) {
      return res.status(400).json({ 
        success: false, 
        error: 'All fields are required: tierId, amount, network, transactionId' 
      });
    }

    if (tierId < 1 || tierId > 25) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid tier ID' 
      });
    }

    if (amount < 1) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid amount' 
      });
    }

    if (transactionId.length < 20) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid transaction ID format' 
      });
    }

    const validNetworks = ['TRC20', 'BEP20', 'ERC20'];
    if (!validNetworks.includes(network)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid network. Must be TRC20, BEP20, or ERC20' 
      });
    }

    const db = getDb();

    // Check if transaction ID already exists
    const existingTx = db.prepare('SELECT * FROM manual_deposits WHERE transaction_id = ?').get(transactionId);
    if (existingTx) {
      return res.status(400).json({ 
        success: false, 
        error: 'Transaction ID already exists in our system' 
      });
    }

    // Check if user already has this tier
    if (req.user.tier_id === tierId && req.user.payment_status === 'paid') {
      return res.status(400).json({ 
        success: false, 
        error: 'You already have this tier' 
      });
    }

    // Verify tier price
    const tier = db.prepare('SELECT * FROM tiers WHERE id = ?').get(tierId);
    if (!tier) {
      return res.status(400).json({ 
        success: false, 
        error: 'Tier not found' 
      });
    }

    if (parseFloat(amount) !== tier.price) {
      return res.status(400).json({ 
        success: false, 
        error: `Amount mismatch. Expected: ${tier.price}, Received: ${amount}` 
      });
    }

    // Create manual_deposits table if it doesn't exist
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS manual_deposits (
          _id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          tier_id INTEGER NOT NULL,
          amount REAL NOT NULL,
          network TEXT NOT NULL,
          transaction_id TEXT UNIQUE NOT NULL,
          status TEXT DEFAULT 'pending',
          admin_notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          approved_by INTEGER,
          approved_at DATETIME,
          FOREIGN KEY (user_id) REFERENCES users (_id),
          FOREIGN KEY (tier_id) REFERENCES tiers (id),
          FOREIGN KEY (approved_by) REFERENCES users (_id)
        )
      `);
    } catch (tableError) {
      console.log('Manual deposits table creation error:', tableError.message);
    }

    // Insert manual deposit request
    const insertDeposit = db.prepare(`
      INSERT INTO manual_deposits (user_id, tier_id, amount, network, transaction_id, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `);

    const result = insertDeposit.run(userId, tierId, amount, network, transactionId);

    console.log(`Manual deposit created: ID ${result.lastInsertRowid}, User: ${req.user.username}, Amount: ${amount}, TxID: ${transactionId}`);

    res.json({
      success: true,
      message: 'Deposit submitted successfully! Admin will review within 24 hours.',
      depositId: result.lastInsertRowid,
      status: 'pending'
    });

  } catch (error) {
    console.error('Manual deposit error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error: ' + error.message 
    });
  }
});

// Get user's deposit history
router.get('/deposit-history', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const userId = req.user._id;

    try {
      const deposits = db.prepare(`
        SELECT md.*, t.price as tier_price, u.username as approved_by_username
        FROM manual_deposits md
        LEFT JOIN tiers t ON md.tier_id = t.id
        LEFT JOIN users u ON md.approved_by = u._id
        WHERE md.user_id = ?
        ORDER BY md.created_at DESC
      `).all(userId);

      res.json({
        success: true,
        deposits: deposits || []
      });
    } catch (tableError) {
      // Table doesn't exist yet
      res.json({
        success: true,
        deposits: []
      });
    }
  } catch (error) {
    console.error('Deposit history error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch deposit history' 
    });
  }
});

// Get supported currencies (legacy endpoint for compatibility)
router.get('/currencies', authenticateToken, async (req, res) => {
  try {
    const currencies = ['TRC20 USDT', 'BEP20 USDT', 'ERC20 USDT'];
    res.json({
      currencies: currencies,
      manual: true
    });
  } catch (error) {
    console.error('Get currencies error:', error);
    res.status(500).json({ error: 'Failed to fetch currencies' });
  }
});

// Get payment history (updated for manual deposits)
router.get('/history', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const userId = req.user._id;

    // Get both old payments and new manual deposits
    let allPayments = [];

    // Old payments
    try {
      const payments = db.prepare(`
        SELECT p.*, t.price as tier_price, 'automatic' as payment_type
        FROM payments p
        JOIN tiers t ON p.tier_id = t.id
        WHERE p.user_id = ?
        ORDER BY p.created_at DESC
      `).all(userId);
      allPayments = allPayments.concat(payments);
    } catch (error) {
      console.log('No old payments table or error:', error.message);
    }

    // Manual deposits
    try {
      const deposits = db.prepare(`
        SELECT md.*, t.price as tier_price, 'manual' as payment_type
        FROM manual_deposits md
        JOIN tiers t ON md.tier_id = t.id
        WHERE md.user_id = ?
        ORDER BY md.created_at DESC
      `).all(userId);
      allPayments = allPayments.concat(deposits);
    } catch (error) {
      console.log('No manual deposits table or error:', error.message);
    }

    // Sort by created_at
    allPayments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    res.json(allPayments);
  } catch (error) {
    console.error('Payment history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Legacy subscribe endpoint (for backward compatibility)
router.post('/subscribe', authenticateToken, async (req, res) => {
  res.status(400).json({ 
    error: 'Automatic payments are disabled. Please use manual payment method.',
    useManualPayment: true
  });
});

// Check payment status (updated for manual deposits)
router.get('/status/:depositId', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const { depositId } = req.params;
    const userId = req.user._id;

    const deposit = db.prepare(`
      SELECT md.*, t.price as tier_price, u.username as approved_by_username
      FROM manual_deposits md
      LEFT JOIN tiers t ON md.tier_id = t.id
      LEFT JOIN users u ON md.approved_by = u._id
      WHERE md._id = ? AND md.user_id = ?
    `).get(depositId, userId);

    if (!deposit) {
      return res.status(404).json({ error: 'Deposit not found' });
    }

    res.json({
      ...deposit,
      manual: true
    });
  } catch (error) {
    console.error('Deposit status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;