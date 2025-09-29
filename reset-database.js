// reset-database.js - CLEAN DATABASE ONLY (NO ADMIN CREATION)
require('dotenv').config();
const { Pool } = require('pg');

async function resetDatabase() {
  let pool;
  
  try {
    console.log('💥 COMPLETE DATABASE CLEANUP - DELETING ALL DATA...');
    
    // Create direct database connection
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    const client = await pool.connect();
    console.log('✅ Connected to database');

    // Delete all data in correct order to avoid foreign key constraints
    console.log('🗑️  Cleaning all tables...');
    
    await client.query('DELETE FROM user_announcement_views');
    console.log('✅ Cleared user_announcement_views');
    
    await client.query('DELETE FROM announcements');
    console.log('✅ Cleared announcements');
    
    await client.query('DELETE FROM revenue_tracking');
    console.log('✅ Cleared revenue_tracking');
    
    await client.query('DELETE FROM withdrawals');
    console.log('✅ Cleared withdrawals');
    
    await client.query('DELETE FROM manual_deposits');
    console.log('✅ Cleared manual_deposits');
    
    await client.query('DELETE FROM payments');
    console.log('✅ Cleared payments');
    
    await client.query('DELETE FROM admin_stats_cache');
    console.log('✅ Cleared admin_stats_cache');
    
    // Delete ALL users (including any admin)
    const deleteResult = await client.query('DELETE FROM users');
    console.log(`✅ Deleted ${deleteResult.rowCount} users`);

    // Reset all sequences
    await client.query("SELECT setval('users_id_seq', 1, false)");
    await client.query("SELECT setval('manual_deposits_id_seq', 1, false)");
    await client.query("SELECT setval('withdrawals_id_seq', 1, false)");
    await client.query("SELECT setval('revenue_tracking_id_seq', 1, false)");
    await client.query("SELECT setval('announcements_id_seq', 1, false)");
    await client.query("SELECT setval('user_announcement_views_id_seq', 1, false)");
    await client.query("SELECT setval('payments_id_seq', 1, false)");
    console.log('✅ Reset all sequences');

    // Verify the database is empty
    const userCount = await client.query('SELECT COUNT(*) as count FROM users');
    console.log(`📊 Total users in database: ${userCount.rows[0].count}`);

    client.release();
    
    console.log('🎉 DATABASE COMPLETELY CLEANED!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💡 Database is now empty.');
    console.log('💡 You can create admin manually using: node create-admin.js');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
  } catch (error) {
    console.error('❌ Reset error:', error.message);
  } finally {
    if (pool) {
      await pool.end();
      console.log('🔌 Database connection closed');
    }
  }
}

resetDatabase().then(() => {
  console.log('✅ Database cleanup completed!');
  process.exit(0);
});