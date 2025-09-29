const { getDb } = require('./database');

function fixDatabaseSchema() {
  try {
    const db = getDb();
    
    console.log('Adding missing columns to users table...');
    
    // Check if columns exist and add them if they don't
    const columnsToAdd = [
      { name: 'daily_earnings', type: 'REAL DEFAULT 0' },
      { name: 'last_daily_reset', type: 'DATE' }
    ];
    
    columnsToAdd.forEach(column => {
      try {
        // Try to select from the column - if it fails, the column doesn't exist
        db.prepare(`SELECT ${column.name} FROM users LIMIT 1`).get();
        console.log(`Column ${column.name} already exists`);
      } catch (error) {
        if (error.message.includes('no such column')) {
          // Column doesn't exist, so add it
          console.log(`Adding column ${column.name}...`);
          db.prepare(`ALTER TABLE users ADD COLUMN ${column.name} ${column.type}`).run();
          console.log(`Column ${column.name} added successfully`);
        } else {
          throw error;
        }
      }
    });
    
    console.log('Database schema fix completed!');
    
  } catch (error) {
    console.error('Error fixing database schema:', error);
  }
}

// Run if called directly
if (require.main === module) {
  const { initDatabase } = require('./database');
  
  async function run() {
    await initDatabase();
    fixDatabaseSchema();
    process.exit(0);
  }
  
  run();
}

module.exports = fixDatabaseSchema;