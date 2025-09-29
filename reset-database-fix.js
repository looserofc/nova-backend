const fs = require('fs');
const path = require('path');
const { closeDatabase } = require('./database');

async function resetDatabase() {
  try {
    console.log('Resetting database to fix schema...');
    
    // Close current connection if it exists
    closeDatabase();
    
    // Delete database file
    const dbPath = path.join(__dirname, 'nova.db');
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
      console.log('Database file deleted');
    }
    
    console.log('Database reset complete! Restart the server to recreate with new schema.');
    
  } catch (error) {
    console.error('Error resetting database:', error);
  }
}

// Run if called directly
if (require.main === module) {
  resetDatabase();
}

module.exports = resetDatabase;