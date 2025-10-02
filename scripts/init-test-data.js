const { getDb } = require('../database');
const bcrypt = require('bcryptjs');

const initTestData = async () => {
  try {
    console.log('=== Initializing test data ===');
    
    const db = getDb();
    
    const adminExists = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
    
    if (adminExists) {
      console.log('Admin user already exists:', adminExists.username);
      return;
    }
    
    console.log('Creating admin user...');
    
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const adminPhone = process.env.ADMIN_PHONE;
    
    if (!adminEmail || !adminUsername || !adminPassword || !adminPhone) {
      console.error('Missing required admin environment variables');
      throw new Error('Admin environment variables not configured');
    }
    
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    
    const result = db.prepare(`
      INSERT INTO users (
        email, username, phone_number, password, 
        is_verified, isAdmin, payment_status, tier_id
      )
      VALUES (?, ?, ?, ?, 1, 1, 'paid', 1)
    `).run(adminEmail, adminUsername, adminPhone, hashedPassword);
    
    console.log('Admin user created successfully');
    console.log('Username:', adminUsername);
    console.log('=== Test data initialization complete ===');
    
  } catch (error) {
    console.error('Error initializing test data:', error.message);
    throw error;
  }
};

module.exports = initTestData;
