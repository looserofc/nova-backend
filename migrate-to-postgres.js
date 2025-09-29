const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { Pool } = require('pg');

// Configuration
const SQLITE_DB_PATH = path.join(__dirname, 'nova.db');
const BATCH_SIZE = 100; // Process records in batches

class DatabaseMigrator {
  constructor() {
    this.sqliteDb = null;
    this.pgPool = null;
    this.migrationLog = [];
  }

  async initialize() {
    try {
      // Initialize SQLite connection
      if (fs.existsSync(SQLITE_DB_PATH)) {
        this.sqliteDb = new Database(SQLITE_DB_PATH, { readonly: true });
        console.log('✅ SQLite database connected');
      } else {
        throw new Error('SQLite database file not found at: ' + SQLITE_DB_PATH);
      }

      // Initialize PostgreSQL connection
      this.pgPool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || 'novadam_db',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });

      // Test PostgreSQL connection
      const client = await this.pgPool.connect();
      await client.query('SELECT NOW()');
      client.release();
      console.log('✅ PostgreSQL database connected');

    } catch (error) {
      console.error('❌ Database initialization failed:', error.message);
      throw error;
    }
  }

  async migrateTable(tableName, sqliteQuery, postgresQuery, transformFn = null) {
    try {
      console.log(`\n📦 Starting migration for table: ${tableName}`);
      
      // Get data from SQLite
      const sqliteData = this.sqliteDb.prepare(sqliteQuery).all();
      console.log(`   Found ${sqliteData.length} records in SQLite`);
      
      if (sqliteData.length === 0) {
        console.log(`   ⚠️ No data to migrate for ${tableName}`);
        return;
      }

      // Clear existing data in PostgreSQL (optional - comment out if you want to keep existing data)
      await this.pgPool.query(`DELETE FROM ${tableName}`);
      console.log(`   🗑️ Cleared existing data in PostgreSQL ${tableName} table`);

      // Process data in batches
      let migratedCount = 0;
      for (let i = 0; i < sqliteData.length; i += BATCH_SIZE) {
        const batch = sqliteData.slice(i, i + BATCH_SIZE);
        
        for (const row of batch) {
          try {
            // Transform data if needed
            const transformedRow = transformFn ? transformFn(row) : row;
            
            // Insert into PostgreSQL
            await this.pgPool.query(postgresQuery, Object.values(transformedRow));
            migratedCount++;
            
          } catch (error) {
            console.error(`   ❌ Failed to migrate row for ${tableName}:`, error.message);
            this.migrationLog.push({
              table: tableName,
              error: error.message,
              row: row
            });
          }
        }
        
        console.log(`   📊 Progress: ${Math.min(i + BATCH_SIZE, sqliteData.length)}/${sqliteData.length} records processed`);
      }

      console.log(`   ✅ Successfully migrated ${migratedCount}/${sqliteData.length} records for ${tableName}`);
      
    } catch (error) {
      console.error(`   ❌ Migration failed for table ${tableName}:`, error.message);
      throw error;
    }
  }

  // Transform functions for data conversion
  transformUser(row) {
    return {
      ...row,
      id: row._id, // Convert _id to id
      is_verified: row.is_verified ? true : false,
      is_admin: row.isAdmin ? true : false, // Convert isAdmin to is_admin
      locked_balance: parseFloat(row.locked_balance || 0),
      withdrawable_balance: parseFloat(row.withdrawable_balance || 0),
      total_earnings: parseFloat(row.total_earnings || 0),
      total_withdrawal: parseFloat(row.total_withdrawal || 0),
      daily_earnings: parseFloat(row.daily_earnings || 0)
    };
  }

  transformDeposit(row) {
    return {
      ...row,
      id: row._id,
      amount: parseFloat(row.amount),
      status: row.status || 'pending'
    };
  }

  transformWithdrawal(row) {
    return {
      ...row,
      id: row._id,
      amount: parseFloat(row.amount)
    };
  }

  transformPayment(row) {
    return {
      ...row,
      id: row._id,
      amount: parseFloat(row.amount)
    };
  }

  transformRevenueTracking(row) {
    return {
      ...row,
      id: row._id,
      amount: parseFloat(row.amount)
    };
  }

  transformAnnouncement(row) {
    return {
      ...row,
      id: row._id,
      is_active: row.is_active ? true : false
    };
  }

  async runMigration() {
    try {
      console.log('🚀 Starting database migration from SQLite to PostgreSQL...\n');

      await this.initialize();

      // Migrate users table (excluding _id, converting isAdmin to is_admin)
      await this.migrateTable(
        'users',
        `SELECT email, username, phone_number, password, is_verified, tier_id, payment_status, 
                payment_tx_id, wallet_network, wallet_address, locked_balance, withdrawable_balance,
                total_earnings, total_withdrawal, ad_views_today, last_ad_reward_date, daily_earnings,
                last_daily_reset, isAdmin as is_admin, referrer_id, created_at, updated_at,
                verification_token, token_expiry FROM users`,
        `INSERT INTO users (email, username, phone_number, password, is_verified, tier_id, payment_status,
                           payment_tx_id, wallet_network, wallet_address, locked_balance, withdrawable_balance,
                           total_earnings, total_withdrawal, ad_views_today, last_ad_reward_date, daily_earnings,
                           last_daily_reset, is_admin, referrer_id, created_at, updated_at,
                           verification_token, token_expiry) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)`
      );

      // Migrate manual_deposits table
      try {
        await this.migrateTable(
          'manual_deposits',
          `SELECT user_id, tier_id, amount, network, transaction_id, status, admin_notes,
                  created_at, updated_at, approved_by, approved_at FROM manual_deposits`,
          `INSERT INTO manual_deposits (user_id, tier_id, amount, network, transaction_id, status, admin_notes,
                                       created_at, updated_at, approved_by, approved_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          this.transformDeposit
        );
      } catch (error) {
        console.log('⚠️ Manual deposits table not found in SQLite, skipping...');
      }

      // Migrate withdrawals table
      try {
        await this.migrateTable(
          'withdrawals',
          `SELECT user_id, amount, network, wallet_address, status, rejection_reason,
                  created_at, updated_at FROM withdrawals`,
          `INSERT INTO withdrawals (user_id, amount, network, wallet_address, status, rejection_reason,
                                   created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          this.transformWithdrawal
        );
      } catch (error) {
        console.log('⚠️ Withdrawals table not found in SQLite, skipping...');
      }

      // Migrate payments table (legacy)
      try {
        await this.migrateTable(
          'payments',
          `SELECT user_id, tier_id, amount, currency, status, tx_id, created_at, updated_at FROM payments`,
          `INSERT INTO payments (user_id, tier_id, amount, currency, status, tx_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          this.transformPayment
        );
      } catch (error) {
        console.log('⚠️ Payments table not found in SQLite, skipping...');
      }

      // Migrate revenue_tracking table
      try {
        await this.migrateTable(
          'revenue_tracking',
          `SELECT user_id, tier_id, amount, transaction_type, status, created_at FROM revenue_tracking`,
          `INSERT INTO revenue_tracking (user_id, tier_id, amount, transaction_type, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          this.transformRevenueTracking
        );
      } catch (error) {
        console.log('⚠️ Revenue tracking table not found in SQLite, skipping...');
      }

      // Migrate announcements table
      try {
        await this.migrateTable(
          'announcements',
          `SELECT title, content, is_active, created_by, created_at, updated_at FROM announcements`,
          `INSERT INTO announcements (title, content, is_active, created_by, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          this.transformAnnouncement
        );
      } catch (error) {
        console.log('⚠️ Announcements table not found in SQLite, skipping...');
      }

      // Migrate user_announcement_views table
      try {
        await this.migrateTable(
          'user_announcement_views',
          `SELECT user_id, announcement_id, viewed_at FROM user_announcement_views`,
          `INSERT INTO user_announcement_views (user_id, announcement_id, viewed_at)
           VALUES ($1, $2, $3)`
        );
      } catch (error) {
        console.log('⚠️ User announcement views table not found in SQLite, skipping...');
      }

      // Update sequences for auto-increment fields
      await this.updateSequences();

      // Verify migration
      await this.verifyMigration();

      console.log('\n🎉 Database migration completed successfully!');
      
      if (this.migrationLog.length > 0) {
        console.log(`⚠️ ${this.migrationLog.length} errors encountered during migration:`);
        this.migrationLog.forEach(log => {
          console.log(`   - ${log.table}: ${log.error}`);
        });
      }

    } catch (error) {
      console.error('\n❌ Migration failed:', error.message);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  async updateSequences() {
    try {
      console.log('\n🔄 Updating PostgreSQL sequences...');
      
      const tables = ['users', 'payments', 'manual_deposits', 'withdrawals', 'revenue_tracking', 'announcements', 'user_announcement_views'];
      
      for (const table of tables) {
        try {
          await this.pgPool.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE(MAX(id), 0) + 1, false) FROM ${table}`);
          console.log(`   ✅ Updated sequence for ${table}`);
        } catch (error) {
          console.log(`   ⚠️ Could not update sequence for ${table}: ${error.message}`);
        }
      }
    } catch (error) {
      console.error('Error updating sequences:', error.message);
    }
  }

  async verifyMigration() {
    try {
      console.log('\n🔍 Verifying migration...');
      
      const userCount = await this.pgPool.query('SELECT COUNT(*) FROM users');
      console.log(`   📊 Users migrated: ${userCount.rows[0].count}`);
      
      const depositCount = await this.pgPool.query('SELECT COUNT(*) FROM manual_deposits');
      console.log(`   📊 Manual deposits migrated: ${depositCount.rows[0].count}`);
      
      const withdrawalCount = await this.pgPool.query('SELECT COUNT(*) FROM withdrawals');
      console.log(`   📊 Withdrawals migrated: ${withdrawalCount.rows[0].count}`);
      
    } catch (error) {
      console.error('Verification failed:', error.message);
    }
  }

  async cleanup() {
    try {
      if (this.sqliteDb) {
        this.sqliteDb.close();
        console.log('🗄️ SQLite connection closed');
      }
      
      if (this.pgPool) {
        await this.pgPool.end();
        console.log('🗄️ PostgreSQL connection closed');
      }
    } catch (error) {
      console.error('Cleanup error:', error.message);
    }
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  const migrator = new DatabaseMigrator();
  migrator.runMigration()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = DatabaseMigrator;