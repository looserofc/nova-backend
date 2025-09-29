const express = require('express');
const { authenticateToken, requirePaidSubscription } = require('../middleware/auth');
const { getDb } = require('../database');
const router = express.Router();

/**
 * Get London time and check if it's a new day
 */
const getLondonTimeInfo = () => {
    const now = new Date();
    const londonTime = new Date(now.toLocaleString("en-US", {timeZone: "Europe/London"}));
    const today = londonTime.toISOString().split('T')[0];
    
    // Calculate next reset time
    const nextReset = new Date(londonTime);
    nextReset.setDate(nextReset.getDate() + 1);
    nextReset.setHours(0, 0, 0, 0);
    
    const timeUntilReset = nextReset.getTime() - now.getTime();
    const hours = Math.floor(timeUntilReset / (1000 * 60 * 60));
    const minutes = Math.floor((timeUntilReset % (1000 * 60 * 60)) / (1000 * 60));
    
    return {
        today,
        nextResetFormatted: `Resets in ${hours}h ${minutes}m`
    };
};

/**
 * Reset daily earnings if it's a new day in London time
 */
const resetDailyEarningsIfNeeded = (db, userId) => {
    const londonInfo = getLondonTimeInfo();
    const user = db.prepare('SELECT last_daily_reset FROM users WHERE _id = ?').get(userId);
    
    if (!user || user.last_daily_reset !== londonInfo.today) {
        console.log(`Resetting daily earnings for user ${userId} - new day in London`);
        
        db.prepare(`
            UPDATE users 
            SET 
                ad_views_today = 0,
                daily_earnings = 0,
                last_daily_reset = ?
            WHERE _id = ?
        `).run(londonInfo.today, userId);
        
        return true;
    }
    return false;
};

// Watch ad endpoint
router.post('/watch', authenticateToken, requirePaidSubscription, (req, res) => {
    try {
        const db = getDb();
        const userId = req.user._id;
        
        // Reset daily earnings if it's a new day
        resetDailyEarningsIfNeeded(db, userId);
        
        // Get fresh user data after potential reset
        const user = db.prepare('SELECT * FROM users WHERE _id = ?').get(userId);
        
        // Check daily ad limit (20 clicks)
        if (user.ad_views_today >= 20) {
            return res.status(400).json({ 
                error: 'Daily ad limit reached (20 clicks). Resets at 00:00 London time.' 
            });
        }
        
        // Calculate current total balance
        const currentBalance = (user.locked_balance || 0) + (user.withdrawable_balance || 0);
        
        // Calculate 0.05% reward
        const rewardRate = 0.05; // 0.05%
        const reward = currentBalance * (rewardRate / 100);
        
        // Update balances and daily earnings
        const newWithdrawableBalance = (user.withdrawable_balance || 0) + reward;
        const newTotalEarnings = (user.total_earnings || 0) + reward;
        const newDailyEarnings = (user.daily_earnings || 0) + reward;
        const newAdViewsToday = (user.ad_views_today || 0) + 1;
        
        const londonInfo = getLondonTimeInfo();
        
        db.prepare(`
            UPDATE users 
            SET 
                ad_views_today = ?,
                withdrawable_balance = ?,
                total_earnings = ?,
                daily_earnings = ?,
                last_daily_reset = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE _id = ?
        `).run(
            newAdViewsToday,
            newWithdrawableBalance,
            newTotalEarnings,
            newDailyEarnings,
            londonInfo.today,
            userId
        );
        
        // Get updated user data
        const updatedUser = db.prepare('SELECT * FROM users WHERE _id = ?').get(userId);
        
        res.json({
            message: 'Ad viewed successfully!',
            reward: parseFloat(reward.toFixed(6)),
            clicksToday: updatedUser.ad_views_today,
            clicksRemaining: 20 - updatedUser.ad_views_today,
            dailyEarnings: parseFloat(updatedUser.daily_earnings.toFixed(6)),
            newBalance: parseFloat((updatedUser.locked_balance + updatedUser.withdrawable_balance).toFixed(6)),
            currentRate: `${rewardRate}%`,
            nextReset: londonInfo.nextResetFormatted
        });
        
    } catch (error) {
        console.error('Ad watch error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            details: error.message 
        });
    }
});

// Get ad statistics
router.get('/stats', authenticateToken, requirePaidSubscription, (req, res) => {
    try {
        const db = getDb();
        const userId = req.user._id;
        
        // Reset daily earnings if it's a new day
        resetDailyEarningsIfNeeded(db, userId);
        
        // Get fresh user data
        const user = db.prepare('SELECT * FROM users WHERE _id = ?').get(userId);
        
        const currentBalance = (user.locked_balance || 0) + (user.withdrawable_balance || 0);
        const rewardRate = 0.05; // 0.05%
        const clicksRemaining = 20 - (user.ad_views_today || 0);
        const londonInfo = getLondonTimeInfo();
        
        // Calculate earnings per click
        const earningsPerClick = currentBalance * (rewardRate / 100);
        
        res.json({
            clicksToday: user.ad_views_today || 0,
            clicksRemaining: clicksRemaining,
            dailyEarnings: parseFloat(user.daily_earnings.toFixed(6)),
            currentBalance: parseFloat(currentBalance.toFixed(6)),
            rewardRate: `${rewardRate}%`,
            earningsPerClick: parseFloat(earningsPerClick.toFixed(6)),
            nextReset: londonInfo.nextResetFormatted,
            lastResetDate: user.last_daily_reset
        });
        
    } catch (error) {
        console.error('Ad stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;