const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { getDb } = require('../database');
const router = express.Router();

// Get referral information - FIXED FOR MANUAL DEPOSITS
router.get('/', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const userId = req.user._id;
    
    console.log(`Fetching referral data for user ID: ${userId}`);
    
    // Get referral link
    const referralLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/signup?ref=${req.user.username}`;
    
    // Get referred users with their payment status - UPDATED FOR MANUAL DEPOSITS
    const referredUsers = db.prepare(`
      SELECT 
        u._id,
        u.username, 
        u.email,
        u.created_at, 
        u.tier_id, 
        u.payment_status,
        COALESCE(manual_payments.total_paid, legacy_payments.total_paid, 0) as total_spent,
        CASE 
          WHEN u.payment_status = 'paid' THEN 
            COALESCE(manual_payments.total_paid * 0.05, legacy_payments.total_paid * 0.05, 0)
          ELSE 0
        END as referral_earnings
      FROM users u
      -- Check manual deposits (new system)
      LEFT JOIN (
        SELECT 
          user_id, 
          SUM(amount) as total_paid 
        FROM manual_deposits 
        WHERE status = 'approved' 
        GROUP BY user_id
      ) manual_payments ON u._id = manual_payments.user_id
      -- Check legacy payments (old system)
      LEFT JOIN (
        SELECT 
          user_id, 
          SUM(amount) as total_paid 
        FROM payments 
        WHERE status = 'paid' 
        GROUP BY user_id
      ) legacy_payments ON u._id = legacy_payments.user_id
      WHERE u.referrer_id = ?
      ORDER BY u.created_at DESC
    `).all(userId);
    
    console.log(`Found ${referredUsers.length} referred users`);
    
    // Calculate total referral earnings from BOTH manual deposits and legacy payments
    const referralEarningsQuery = db.prepare(`
      SELECT 
        COALESCE(
          -- From manual deposits (new system)
          (SELECT SUM(md.amount * 0.05) 
           FROM manual_deposits md
           JOIN users u ON md.user_id = u._id
           WHERE u.referrer_id = ? AND md.status = 'approved'),
          0
        ) + COALESCE(
          -- From legacy payments (old system) 
          (SELECT SUM(p.amount * 0.05)
           FROM payments p
           JOIN users u ON p.user_id = u._id
           WHERE u.referrer_id = ? AND p.status = 'paid'),
          0
        ) as total_earnings
    `).get(userId, userId);
    
    const totalReferralEarnings = referralEarningsQuery.total_earnings || 0;
    console.log(`Total referral earnings: ${totalReferralEarnings}`);
    
    // Count successful referrals (users who have made ANY approved payment)
    const successfulReferrals = db.prepare(`
      SELECT COUNT(DISTINCT u._id) as count
      FROM users u
      WHERE u.referrer_id = ? 
      AND (
        -- Has approved manual deposit
        EXISTS (
          SELECT 1 FROM manual_deposits md 
          WHERE md.user_id = u._id AND md.status = 'approved'
        )
        OR
        -- Has paid legacy payment
        EXISTS (
          SELECT 1 FROM payments p 
          WHERE p.user_id = u._id AND p.status = 'paid'
        )
      )
    `).get(userId);
    
    // Count total referrals
    const totalReferrals = db.prepare(`
      SELECT COUNT(*) as count
      FROM users 
      WHERE referrer_id = ?
    `).get(userId);
    
    const referralData = {
      referralLink,
      referredUsers: referredUsers || [],
      totalEarnings: parseFloat(totalReferralEarnings.toFixed(6)),
      referralCount: totalReferrals.count || 0,
      successfulReferralCount: successfulReferrals.count || 0,
      pendingReferralCount: (totalReferrals.count || 0) - (successfulReferrals.count || 0)
    };
    
    console.log('Referral data being sent:', referralData);
    res.json(referralData);
    
  } catch (error) {
    console.error('Referral error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Get referral statistics - FIXED FOR MANUAL DEPOSITS
router.get('/stats', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const userId = req.user._id;
    
    console.log(`Fetching referral stats for user ID: ${userId}`);
    
    // Get detailed referral stats with corrected query for both manual and legacy payments
    const stats = db.prepare(`
      SELECT 
        COUNT(u._id) as total_referrals,
        COUNT(CASE 
          WHEN u.payment_status = 'paid' OR 
               EXISTS(SELECT 1 FROM manual_deposits md WHERE md.user_id = u._id AND md.status = 'approved') OR
               EXISTS(SELECT 1 FROM payments p WHERE p.user_id = u._id AND p.status = 'paid')
          THEN 1 
        END) as active_referrals,
        COALESCE(
          -- Manual deposits earnings
          (SELECT SUM(md.amount * 0.05) 
           FROM manual_deposits md
           WHERE md.user_id = u._id AND md.status = 'approved'),
          0
        ) + COALESCE(
          -- Legacy payments earnings
          (SELECT SUM(p.amount * 0.05)
           FROM payments p
           WHERE p.user_id = u._id AND p.status = 'paid'),
          0
        ) as total_earnings,
        COALESCE(
          -- Manual deposits revenue
          (SELECT SUM(md.amount) 
           FROM manual_deposits md
           WHERE md.user_id = u._id AND md.status = 'approved'),
          0
        ) + COALESCE(
          -- Legacy payments revenue
          (SELECT SUM(p.amount)
           FROM payments p
           WHERE p.user_id = u._id AND p.status = 'paid'),
          0
        ) as total_referred_revenue
      FROM users u
      WHERE u.referrer_id = ?
    `).get(userId);
    
    // Get recent referral activity - FIXED FOR BOTH SYSTEMS
    const recentActivity = db.prepare(`
      SELECT 
        u.username,
        u.created_at as joined_date,
        u.payment_status,
        COALESCE(
          MAX(md.created_at),
          MAX(p.created_at)
        ) as last_payment_date,
        COALESCE(
          (SELECT SUM(md2.amount) FROM manual_deposits md2 WHERE md2.user_id = u._id AND md2.status = 'approved'),
          0
        ) + COALESCE(
          (SELECT SUM(p2.amount) FROM payments p2 WHERE p2.user_id = u._id AND p2.status = 'paid'),
          0
        ) as total_contribution,
        (COALESCE(
          (SELECT SUM(md3.amount) FROM manual_deposits md3 WHERE md3.user_id = u._id AND md3.status = 'approved'),
          0
        ) + COALESCE(
          (SELECT SUM(p3.amount) FROM payments p3 WHERE p3.user_id = u._id AND p3.status = 'paid'),
          0
        )) * 0.05 as your_earnings
      FROM users u
      LEFT JOIN manual_deposits md ON u._id = md.user_id AND md.status = 'approved'
      LEFT JOIN payments p ON u._id = p.user_id AND p.status = 'paid'
      WHERE u.referrer_id = ?
      GROUP BY u._id, u.username, u.created_at, u.payment_status
      ORDER BY u.created_at DESC
      LIMIT 5
    `).all(userId);
    
    const statsData = {
      totalReferrals: stats.total_referrals || 0,
      activeReferrals: stats.active_referrals || 0,
      totalEarnings: parseFloat((stats.total_earnings || 0).toFixed(6)),
      totalReferredRevenue: parseFloat((stats.total_referred_revenue || 0).toFixed(6)),
      recentActivity: recentActivity || [],
      earningsRate: '5%',
      nextPayout: 'Instant'
    };
    
    console.log('Referral stats being sent:', statsData);
    res.json(statsData);
    
  } catch (error) {
    console.error('Referral stats error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Get referral leaderboard - UPDATED FOR BOTH SYSTEMS
router.get('/leaderboard', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    
    const leaderboard = db.prepare(`
      SELECT 
        u.username,
        COUNT(DISTINCT r._id) as referral_count,
        COALESCE(
          -- Manual deposits earnings
          (SELECT SUM(md.amount * 0.05) 
           FROM manual_deposits md
           JOIN users ur ON md.user_id = ur._id
           WHERE ur.referrer_id = u._id AND md.status = 'approved'),
          0
        ) + COALESCE(
          -- Legacy payments earnings
          (SELECT SUM(p.amount * 0.05)
           FROM payments p
           JOIN users up ON p.user_id = up._id
           WHERE up.referrer_id = u._id AND p.status = 'paid'),
          0
        ) as total_earnings
      FROM users u
      LEFT JOIN users r ON u._id = r.referrer_id
      GROUP BY u._id, u.username
      HAVING referral_count > 0
      ORDER BY total_earnings DESC
      LIMIT 10
    `).all();
    
    res.json(leaderboard);
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
