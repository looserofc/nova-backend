const { getDb, initDatabase } = require('./database');

async function updateSchema() {
  try {
    await initDatabase();
    const db = getDb();
    
    console.log('Updating database schema...');
    
    // Add missing columns to users table
    db.exec(`
      ALTER TABLE users ADD COLUMN verification_token TEXT;
      ALTER TABLE users ADD COLUMN token_expiry DATETIME;
      ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT 0;
    `);
    
    console.log('Schema updated successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error updating schema:', error);
    process.exit(1);
  }
}

updateSchema();