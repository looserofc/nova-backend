const express = require('express');
const { authenticateToken, requirePaidSubscription } = require('../middleware/auth');
const { getDb } = require('../database');
const router = express.Router();

// Helper function to retry database operations
const withRetry = async (operation, maxRetries = 3, delay = 100) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return operation();
    } catch (error) {
      if (error.code === 'SQLITE_BUSY' && attempt < maxRetries) {
        console.log(`Database busy, retrying attempt ${attempt}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
        continue;
      }
      throw error;
    }
  }
};

// Set withdrawal address
router.post('/address', authenticateToken, async (req, res) => {
  try {
    const { walletAddress, network } = req.body;
    const db = getDb();
    
    if (!walletAddress || !network) {
      return res.status(400).json({ error: 'Wallet address and network are required' });
    }
    
    // Validate wallet address format
    if (walletAddress.trim().length < 10) {
      return res.status(400).json({ error: 'Invalid wallet address format' });
    }
    
    // Validate network
    const validNetworks = ['TRC20', 'BSC20', 'ERC20', 'BTC'];
    if (!validNetworks.includes(network)) {
      return res.status(400).json({ error: 'Invalid network. Use TRC20, BSC20, ERC20, or BTC' });
    }
    
    await withRetry(() => {
      const stmt = db.prepare(`
        UPDATE users 
        SET wallet_address = ?, wallet_network = ?, updated_at = CURRENT_TIMESTAMP
        WHERE _id = ?
      `);
      const result = stmt.run(walletAddress.trim(), network, req.user._id);
      
      if (result.changes === 0) {
        throw new Error('User not found');
      }
    });
    
    res.json({ 
      success: true,
      message: 'Withdrawal address updated successfully',
      walletAddress: walletAddress.trim(),
      network: network
    });
  } catch (error) {
    console.error('Address update error:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to save address: ' + error.message 
    });
  }
});

// Get current withdrawal address
router.get('/address', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const user = await withRetry(() => 
      db.prepare('SELECT wallet_address, wallet_network FROM users WHERE _id = ?').get(req.user._id)
    );
    
    res.json({
      success: true,
      walletAddress: user.wallet_address,
      network: user.wallet_network
    });
  } catch (error) {
    console.error('Address fetch error:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch address' 
    });
  }
});

// Submit withdrawal request - THIS WAS MISSING
router.post('/', authenticateToken, requirePaidSubscription, async (req, res) => {
  try {
    const { amount, network, walletAddress } = req.body;
    const db = getDb();
    const userId = req.user._id;
    
    console.log(`Withdrawal request from user ${userId}: ${amount} via ${network}`);
    
    // Validation
    if (!amount || !network || !walletAddress) {
      return res.status(400).json({ error: 'Amount, network, and wallet address are required' });
    }
    
    const withdrawalAmount = parseFloat(amount);
    if (isNaN(withdrawalAmount) || withdrawalAmount < 11) {
      return res.status(400).json({ error: 'Minimum withdrawal amount is $11' });
    }
    
    // Get user's current balance
    const user = db.prepare('SELECT withdrawable_balance FROM users WHERE _id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const currentBalance = user.withdrawable_balance || 0;
    if (withdrawalAmount > currentBalance) {
      return res.status(400).json({ 
        error: `Insufficient balance. Available: $${currentBalance.toFixed(2)}, Requested: $${withdrawalAmount.toFixed(2)}` 
      });
    }
    
    // Validate network
    const validNetworks = ['TRC20', 'BSC20', 'ERC20', 'BTC'];
    if (!validNetworks.includes(network)) {
      return res.status(400).json({ error: 'Invalid network' });
    }
    
    // Validate wallet address
    if (walletAddress.trim().length < 10) {
      return res.status(400).json({ error: 'Invalid wallet address format' });
    }
    
    // Create withdrawals table if it doesn't exist
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS withdrawals (
          _id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          amount REAL NOT NULL,
          network TEXT NOT NULL,
          wallet_address TEXT NOT NULL,
          status TEXT DEFAULT 'pending',
          rejection_reason TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (_id)
        )
      `);
    } catch (tableError) {
      console.log('Withdrawals table already exists or creation failed:', tableError.message);
    }
    
    // Insert withdrawal request
    const insertWithdrawal = db.prepare(`
      INSERT INTO withdrawals (user_id, amount, network, wallet_address, status)
      VALUES (?, ?, ?, ?, 'pending')
    `);
    
    const withdrawalResult = await withRetry(() => 
      insertWithdrawal.run(userId, withdrawalAmount, network, walletAddress.trim())
    );
    
    // Deduct amount from user's withdrawable balance
    const updateBalance = db.prepare(`
      UPDATE users 
      SET withdrawable_balance = withdrawable_balance - ?
      WHERE _id = ?
    `);
    
    await withRetry(() => updateBalance.run(withdrawalAmount, userId));
    
    console.log(`Withdrawal request created: ID ${withdrawalResult.lastInsertRowid}, Amount: ${withdrawalAmount}`);
    
    res.json({
      success: true,
      message: 'Withdrawal request submitted successfully! It will be processed within 24-48 hours.',
      withdrawalId: withdrawalResult.lastInsertRowid,
      amount: withdrawalAmount,
      network: network,
      status: 'pending'
    });
    
  } catch (error) {
    console.error('Withdrawal request error:', error);
    res.status(500).json({ 
      error: 'Failed to process withdrawal request: ' + error.message 
    });
  }
});

// Get withdrawal history
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user._id;
    
    // Check if withdrawals table exists
    try {
      const withdrawals = db.prepare(`
        SELECT _id, amount, network, wallet_address, status, rejection_reason, created_at, updated_at
        FROM withdrawals 
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 20
      `).all(userId);
      
      res.json({
        success: true,
        withdrawals: withdrawals || []
      });
    } catch (tableError) {
      // Table doesn't exist, return empty array
      res.json({
        success: true,
        withdrawals: []
      });
    }
    
  } catch (error) {
    console.error('Withdrawal history error:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch withdrawal history' 
    });
  }
});

// Get withdrawal statistics
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user._id;
    
    try {
      const stats = db.prepare(`
        SELECT 
          COUNT(*) as total_withdrawals,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_withdrawals,
          COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_withdrawals,
          COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_withdrawals,
          COALESCE(SUM(amount), 0) as total_amount_requested,
          COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0) as total_amount_approved
        FROM withdrawals 
        WHERE user_id = ?
      `).get(userId);
      
      res.json({
        success: true,
        stats: stats || {
          total_withdrawals: 0,
          pending_withdrawals: 0,
          approved_withdrawals: 0,
          rejected_withdrawals: 0,
          total_amount_requested: 0,
          total_amount_approved: 0
        }
      });
    } catch (tableError) {
      // Table doesn't exist, return zero stats
      res.json({
        success: true,
        stats: {
          total_withdrawals: 0,
          pending_withdrawals: 0,
          approved_withdrawals: 0,
          rejected_withdrawals: 0,
          total_amount_requested: 0,
          total_amount_approved: 0
        }
      });
    }
    
  } catch (error) {
    console.error('Withdrawal stats error:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch withdrawal statistics' 
    });
  }
});

module.exports = router;