const { getDb } = require('../database');
const bcrypt = require('bcryptjs');

const initTestData = async () => {
  try {
    console.log('Initializing test data...');
    
    const db = getDb();
    
    // ONLY create admin user if it doesn't exist
    const adminExists = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
    if (!adminExists) {
      // Create admin user with your preferred credentials
      const hashedPassword = await bcrypt.hash('admin123', 10);
      db.prepare(`
        INSERT INTO users (email, username, password, is_verified, isAdmin, payment_status, tier_id)
        VALUES (?, ?, ?, 1, 1, 'paid', 1)
      `).run('admin@nova.com', 'admin', hashedPassword);
      
      console.log('Admin user created: admin / admin123');
    }
    
    console.log('Test data initialization complete');
  } catch (error) {
    console.error('Error initializing test data:', error.message);
  }
};

// Run if this script is executed directly
if (require.main === module) {
  initTestData();
}

module.exports = initTestData;