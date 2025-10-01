const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || './nova.db';
let db;
let isInitialized = false;

const initDatabase = async () => {
  try {
    console.log('Connecting to database...');
    
    // Single connection attempt for deployment
    db = new Database(dbPath, {
      timeout: 10000,
      verbose: null
    });
    
    // Minimal pragmas
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    
    console.log('Database connected, creating tables...');

    // CREATE ONLY ESSENTIAL TABLES FIRST
    const essentialTables = [
      `CREATE TABLE IF NOT EXISTS users (
        _id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        is_verified BOOLEAN DEFAULT 0,
        tier_id INTEGER DEFAULT 0,
        payment_status TEXT DEFAULT 'pending',
        referrer_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      `CREATE TABLE IF NOT EXISTS tiers (
        id INTEGER PRIMARY KEY,
        price REAL NOT NULL
      )`,
      
      `CREATE TABLE IF NOT EXISTS payments (
        _id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        tier_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      `CREATE TABLE IF NOT EXISTS manual_deposits (
        _id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    // Execute essential tables
    for (const tableSql of essentialTables) {
      db.exec(tableSql);
    }

    // Insert default tiers if they don't exist
    const tierCount = db.prepare('SELECT COUNT(*) as count FROM tiers').get();
    if (tierCount.count === 0) {
      console.log('Inserting default tiers...');
      const insertTier = db.prepare('INSERT INTO tiers (id, price) VALUES (?, ?)');
      
      // Only insert first 5 tiers for faster deployment
      const tierPrices = { 1: 100, 2: 200, 3: 300, 4: 400, 5: 500 };
      
      for (let i = 1; i <= 5; i++) {
        insertTier.run(i, tierPrices[i]);
      }
    }

    // Create remaining tables in background
    setTimeout(() => {
      try {
        const additionalTables = [
          `CREATE TABLE IF NOT EXISTS withdrawals (
            _id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )`,
          
          `CREATE TABLE IF NOT EXISTS admin_stats_cache (
            id INTEGER PRIMARY KEY DEFAULT 1,
            total_revenue REAL DEFAULT 0,
            last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
          )`
        ];

        for (const tableSql of additionalTables) {
          db.exec(tableSql);
        }
        
        // Insert initial admin stats cache if needed
        const cacheExists = db.prepare('SELECT * FROM admin_stats_cache WHERE id = 1').get();
        if (!cacheExists) {
          db.prepare('INSERT INTO admin_stats_cache (id) VALUES (1)').run();
        }
        
        console.log('Additional tables created in background');
      } catch (bgError) {
        console.warn('Background table creation failed:', bgError.message);
      }
    }, 1000);

    isInitialized = true;
    console.log('Database initialized successfully');
    return db;
    
  } catch (error) {
    console.error('Database initialization error:', error.message);
    throw error;
  }
};

const getDb = () => {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
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
