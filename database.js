const Database = require('better-sqlite3');
const path = require('path');

// Initialize database with proper settings
const dbPath = path.join(__dirname, 'nova.db');
let db;
let isInitialized = false;

const initDatabase = async () => {
  try {
    // Close existing connection if any
    if (db) {
      try {
        db.close();
      } catch (e) {
        console.log('No existing database connection to close');
      }
    }

    // Create new connection with retry logic
    let retries = 5;
    while (retries > 0) {
      try {
        db = new Database(dbPath, {
          timeout: 5000,
          verbose: null
        });
        
        // Enable WAL mode for better concurrency
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
        // Use async delay instead of Atomics.wait which blocks the event loop
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Create tables if they don't exist - UPDATED WITH MANUAL DEPOSITS
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

    // Tiers table
    db.exec(`
      CREATE TABLE IF NOT EXISTS tiers (
        id INTEGER PRIMARY KEY,
        price REAL NOT NULL
      )
    `);

    // Payments table (legacy - for backward compatibility)
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

    // Manual deposits table (NEW)
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

    // Withdrawals table
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

    // Revenue tracking table
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

    // Admin statistics table for caching
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

    // Announcements table
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

    // User announcement views tracking
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

    // Insert default tiers if they don't exist
    const tierCount = db.prepare('SELECT COUNT(*) as count FROM tiers').get();
    if (tierCount.count === 0) {
      const insertTier = db.prepare('INSERT INTO tiers (id, price) VALUES (?, ?)');
      const tierPrices = {
        1: 100, 2: 200, 3: 300, 4: 400, 5: 500,
        6: 700, 7: 850, 8: 1000, 9: 1200, 10: 1500,
        11: 1800, 12: 2000, 13: 2500, 14: 3000, 15: 4000,
        16: 5000, 17: 7000, 18: 10000, 19: 15000, 20: 20000,
        21: 25000, 22: 30000, 23: 35000, 24: 40000, 25: 50000
      };
      
      for (let i = 1; i <= 25; i++) {
        insertTier.run(i, tierPrices[i]);
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
    console.log('Database initialized successfully with manual deposits support');
    return db;
  } catch (error) {
    console.error('Database initialization error:', error.message);
    throw error;
  }
};

// Get database instance
const getDb = () => {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
};

// Graceful shutdown
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

// Handle process termination
process.on('SIGINT', closeDatabase);
process.on('SIGTERM', closeDatabase);

// EXPORT db VARIABLE SO OTHER FILES CAN USE IT
module.exports = { initDatabase, getDb, closeDatabase, db };