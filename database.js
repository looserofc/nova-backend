// database.js - Updated with new tier prices (keeping 25 tiers)

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || './nova.db';
let db;
let isInitialized = false;

const initDatabase = async () => {
  try {
    if (db) {
      try {
        db.close();
      } catch (e) {
        console.log('No existing database connection to close');
      }
    }

    let retries = 5;
    while (retries > 0) {
      try {
        db = new Database(dbPath, {
          timeout: 5000,
          verbose: null
        });
        
        db.pragma('journal_mode = WAL');
        db.pragma('busy_timeout = 5000');
        
        console.log('Database connected successfully');
        break;
      } catch (error) {
        retries--;
        if (retries === 0) {
          throw error;
        }
        console.log(`Database connection failed, retrying... (${retries} attempts left)`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Create tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        _id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        username TEXT UNIQUE NOT NULL,
        phone_number TEXT,
        password TEXT NOT NULL,
        is_verified BOOLEAN DEFAULT 0,
        tier_id INTEGER DEFAULT 0,
        payment_status TEXT DEFAULT 'pending',
        payment_tx_id TEXT,
        wallet_network TEXT,
        wallet_address TEXT,
        locked_balance REAL DEFAULT 0,
        withdrawable_balance REAL DEFAULT 0,
        total_earnings REAL DEFAULT 0,
        total_withdrawal REAL DEFAULT 0,
        ad_views_today INTEGER DEFAULT 0,
        last_ad_reward_date DATE,
        daily_earnings REAL DEFAULT 0,
        last_daily_reset DATE,
        isAdmin BOOLEAN DEFAULT 0,
        referrer_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        verification_token TEXT,
        token_expiry DATETIME
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS tiers (
        id INTEGER PRIMARY KEY,
        price REAL NOT NULL
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS payments (
        _id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        tier_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        currency TEXT DEFAULT 'USDT',
        status TEXT DEFAULT 'pending',
        tx_id TEXT UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

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
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS revenue_tracking (
        _id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        tier_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        transaction_type TEXT NOT NULL,
        status TEXT DEFAULT 'completed',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (_id),
        FOREIGN KEY (tier_id) REFERENCES tiers (id)
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS admin_stats_cache (
        id INTEGER PRIMARY KEY DEFAULT 1,
        total_revenue REAL DEFAULT 0,
        total_tier_subscriptions INTEGER DEFAULT 0,
        pending_withdrawals_count INTEGER DEFAULT 0,
        pending_withdrawals_total REAL DEFAULT 0,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS announcements (
        _id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users (_id)
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS user_announcement_views (
        _id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        announcement_id INTEGER NOT NULL,
        viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (_id),
        FOREIGN KEY (announcement_id) REFERENCES announcements (_id),
        UNIQUE(user_id, announcement_id)
      )
    `);

    // NEW TIER PRICES - Updated 25 tiers
    const tierCount = db.prepare('SELECT COUNT(*) as count FROM tiers').get();
    if (tierCount.count === 0) {
      const insertTier = db.prepare('INSERT INTO tiers (id, price) VALUES (?, ?)');
      
      const tierPrices = {
        1: 20,    // Starter 1
        2: 50,    // Starter 2
        3: 80,    // Starter 3
        4: 100,   // Trader 1
        5: 120,   // Trader 2
        6: 150,   // Trader 3
        7: 200,   // Pro Trader 1
        8: 250,   // Pro Trader 2
        9: 300,   // Pro Trader 3
        10: 400,  // Pro Trader 4
        11: 500,  // Elite Trader 1
        12: 600,  // Elite Trader 2
        13: 700,  // Elite Trader 3
        14: 800,  // Elite Trader 4
        15: 1000, // Whale 1
        16: 1200, // Whale 2
        17: 1500, // Whale 3
        18: 1800, // Whale 4
        19: 2000, // Titan 1
        20: 2500, // Titan 2
        21: 3000, // Titan 3
        22: 3500, // Titan 4
        23: 4000, // Titan 5
        24: 4500, // Titan 6
        25: 5000  // Legendary Investor
      };
      
      for (let i = 1; i <= 25; i++) {
        insertTier.run(i, tierPrices[i]);
      }
      
      console.log('✅ New tier prices initialized (25 tiers)');
    } else {
      // Update existing tiers with new prices
      console.log('Updating existing tiers to new prices...');
      const updateTier = db.prepare('UPDATE tiers SET price = ? WHERE id = ?');
      
      const tierPrices = {
        1: 20,    // Starter 1
        2: 50,    // Starter 2
        3: 80,    // Starter 3
        4: 100,   // Trader 1
        5: 120,   // Trader 2
        6: 150,   // Trader 3
        7: 200,   // Pro Trader 1
        8: 250,   // Pro Trader 2
        9: 300,   // Pro Trader 3
        10: 400,  // Pro Trader 4
        11: 500,  // Elite Trader 1
        12: 600,  // Elite Trader 2
        13: 700,  // Elite Trader 3
        14: 800,  // Elite Trader 4
        15: 1000, // Whale 1
        16: 1200, // Whale 2
        17: 1500, // Whale 3
        18: 1800, // Whale 4
        19: 2000, // Titan 1
        20: 2500, // Titan 2
        21: 3000, // Titan 3
        22: 3500, // Titan 4
        23: 4000, // Titan 5
        24: 4500, // Titan 6
        25: 5000  // Legendary Investor
      };
      
      try {
        for (let i = 1; i <= 25; i++) {
          updateTier.run(tierPrices[i], i);
        }
        console.log('✅ Tier prices updated to new structure');
      } catch (error) {
        console.log('Error updating tiers:', error.message);
      }
    }

    // Insert initial admin stats cache
    const cacheExists = db.prepare('SELECT * FROM admin_stats_cache WHERE id = 1').get();
    if (!cacheExists) {
      db.prepare(`
        INSERT INTO admin_stats_cache (id, total_revenue, total_tier_subscriptions)
        VALUES (1, 0, 0)
      `).run();
      console.log('Admin stats cache initialized');
    }

    isInitialized = true;
    console.log('✅ Database initialized successfully with new tier prices (25 tiers)');
    return db;
  } catch (error) {
    console.error('Database initialization error:', error.message);
    throw error;
  }
};

const getDb = () => {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
};

const closeDatabase = () => {
  if (db) {
    try {
      db.close();
      console.log('Database connection closed');
    } catch (error) {
      console.error('Error closing database:', error.message);
    }
  }
};

process.on('SIGINT', closeDatabase);
process.on('SIGTERM', closeDatabase);

module.exports = { initDatabase, getDb, closeDatabase, db };
