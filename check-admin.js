// check-admin.js - Verify admin account
const { initDatabase, queryRow } = require('./database');
const bcrypt = require('bcryptjs');

async function checkAdmin() {
  try {
    await initDatabase();
    
    const admin = await queryRow(
      'SELECT id, email, username, password, is_admin, is_verified FROM users WHERE email = $1',
      ['admin@novadam.com']
    );

    if (!admin) {
      console.log('❌ No admin user found with email: admin@novadam.com');
      return;
    }

    console.log('🔍 Admin Account Details:');
    console.log('   ID:', admin.id);
    console.log('   Email:', admin.email);
    console.log('   Username:', admin.username);
    console.log('   Is Admin:', admin.is_admin);
    console.log('   Is Verified:', admin.is_verified);
    console.log('   Password Hash:', admin.password ? 'Exists' : 'Missing');
    
    // Test password
    const testPassword = '@#Conquer145@#';
    const isMatch = await bcrypt.compare(testPassword, admin.password);
    console.log('   Password Test (@#Conquer145@#):', isMatch ? '✅ CORRECT' : '❌ WRONG');
    
    if (!isMatch) {
      console.log('   💡 Try these common variations:');
      console.log('      - @#Conquer145@#');
      console.log('      - admin123');
      console.log('      - Check for extra spaces');
    }
    
  } catch (error) {
    console.error('Error checking admin:', error);
  }
}

checkAdmin().then(() => process.exit(0));