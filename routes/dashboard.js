const express = require('express');
const { authenticateToken, requirePaidSubscription } = require('../middleware/auth');
const { getDb } = require('../database');
const router = express.Router();

/**
 * Calculate compound earnings for ad clicks
 */
const calculateCompoundEarnings = (initialBalance, ratePercentage, numberOfClicks) => {
    if (numberOfClicks <= 0) {
        return {
            finalBalance: initialBalance,
            totalEarnings: 0,
            earningsPerClick: 0
        };
    }

    let currentBalance = initialBalance;
    let totalEarnings = 0;
    const rateDecimal = ratePercentage / 100;
    
    for (let i = 0; i < numberOfClicks; i++) {
        const earnings = currentBalance * rateDecimal;
        currentBalance += earnings;
        totalEarnings += earnings;
    }
    
    return {
        finalBalance: parseFloat(currentBalance.toFixed(6)),
        totalEarnings: parseFloat(totalEarnings.toFixed(6)),
        earningsPerClick: parseFloat((initialBalance * rateDecimal).toFixed(6))
    };
};

/**
 * Get London time and reset information
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
        nextResetFormatted: `Resets in ${hours}h ${minutes}m`,
        nextResetTime: nextReset
    };
};

/**
 * Calculate real-time ad statistics
 */
const calculateAdStatistics = (user) => {
    const currentBalance = (user.locked_balance || 0) + (user.withdrawable_balance || 0);
    const rewardRate = 0.05; // 0.05%
    const clicksRemaining = 20 - (user.ad_views_today || 0);
    
    // Calculate current earnings per click (0.05% of current balance)
    const earningsPerClick = currentBalance * (rewardRate / 100);
    
    // Calculate what would happen if user uses all remaining clicks today (compounding)
    const dailyProjection = calculateCompoundEarnings(currentBalance, rewardRate, clicksRemaining);
    
    return {
        earningsPerClick: parseFloat(earningsPerClick.toFixed(6)),
        dailyProjection: dailyProjection.totalEarnings,
        finalBalanceProjection: dailyProjection.finalBalance,
        clicksRemaining: clicksRemaining,
        currentBalance: parseFloat(currentBalance.toFixed(6)),
        rewardRate: rewardRate
    };
};

// Get dashboard data with real-time calculations
router.get('/', authenticateToken, requirePaidSubscription, (req, res) => {
    try {
        const db = getDb();
        const userId = req.user._id;
        
        // Reset daily earnings if it's a new day
        const londonInfo = getLondonTimeInfo();
        const user = db.prepare('SELECT last_daily_reset FROM users WHERE _id = ?').get(userId);
        
        if (!user || user.last_daily_reset !== londonInfo.today) {
            db.prepare(`
                UPDATE users 
                SET 
                    ad_views_today = 0,
                    daily_earnings = 0,
                    last_daily_reset = ?
                WHERE _id = ?
            `).run(londonInfo.today, userId);
        }
        
        // Get fresh user data with all stats
        const refreshedUser = db.prepare('SELECT * FROM users WHERE _id = ?').get(userId);
        
        // FIXED: Calculate referral earnings with proper aggregation for both systems
        let referralEarnings = 0;
        try {
            const referralData = db.prepare(`
                SELECT COALESCE(
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
                  ) as total_referral_earnings
            `).get(userId, userId);
            
            referralEarnings = referralData.total_referral_earnings || 0;
        } catch (error) {
            console.log('Referral earnings calculation error:', error.message);
            referralEarnings = 0;
        }
        
        // Calculate real-time ad statistics
        const adStats = calculateAdStatistics(refreshedUser);
        
        // Get user stats
        const userStats = {
            dailyEarnings: refreshedUser.daily_earnings || 0,
            referralEarnings: parseFloat(referralEarnings.toFixed(6)),
            totalEarnings: refreshedUser.total_earnings || 0,
            currentBalance: parseFloat(((refreshedUser.locked_balance || 0) + (refreshedUser.withdrawable_balance || 0)).toFixed(6)),
            totalWithdrawal: refreshedUser.total_withdrawal || 0,
            clicksToday: refreshedUser.ad_views_today || 0,
            clicksRemaining: adStats.clicksRemaining,
            lastResetDate: refreshedUser.last_daily_reset,
            // Real-time calculated fields
            earningsPerClick: adStats.earningsPerClick,
            dailyProjection: adStats.dailyProjection,
            finalBalanceProjection: adStats.finalBalanceProjection,
            nextReset: londonInfo.nextResetFormatted,
            rewardRate: adStats.rewardRate
        };

        res.json({
            user: {
                id: refreshedUser._id,
                username: refreshedUser.username,
                email: refreshedUser.email,
                tier: refreshedUser.tier_id
            },
            stats: userStats,
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ error: 'Internal server error: ' + error.message });
    }
});

// Get detailed ad projections
router.get('/ad-projections', authenticateToken, requirePaidSubscription, (req, res) => {
    try {
        const db = getDb();
        const userId = req.user._id;
        
        // Get user data
        const user = db.prepare('SELECT * FROM users WHERE _id = ?').get(userId);
        const currentBalance = (user.locked_balance || 0) + (user.withdrawable_balance || 0);
        const rewardRate = 0.05;
        const clicksRemaining = 20 - (user.ad_views_today || 0);
        
        // Calculate detailed projections for each remaining click
        const projections = [];
        let runningBalance = currentBalance;
        let totalProjectedEarnings = 0;
        
        for (let i = 1; i <= clicksRemaining; i++) {
            const earnings = runningBalance * (rewardRate / 100);
            runningBalance += earnings;
            totalProjectedEarnings += earnings;
            
            projections.push({
                clickNumber: i,
                earnings: parseFloat(earnings.toFixed(6)),
                balanceAfter: parseFloat(runningBalance.toFixed(6)),
                cumulativeEarnings: parseFloat(totalProjectedEarnings.toFixed(6))
            });
        }
        
        res.json({
            currentBalance: parseFloat(currentBalance.toFixed(6)),
            rewardRate: rewardRate,
            clicksRemaining: clicksRemaining,
            totalProjectedEarnings: parseFloat(totalProjectedEarnings.toFixed(6)),
            finalProjectedBalance: parseFloat(runningBalance.toFixed(6)),
            projections: projections,
            nextReset: getLondonTimeInfo().nextResetFormatted
        });
        
    } catch (error) {
        console.error('Ad projections error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;