const express = require('express');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { getDb } = require('../database');
const revenueService = require('../services/revenueService');
const router = express.Router();

// Get all users
router.get('/users', authenticateToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    console.log('Fetching all users...');
    const users = db.prepare(`
      SELECT _id, username, email, phone_number, tier_id, 
             payment_status, locked_balance, withdrawable_balance,
             total_earnings, total_withdrawal, created_at
      FROM users
      ORDER BY created_at DESC
    `).all();
    
    console.log(`Found ${users.length} users`);
    res.json(users);
  } catch (error) {
    console.error('Admin users error:', error.message);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Get all manual deposits (NEW)
router.get('/deposits', authenticateToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    console.log('Fetching all manual deposits...');
    
    try {
      const deposits = db.prepare(`
        SELECT md.*, u.username, u.email, t.price as tier_price
        FROM manual_deposits md
        JOIN users u ON md.user_id = u._id
        JOIN tiers t ON md.tier_id = t.id
        ORDER BY md.created_at DESC
      `).all();
      
      console.log(`Found ${deposits.length} manual deposits`);
      res.json(deposits);
    } catch (tableError) {
      console.log('Manual deposits table might not exist, returning empty array');
      res.json([]);
    }
  } catch (error) {
    console.error('Admin deposits error:', error.message);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Approve/Reject manual deposit (NEW)
router.patch('/deposit/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { status, adminNotes } = req.body;
    const adminId = req.user._id;
    
    console.log(`Admin ${req.user.username} processing deposit ${id} with status: ${status}`);
    
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be "approved" or "rejected"' });
    }
    
    // Get deposit details
    const deposit = db.prepare('SELECT * FROM manual_deposits WHERE _id = ?').get(id);
    if (!deposit) {
      return res.status(404).json({ error: 'Deposit not found' });
    }
    
    if (deposit.status !== 'pending') {
      return res.status(400).json({ error: 'Deposit has already been processed' });
    }
    
    console.log(`Found deposit:`, deposit);
    
    // Start a transaction for data consistency
    const transaction = db.transaction(() => {
      if (status === 'approved') {
        console.log(`Approving deposit ${id} for user ${deposit.user_id}, tier ${deposit.tier_id}, amount ${deposit.amount}`);
        
        // Update deposit status to approved
        const updateDeposit = db.prepare(`
          UPDATE manual_deposits 
          SET status = 'approved', 
              admin_notes = ?, 
              approved_by = ?, 
              approved_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP 
          WHERE _id = ?
        `);
        updateDeposit.run(adminNotes || 'Approved by admin', adminId, id);
        
        // Update user tier and balances
        db.prepare(`
          UPDATE users 
          SET tier_id = ?, 
              payment_status = 'paid', 
              locked_balance = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE _id = ?
        `).run(deposit.tier_id, deposit.amount, deposit.user_id);
        
        // Record revenue transaction
        revenueService.recordTransaction(
          deposit.user_id, 
          deposit.tier_id, 
          deposit.amount, 
          'subscription', 
          'completed'
        );
        
        // Process referral reward if applicable
        const user = db.prepare('SELECT referrer_id, username FROM users WHERE _id = ?').get(deposit.user_id);
        
        if (user && user.referrer_id) {
          const referralReward = deposit.amount * 0.05; // 5% commission
          
          console.log(`Processing referral reward: ${referralReward} USDT for referrer ${user.referrer_id}`);
          
          // Update referrer's balances
          db.prepare(`
            UPDATE users 
            SET withdrawable_balance = withdrawable_balance + ?, 
                total_earnings = total_earnings + ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE _id = ?
          `).run(referralReward, referralReward, user.referrer_id);
          
          // Record referral payout (negative amount for referral expense)
          revenueService.recordTransaction(
            user.referrer_id,
            deposit.tier_id,
            -referralReward,
            'referral_payout',
            'completed'
          );
        }
        
        console.log(`✅ Deposit ${id} approved successfully for user ${user?.username || deposit.user_id}`);
        
      } else if (status === 'rejected') {
        console.log(`Rejecting deposit ${id}`);
        
        // Update deposit status to rejected
        const updateDeposit = db.prepare(`
          UPDATE manual_deposits 
          SET status = 'rejected', 
              admin_notes = ?,
              approved_by = ?,
              approved_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP 
          WHERE _id = ?
        `);
        updateDeposit.run(adminNotes || 'Rejected by admin', adminId, id);
        
        console.log(`✅ Deposit ${id} rejected successfully`);
      }
    });
    
    // Execute transaction
    transaction();
    
    // Send success response
    const successMessage = status === 'approved' 
      ? 'Deposit approved successfully! User now has access to their tier.' 
      : `Deposit rejected successfully.`;
      
    res.json({ 
      success: true,
      message: successMessage,
      depositId: id,
      status: status,
      amount: deposit.amount,
      adminNotes: adminNotes || (status === 'approved' ? 'Approved by admin' : 'Rejected by admin')
    });
    
  } catch (error) {
    console.error('Admin deposit update error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to process deposit: ' + error.message,
      depositId: id
    });
  }
});

// Delete user and remove their revenue
router.delete('/users/:userId', authenticateToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const { userId } = req.params;
    
    console.log(`Deleting user ${userId}...`);
    
    // Get user info before deletion
    const user = db.prepare('SELECT username, tier_id FROM users WHERE _id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Remove user's revenue transactions first
    const revenueRemoved = revenueService.removeUserTransactions(userId);
    
    // Delete user's manual deposits
    try {
      db.prepare('DELETE FROM manual_deposits WHERE user_id = ?').run(userId);
    } catch (error) {
      console.log('Manual deposits deletion skipped:', error.message);
    }
    
    // Delete user
    const result = db.prepare('DELETE FROM users WHERE _id = ?').run(userId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    console.log(`User ${userId} deleted, revenue removed: $${revenueRemoved.revenueRemoved}`);
    
    res.json({
      message: `User ${user.username} deleted successfully`,
      revenueRemoved: revenueRemoved.revenueRemoved,
      transactionsDeleted: revenueRemoved.transactionsDeleted
    });
    
  } catch (error) {
    console.error('Admin user deletion error:', error.message);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Manually add tier subscription (for admin purposes)
router.post('/users/:userId/subscribe', authenticateToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const { userId } = req.params;
    const { tierId } = req.body;
    
    if (!tierId || tierId < 1 || tierId > 25) {
      return res.status(400).json({ error: 'Invalid tier ID' });
    }
    
    // Get tier price
    const tier = db.prepare('SELECT * FROM tiers WHERE id = ?').get(tierId);
    if (!tier) {
      return res.status(400).json({ error: 'Tier not found' });
    }
    
    // Get user
    const user = db.prepare('SELECT * FROM users WHERE _id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update user tier
    db.prepare(`
      UPDATE users 
      SET tier_id = ?, payment_status = 'paid', locked_balance = ?
      WHERE _id = ?
    `).run(tierId, tier.price, userId);
    
    // RECORD REVENUE TRANSACTION
    revenueService.recordTransaction(
      userId, 
      tierId, 
      tier.price, 
      'subscription', 
      'completed'
    );
    
    res.json({
      message: `User ${user.username} subscribed to Tier ${tierId} successfully`,
      amount: tier.price,
      tier: tierId
    });
    
  } catch (error) {
    console.error('Admin subscription error:', error.message);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Get all withdrawals
router.get('/withdrawals', authenticateToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    console.log('Fetching all withdrawals...');
    
    try {
      const withdrawals = db.prepare(`
        SELECT w.*, u.username, u.email
        FROM withdrawals w
        JOIN users u ON w.user_id = u._id
        ORDER BY w.created_at DESC
      `).all();
      
      console.log(`Found ${withdrawals.length} withdrawals`);
      res.json(withdrawals);
    } catch (tableError) {
      console.log('Withdrawals table might not exist, returning empty array');
      res.json([]);
    }
  } catch (error) {
    console.error('Admin withdrawals error:', error.message);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Get admin stats (UPDATED WITH MANUAL DEPOSITS)
router.get('/stats', authenticateToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    console.log('Fetching admin stats...');
    
    // USE REVENUE SERVICE FOR ACCURATE STATS
    const revenueStats = revenueService.getAdminStats();
    
    // Total users
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
    
    // Pending withdrawals
    let pendingWithdrawals = { count: 0, total: 0 };
    try {
      pendingWithdrawals = db.prepare(`
        SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total 
        FROM withdrawals 
        WHERE status = 'pending'
      `).get();
    } catch (error) {
      console.log('Withdrawals table not available for stats');
    }
    
    // Pending manual deposits
    let pendingDeposits = { count: 0, total: 0 };
    try {
      pendingDeposits = db.prepare(`
        SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total 
        FROM manual_deposits 
        WHERE status = 'pending'
      `).get();
    } catch (error) {
      console.log('Manual deposits table not available for stats');
    }
    
    const stats = {
      totalUsers: totalUsers.count || 0,
      pendingWithdrawals: {
        count: pendingWithdrawals.count || 0,
        total: pendingWithdrawals.total || 0
      },
      pendingDeposits: {
        count: pendingDeposits.count || 0,
        total: pendingDeposits.total || 0
      },
      totalRevenue: revenueStats.total_revenue || 0,
      totalTierSubscriptions: revenueStats.total_tier_subscriptions || 0,
      lastUpdated: revenueStats.last_updated
    };
    
    console.log('Admin stats:', stats);
    res.json(stats);
  } catch (error) {
    console.error('Admin stats error:', error.message);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Get revenue breakdown
router.get('/revenue-breakdown', authenticateToken, requireAdmin, (req, res) => {
  try {
    const breakdown = revenueService.getRevenueBreakdown();
    res.json(breakdown);
  } catch (error) {
    console.error('Revenue breakdown error:', error.message);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Get recent transactions
router.get('/recent-transactions', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const transactions = revenueService.getRecentTransactions(parseInt(limit));
    res.json(transactions);
  } catch (error) {
    console.error('Recent transactions error:', error.message);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Update withdrawal status
router.patch('/withdrawal/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { status, rejectionReason } = req.body;
    
    console.log(`Admin processing withdrawal ${id} with status: ${status}`);
    
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be "approved" or "rejected"' });
    }
    
    // Get withdrawal details
    const withdrawal = db.prepare('SELECT * FROM withdrawals WHERE _id = ?').get(id);
    if (!withdrawal) {
      return res.status(404).json({ error: 'Withdrawal not found' });
    }
    
    console.log(`Found withdrawal:`, withdrawal);
    
    // Start a transaction for data consistency
    const transaction = db.transaction(() => {
      if (status === 'approved') {
        console.log(`Approving withdrawal ${id} for amount ${withdrawal.amount}`);
        
        // Update withdrawal status to approved
        const updateWithdrawal = db.prepare(`
          UPDATE withdrawals 
          SET status = 'approved', updated_at = CURRENT_TIMESTAMP 
          WHERE _id = ?
        `);
        updateWithdrawal.run(id);
        
        // Update user's total withdrawal amount
        const updateUserWithdrawals = db.prepare(`
          UPDATE users 
          SET total_withdrawal = total_withdrawal + ?, updated_at = CURRENT_TIMESTAMP
          WHERE _id = ?
        `);
        updateUserWithdrawals.run(withdrawal.amount, withdrawal.user_id);
        
        console.log(`✅ Withdrawal ${id} approved successfully`);
        
      } else if (status === 'rejected') {
        console.log(`Rejecting withdrawal ${id}, returning ${withdrawal.amount} to user`);
        
        // Update withdrawal status to rejected
        const updateWithdrawal = db.prepare(`
          UPDATE withdrawals 
          SET status = 'rejected', rejection_reason = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE _id = ?
        `);
        updateWithdrawal.run(rejectionReason || 'No reason provided', id);
        
        // Return funds to user's withdrawable balance
        const returnFunds = db.prepare(`
          UPDATE users 
          SET withdrawable_balance = withdrawable_balance + ?, updated_at = CURRENT_TIMESTAMP
          WHERE _id = ?
        `);
        returnFunds.run(withdrawal.amount, withdrawal.user_id);
        
        console.log(`✅ Withdrawal ${id} rejected, funds returned to user`);
      }
    });
    
    // Execute transaction
    transaction();
    
    // Send success response
    const successMessage = status === 'approved' 
      ? 'Withdrawal approved successfully! The user will receive their funds.' 
      : `Withdrawal rejected successfully! Funds returned to user's balance.`;
      
    res.json({ 
      success: true,
      message: successMessage,
      withdrawalId: id,
      status: status,
      amount: withdrawal.amount,
      rejectionReason: status === 'rejected' ? (rejectionReason || 'No reason provided') : null
    });
    
  } catch (error) {
    console.error('Admin withdrawal update error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to process withdrawal: ' + error.message,
      withdrawalId: id
    });
  }
});

// Announcement Service (Inline implementation)
class AnnouncementService {
  constructor() {
    this.db = getDb();
  }

  createAnnouncement(title, content, createdBy) {
    try {
      // Deactivate all previous announcements
      this.db.prepare('UPDATE announcements SET is_active = 0').run();
      
      // Create new active announcement
      const stmt = this.db.prepare(`
        INSERT INTO announcements (title, content, created_by, is_active)
        VALUES (?, ?, ?, 1)
      `);
      
      const result = stmt.run(title, content, createdBy);
      return result.lastInsertRowid;
    } catch (error) {
      console.error('Error creating announcement:', error);
      throw error;
    }
  }

  getActiveAnnouncement() {
    try {
      const announcement = this.db.prepare(`
        SELECT a.*, u.username as created_by_username 
        FROM announcements a 
        LEFT JOIN users u ON a.created_by = u._id 
        WHERE a.is_active = 1 
        ORDER BY a.created_at DESC 
        LIMIT 1
      `).get();
      
      return announcement || null;
    } catch (error) {
      console.error('Error getting active announcement:', error);
      return null;
    }
  }

  markAsViewed(userId, announcementId) {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO user_announcement_views (user_id, announcement_id, viewed_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `);
      
      stmt.run(userId, announcementId);
      return true;
    } catch (error) {
      console.error('Error marking announcement as viewed:', error);
      return false;
    }
  }

  hasUserSeenAnnouncement(userId, announcementId) {
    try {
      const view = this.db.prepare(`
        SELECT * FROM user_announcement_views 
        WHERE user_id = ? AND announcement_id = ?
      `).get(userId, announcementId);
      
      return !!view;
    } catch (error) {
      console.error('Error checking announcement view:', error);
      return false;
    }
  }

  getAnnouncementHistory(limit = 10) {
    try {
      const announcements = this.db.prepare(`
        SELECT a.*, u.username as created_by_username,
               (SELECT COUNT(*) FROM user_announcement_views uav WHERE uav.announcement_id = a._id) as view_count
        FROM announcements a
        LEFT JOIN users u ON a.created_by = u._id
        ORDER BY a.created_at DESC
        LIMIT ?
      `).all(limit);
      
      return announcements;
    } catch (error) {
      console.error('Error getting announcement history:', error);
      return [];
    }
  }

  getAnnouncementStats(announcementId) {
    try {
      const stats = this.db.prepare(`
        SELECT 
          COUNT(DISTINCT uav.user_id) as unique_views,
          (SELECT COUNT(*) FROM users WHERE is_verified = 1) as total_users,
          a.created_at,
          u.username as created_by
        FROM announcements a
        LEFT JOIN user_announcement_views uav ON a._id = uav.announcement_id
        LEFT JOIN users u ON a.created_by = u._id
        WHERE a._id = ?
        GROUP BY a._id
      `).get(announcementId);
      
      return stats || { unique_views: 0, total_users: 0 };
    } catch (error) {
      console.error('Error getting announcement stats:', error);
      return { unique_views: 0, total_users: 0 };
    }
  }
}

const announcementService = new AnnouncementService();

// Create announcement
router.post('/announcement', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { title, content } = req.body;
    
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }
    
    // Create announcement using service
    const announcementId = announcementService.createAnnouncement(
      title, 
      content, 
      req.user._id
    );
    
    // Get the created announcement
    const announcement = announcementService.getActiveAnnouncement();
    
    res.json({ 
      message: 'Announcement published successfully! It will show to all users on their next login.',
      announcement: announcement
    });
  } catch (error) {
    console.error('Announcement error:', error.message);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Get active announcement
router.get('/announcement/active', authenticateToken, (req, res) => {
  try {
    const announcement = announcementService.getActiveAnnouncement();
    
    if (!announcement) {
      return res.json({ announcement: null });
    }
    
    // Check if user has already seen this announcement
    const hasSeen = announcementService.hasUserSeenAnnouncement(req.user._id, announcement._id);
    
    res.json({
      announcement: announcement,
      hasSeen: hasSeen,
      showPopup: !hasSeen // Show popup if not seen
    });
  } catch (error) {
    console.error('Error getting active announcement:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark announcement as viewed
router.post('/announcement/:id/view', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    
    announcementService.markAsViewed(req.user._id, parseInt(id));
    
    res.json({ 
      message: 'Announcement marked as viewed',
      success: true 
    });
  } catch (error) {
    console.error('Error marking announcement as viewed:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get announcement history
router.get('/announcements/history', authenticateToken, requireAdmin, (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const announcements = announcementService.getAnnouncementHistory(parseInt(limit));
    
    // Add stats to each announcement
    const announcementsWithStats = announcements.map(announcement => ({
      ...announcement,
      stats: announcementService.getAnnouncementStats(announcement._id)
    }));
    
    res.json(announcementsWithStats);
  } catch (error) {
    console.error('Error getting announcement history:', error.message);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

module.exports = router;