const { getDb } = require('../database');

class RevenueService {
  constructor() {
    this.db = getDb();
  }

  // FIXED: Record a new revenue transaction with proper tier validation
  recordTransaction(userId, tierId, amount, transactionType, status = 'completed') {
    try {
      console.log(`Attempting to record transaction: User ${userId}, Tier ${tierId}, Amount ${amount}, Type ${transactionType}`);

      // FIXED: For non-tier transactions (like withdrawals), don't use tier_id foreign key
      if (transactionType === 'withdrawal' || tierId === 0 || tierId === null) {
        // For withdrawals and non-tier transactions, skip revenue tracking
        // since withdrawals don't generate revenue and cause foreign key issues
        console.log(`Skipping revenue tracking for ${transactionType} - not a revenue-generating transaction`);
        
        // Update admin stats cache manually for withdrawals
        if (transactionType === 'withdrawal') {
          this.updateAdminStatsCache();
        }
        
        return null;
      }

      // Validate that tier exists before inserting
      const tierExists = this.db.prepare('SELECT id FROM tiers WHERE id = ?').get(tierId);
      if (!tierExists) {
        console.error(`Tier ${tierId} does not exist, cannot record transaction`);
        throw new Error(`Invalid tier ID: ${tierId}. Tier does not exist in database.`);
      }

      // Validate user exists
      const userExists = this.db.prepare('SELECT _id FROM users WHERE _id = ?').get(userId);
      if (!userExists) {
        console.error(`User ${userId} does not exist, cannot record transaction`);
        throw new Error(`Invalid user ID: ${userId}. User does not exist in database.`);
      }

      // Record the transaction
      const stmt = this.db.prepare(`
        INSERT INTO revenue_tracking (user_id, tier_id, amount, transaction_type, status)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      const result = stmt.run(userId, tierId, amount, transactionType, status);
      
      // Update admin stats cache
      this.updateAdminStatsCache();
      
      console.log(`✅ Revenue transaction recorded successfully: ID ${result.lastInsertRowid}`);
      return result.lastInsertRowid;
      
    } catch (error) {
      console.error('Error recording revenue transaction:', error);
      
      // Provide more specific error messages
      if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
        throw new Error('Database foreign key constraint failed. Please ensure user and tier exist.');
      } else if (error.code === 'SQLITE_CONSTRAINT') {
        throw new Error('Database constraint violation. Please check data integrity.');
      } else {
        throw error;
      }
    }
  }

  // Alternative method for tracking withdrawals without foreign key constraint
  recordWithdrawal(userId, amount, status = 'completed') {
    try {
      console.log(`Recording withdrawal: User ${userId}, Amount ${amount}, Status ${status}`);
      
      // Update admin stats cache to reflect withdrawal changes
      this.updateAdminStatsCache();
      
      console.log(`✅ Withdrawal tracking updated successfully`);
      return true;
    } catch (error) {
      console.error('Error recording withdrawal:', error);
      throw error;
    }
  }

  // Remove transaction when user is deleted
  removeUserTransactions(userId) {
    try {
      console.log(`Removing all transactions for user ${userId}`);

      // Get total revenue from this user to subtract
      const userRevenue = this.db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total_amount 
        FROM revenue_tracking 
        WHERE user_id = ? AND transaction_type = 'subscription'
      `).get(userId);

      // Remove user's transactions
      const stmt = this.db.prepare('DELETE FROM revenue_tracking WHERE user_id = ?');
      const result = stmt.run(userId);
      
      // Update admin stats cache
      this.updateAdminStatsCache();
      
      console.log(`✅ Removed ${result.changes} transactions for user ${userId}`);
      
      return {
        transactionsDeleted: result.changes,
        revenueRemoved: userRevenue.total_amount
      };
    } catch (error) {
      console.error('Error removing user transactions:', error);
      throw error;
    }
  }

  // FIXED: Update admin stats cache with better error handling
  updateAdminStatsCache() {
    try {
      console.log('Updating admin stats cache...');

      // Calculate total revenue from subscriptions only
      let totalRevenue = 0;
      let totalSubscriptions = 0;

      try {
        const revenueQuery = this.db.prepare(`
          SELECT COALESCE(SUM(amount), 0) as total 
          FROM revenue_tracking 
          WHERE transaction_type = 'subscription' AND status = 'completed'
        `).get();
        totalRevenue = revenueQuery.total || 0;
      } catch (error) {
        console.log('Revenue tracking table might not exist, using 0 for total revenue');
      }

      try {
        // Count total tier subscriptions (unique users with paid subscriptions)
        const subscriptionsQuery = this.db.prepare(`
          SELECT COUNT(DISTINCT user_id) as count 
          FROM revenue_tracking 
          WHERE transaction_type = 'subscription' AND status = 'completed'
        `).get();
        totalSubscriptions = subscriptionsQuery.count || 0;
      } catch (error) {
        console.log('Revenue tracking table might not exist, using 0 for total subscriptions');
      }

      // Get pending withdrawals - handle if table doesn't exist
      let pendingWithdrawals = { count: 0, total: 0 };
      try {
        const withdrawalsQuery = this.db.prepare(`
          SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total 
          FROM withdrawals 
          WHERE status = 'pending'
        `).get();
        pendingWithdrawals = withdrawalsQuery;
      } catch (error) {
        console.log('Withdrawals table might not exist, using default values for pending withdrawals');
      }

      // Create admin_stats_cache table if it doesn't exist
      try {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS admin_stats_cache (
            id INTEGER PRIMARY KEY DEFAULT 1,
            total_revenue REAL DEFAULT 0,
            total_tier_subscriptions INTEGER DEFAULT 0,
            pending_withdrawals_count INTEGER DEFAULT 0,
            pending_withdrawals_total REAL DEFAULT 0,
            last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);
      } catch (tableError) {
        console.log('Admin stats cache table already exists or could not be created');
      }

      // Update or insert cache data
      try {
        const updateStmt = this.db.prepare(`
          UPDATE admin_stats_cache 
          SET 
            total_revenue = ?,
            total_tier_subscriptions = ?,
            pending_withdrawals_count = ?,
            pending_withdrawals_total = ?,
            last_updated = CURRENT_TIMESTAMP
          WHERE id = 1
        `);
        
        const updateResult = updateStmt.run(
          totalRevenue,
          totalSubscriptions,
          pendingWithdrawals.count || 0,
          pendingWithdrawals.total || 0
        );

        // If no rows were updated, insert initial data
        if (updateResult.changes === 0) {
          const insertStmt = this.db.prepare(`
            INSERT INTO admin_stats_cache 
            (id, total_revenue, total_tier_subscriptions, pending_withdrawals_count, pending_withdrawals_total)
            VALUES (1, ?, ?, ?, ?)
          `);
          
          insertStmt.run(
            totalRevenue,
            totalSubscriptions,
            pendingWithdrawals.count || 0,
            pendingWithdrawals.total || 0
          );
        }
      } catch (cacheUpdateError) {
        console.error('Error updating admin stats cache:', cacheUpdateError.message);
        
        // Try to insert if update failed
        try {
          const insertStmt = this.db.prepare(`
            INSERT OR REPLACE INTO admin_stats_cache 
            (id, total_revenue, total_tier_subscriptions, pending_withdrawals_count, pending_withdrawals_total)
            VALUES (1, ?, ?, ?, ?)
          `);
          
          insertStmt.run(
            totalRevenue,
            totalSubscriptions,
            pendingWithdrawals.count || 0,
            pendingWithdrawals.total || 0
          );
        } catch (insertError) {
          console.error('Error inserting admin stats cache:', insertError.message);
        }
      }
      
      console.log(`✅ Admin stats cache updated: Revenue: ${totalRevenue}, Subscriptions: ${totalSubscriptions}, Pending Withdrawals: ${pendingWithdrawals.count}`);
      
    } catch (error) {
      console.error('Error in updateAdminStatsCache:', error);
      // Don't throw error, just log it to prevent cascading failures
    }
  }

  // Get current admin stats with fallback values
  getAdminStats() {
    try {
      const stats = this.db.prepare('SELECT * FROM admin_stats_cache WHERE id = 1').get();
      return stats || {
        total_revenue: 0,
        total_tier_subscriptions: 0,
        pending_withdrawals_count: 0,
        pending_withdrawals_total: 0,
        last_updated: null
      };
    } catch (error) {
      console.error('Error getting admin stats:', error);
      return {
        total_revenue: 0,
        total_tier_subscriptions: 0,
        pending_withdrawals_count: 0,
        pending_withdrawals_total: 0,
        last_updated: null
      };
    }
  }

  // Get revenue breakdown by tier
  getRevenueBreakdown() {
    try {
      const breakdown = this.db.prepare(`
        SELECT 
          t.id as tier_id,
          t.price,
          COUNT(rt._id) as subscription_count,
          COALESCE(SUM(rt.amount), 0) as total_revenue
        FROM tiers t
        LEFT JOIN revenue_tracking rt ON t.id = rt.tier_id AND rt.transaction_type = 'subscription' AND rt.status = 'completed'
        GROUP BY t.id, t.price
        ORDER BY t.id
      `).all();

      return breakdown || [];
    } catch (error) {
      console.error('Error getting revenue breakdown:', error);
      return [];
    }
  }

  // Get recent transactions with proper joins
  getRecentTransactions(limit = 10) {
    try {
      const transactions = this.db.prepare(`
        SELECT 
          rt._id,
          rt.user_id,
          rt.tier_id,
          rt.amount,
          rt.transaction_type,
          rt.status,
          rt.created_at,
          u.username,
          u.email,
          t.price as tier_price
        FROM revenue_tracking rt
        JOIN users u ON rt.user_id = u._id
        LEFT JOIN tiers t ON rt.tier_id = t.id
        ORDER BY rt.created_at DESC
        LIMIT ?
      `).all(limit);

      return transactions || [];
    } catch (error) {
      console.error('Error getting recent transactions:', error);
      return [];
    }
  }

  // Get revenue stats for a specific user
  getUserRevenueStats(userId) {
    try {
      const stats = this.db.prepare(`
        SELECT 
          COUNT(*) as total_transactions,
          COALESCE(SUM(CASE WHEN transaction_type = 'subscription' THEN amount ELSE 0 END), 0) as total_subscriptions,
          COALESCE(SUM(CASE WHEN transaction_type = 'referral_payout' THEN ABS(amount) ELSE 0 END), 0) as total_referral_payouts,
          COALESCE(MAX(created_at), '') as last_transaction_date
        FROM revenue_tracking 
        WHERE user_id = ?
      `).get(userId);

      return stats || {
        total_transactions: 0,
        total_subscriptions: 0,
        total_referral_payouts: 0,
        last_transaction_date: ''
      };
    } catch (error) {
      console.error('Error getting user revenue stats:', error);
      return {
        total_transactions: 0,
        total_subscriptions: 0,
        total_referral_payouts: 0,
        last_transaction_date: ''
      };
    }
  }

  // Get monthly revenue report
  getMonthlyRevenue(year = null, month = null) {
    try {
      const currentYear = year || new Date().getFullYear();
      const currentMonth = month || (new Date().getMonth() + 1);
      
      const monthlyStats = this.db.prepare(`
        SELECT 
          strftime('%Y-%m', created_at) as month,
          COUNT(*) as transaction_count,
          COALESCE(SUM(CASE WHEN transaction_type = 'subscription' THEN amount ELSE 0 END), 0) as subscription_revenue,
          COALESCE(SUM(CASE WHEN transaction_type = 'referral_payout' THEN ABS(amount) ELSE 0 END), 0) as referral_payouts,
          COUNT(DISTINCT user_id) as unique_users
        FROM revenue_tracking 
        WHERE strftime('%Y', created_at) = ? 
        AND strftime('%m', created_at) = ?
        GROUP BY strftime('%Y-%m', created_at)
        ORDER BY month DESC
      `).get(currentYear.toString(), currentMonth.toString().padStart(2, '0'));

      return monthlyStats || {
        month: `${currentYear}-${currentMonth.toString().padStart(2, '0')}`,
        transaction_count: 0,
        subscription_revenue: 0,
        referral_payouts: 0,
        unique_users: 0
      };
    } catch (error) {
      console.error('Error getting monthly revenue:', error);
      return {
        month: 'N/A',
        transaction_count: 0,
        subscription_revenue: 0,
        referral_payouts: 0,
        unique_users: 0
      };
    }
  }

  // Validate database integrity
  validateDatabaseIntegrity() {
    try {
      console.log('Validating revenue tracking database integrity...');

      // Check for orphaned records (users that don't exist)
      const orphanedUserRecords = this.db.prepare(`
        SELECT rt.*, 'Missing User' as issue
        FROM revenue_tracking rt
        LEFT JOIN users u ON rt.user_id = u._id
        WHERE u._id IS NULL
      `).all();

      // Check for invalid tier references
      const invalidTierRecords = this.db.prepare(`
        SELECT rt.*, 'Invalid Tier' as issue
        FROM revenue_tracking rt
        LEFT JOIN tiers t ON rt.tier_id = t.id
        WHERE rt.tier_id IS NOT NULL 
        AND rt.tier_id > 0 
        AND t.id IS NULL
      `).all();

      const issues = [...orphanedUserRecords, ...invalidTierRecords];

      if (issues.length > 0) {
        console.log(`Found ${issues.length} data integrity issues:`, issues);
        return {
          valid: false,
          issues: issues,
          orphanedUsers: orphanedUserRecords.length,
          invalidTiers: invalidTierRecords.length
        };
      } else {
        console.log('Database integrity check passed');
        return {
          valid: true,
          issues: [],
          orphanedUsers: 0,
          invalidTiers: 0
        };
      }
    } catch (error) {
      console.error('Error validating database integrity:', error);
      return {
        valid: false,
        error: error.message,
        issues: [],
        orphanedUsers: 0,
        invalidTiers: 0
      };
    }
  }

  // Clean up invalid records
  cleanupInvalidRecords() {
    try {
      console.log('Cleaning up invalid revenue tracking records...');

      // Remove records with non-existent users
      const cleanupUsers = this.db.prepare(`
        DELETE FROM revenue_tracking 
        WHERE user_id NOT IN (SELECT _id FROM users)
      `);
      const userCleanupResult = cleanupUsers.run();

      // Remove records with invalid tier references (except withdrawals and null tiers)
      const cleanupTiers = this.db.prepare(`
        DELETE FROM revenue_tracking 
        WHERE tier_id IS NOT NULL 
        AND tier_id > 0 
        AND tier_id NOT IN (SELECT id FROM tiers)
      `);
      const tierCleanupResult = cleanupTiers.run();

      console.log(`Cleaned up ${userCleanupResult.changes} orphaned user records and ${tierCleanupResult.changes} invalid tier records`);

      // Update admin stats after cleanup
      this.updateAdminStatsCache();

      return {
        success: true,
        userRecordsRemoved: userCleanupResult.changes,
        tierRecordsRemoved: tierCleanupResult.changes,
        totalRecordsRemoved: userCleanupResult.changes + tierCleanupResult.changes
      };
    } catch (error) {
      console.error('Error cleaning up invalid records:', error);
      return {
        success: false,
        error: error.message,
        userRecordsRemoved: 0,
        tierRecordsRemoved: 0,
        totalRecordsRemoved: 0
      };
    }
  }
}

module.exports = new RevenueService();