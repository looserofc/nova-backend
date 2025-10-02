const { getDb } = require('../database');
const bcrypt = require('bcryptjs');

const initTestData = async () => {
  try {
    console.log('=== Initializing test data ===');
    
    const db = getDb();
    
    // Check if admin exists
    const adminExists = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
    
    if (adminExists) {
      console.log('Admin user already exists:', adminExists.username);
      return;
    }
    
    console.log('Creating admin user...');
    
    // Get credentials from environment with validation
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const adminPhone = process.env.ADMIN_PHONE;
    
    // Validate all required variables are set
    if (!adminEmail || !adminUsername || !adminPassword || !adminPhone) {
      console.error('❌ Missing required admin environment variables:');
      console.error('   ADMIN_EMAIL:', adminEmail ? '✓' : '✗');
      console.error('   ADMIN_USERNAME:', adminUsername ? '✓' : '✗');
      console.error('   ADMIN_PASSWORD:', adminPassword ? '✓' : '✗');
      console.error('   ADMIN_PHONE:', adminPhone ? '✓' : '✗');
      throw new Error('Admin environment variables not configured');
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    
    // Create admin user
    const result = db.prepare(`
      INSERT INTO users (
        email, username, phone_number, password, 
        is_verified, isAdmin, payment_status, tier_id
      )
      VALUES (?, ?, ?, ?, 1, 1, 'paid', 1)
    `).run(adminEmail, adminUsername, adminPhone, hashedPassword);
    
    console.log('✅ Admin user created successfully!');
    console.log('   ID:', result.lastInsertRowid);
    console.log('   Username:', adminUsername);
    console.log('   Email:', adminEmail);
    console.log('   Password:', '[HIDDEN]');
    console.log('=== Test data initialization complete ===');
    
  } catch (error) {
    console.error('❌ Error initializing test data:', error.message);
    console.error('Stack:', error.stack);
    throw error;
  }
};

module.exports = initTestData;
