// clean-database.js - Clean database and start fresh
const { initDatabase, query } = require('./database');

async function cleanDatabase() {
  try {
    console.log('🔄 Cleaning database...');
    await initDatabase();
    
    // Delete all users except keep one if needed
    const result = await query('DELETE FROM users WHERE email != $1', ['admin@novadam.com']);
    console.log(`✅ Deleted ${result.rowCount} users`);
    
    // Reset sequences if needed
    await query("SELECT setval('users_id_seq', (SELECT MAX(id) FROM users))");
    
    console.log('✅ Database cleaned successfully!');
    console.log('💡 Only admin@novadam.com remains (if it exists)');
    
  } catch (error) {
    console.error('❌ Error cleaning database:', error.message);
  }
}

cleanDatabase().then(() => {
  console.log('✅ Cleanup completed');
  process.exit(0);
});