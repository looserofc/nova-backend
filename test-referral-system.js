// test-referral-system.js
const { getDb } = require('./database');

async function testReferralSystem() {
  try {
    const db = getDb();
    
    console.log('=== REFERRAL SYSTEM TEST ===\n');
    
    // Test 1: Check all users and their referrers
    console.log('1. ALL USERS WITH REFERRER INFO:');
    const allUsers = db.prepare(`
      SELECT 
        u._id,
        u.username,
        u.email,
        u.payment_status,
        u.tier_id,
        u.referrer_id,
        r.username as referrer_username,
        u.withdrawable_balance,
        u.total_earnings
      FROM users u
      LEFT JOIN users r ON u.referrer_id = r._id
      ORDER BY u._id
    `).all();
    
    console.table(allUsers);
    
    // Test 2: Check all payments
    console.log('\n2. ALL PAYMENTS:');
    const allPayments = db.prepare(`
      SELECT 
        p._id,
        p.user_id,
        u.username,
        p.tier_id,
        p.amount,
        p.status,
        p.created_at
      FROM payments p
      JOIN users u ON p.user_id = u._id
      ORDER BY p.created_at DESC
    `).all();
    
    console.table(allPayments);
    
    // Test 3: Calculate referral earnings for each user
    console.log('\n3. REFERRAL EARNINGS CALCULATION:');
    const referralStats = db.prepare(`
      SELECT 
        referrer.username as referrer_name,
        referrer._id as referrer_id,
        COUNT(referred_users._id) as total_referrals,
        COUNT(CASE WHEN referred_users.payment_status = 'paid' THEN 1 END) as active_referrals,
        COALESCE(SUM(CASE WHEN payments.status = 'paid' THEN payments.amount * 0.05 ELSE 0 END), 0) as calculated_earnings,
        referrer.withdrawable_balance as current_balance,
        referrer.total_earnings as total_earnings
      FROM users referrer
      LEFT JOIN users referred_users ON referrer._id = referred_users.referrer_id
      LEFT JOIN payments ON referred_users._id = payments.user_id
      WHERE EXISTS (SELECT 1 FROM users WHERE referrer_id = referrer._id)
      GROUP BY referrer._id, referrer.username
      ORDER BY calculated_earnings DESC
    `).all();
    
    console.table(referralStats);
    
    // Test 4: Check revenue tracking table
    console.log('\n4. REVENUE TRACKING:');
    try {
      const revenueTracking = db.prepare(`
        SELECT 
          rt._id,
          rt.user_id,
          u.username,
          rt.tier_id,
          rt.amount,
          rt.transaction_type,
          rt.status,
          rt.created_at
        FROM revenue_tracking rt
        JOIN users u ON rt.user_id = u._id
        ORDER BY rt.created_at DESC
        LIMIT 10
      `).all();
      
      console.table(revenueTracking);
    } catch (error) {
      console.log('Revenue tracking table might not exist:', error.message);
    }
    
    // Test 5: Test specific referral endpoints data
    console.log('\n5. TESTING REFERRAL ENDPOINTS DATA:');
    
    const testUser = db.prepare('SELECT * FROM users WHERE referrer_id IS NOT NULL LIMIT 1').get();
    if (testUser) {
      console.log(`Testing referral data for referrer of user: ${testUser.username}`);
      
      const referrerReferralData = db.prepare(`
        SELECT 
          COUNT(*) as total_referrals,
          COUNT(CASE WHEN u.payment_status = 'paid' THEN 1 END) as active_referrals,
          COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount * 0.05 ELSE 0 END), 0) as total_earnings,
          COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0) as total_referred_revenue
        FROM users u
        LEFT JOIN payments p ON u._id = p.user_id
        WHERE u.referrer_id = ?
      `).get(testUser.referrer_id);
      
      console.log('Referrer data:', referrerReferralData);
      
      const referredUsers = db.prepare(`
        SELECT 
          u._id,
          u.username, 
          u.email,
          u.created_at, 
          u.tier_id, 
          u.payment_status,
          COALESCE(p.total_paid, 0) as total_spent,
          CASE 
            WHEN u.payment_status = 'paid' THEN COALESCE(p.total_paid * 0.05, 0)
            ELSE 0
          END as referral_earnings
        FROM users u
        LEFT JOIN (
          SELECT 
            user_id, 
            SUM(amount) as total_paid 
          FROM payments 
          WHERE status = 'paid' 
          GROUP BY user_id
        ) p ON u._id = p.user_id
        WHERE u.referrer_id = ?
        ORDER BY u.created_at DESC
      `).all(testUser.referrer_id);
      
      console.log('Referred users:', referredUsers);
    }
    
    console.log('\n=== TEST COMPLETE ===');
    
  } catch (error) {
    console.error('Test error:', error);
  }
}

// Run if called directly
if (require.main === module) {
  const { initDatabase } = require('./database');
  
  async function run() {
    await initDatabase();
    await testReferralSystem();
    process.exit(0);
  }
  
  run();
}

module.exports = testReferralSystem;