// reset-admin.js - Reset admin password
const { initDatabase, query, queryRow } = require('./database');
const bcrypt = require('bcryptjs');

async function resetAdminPassword() {
  try {
    console.log('🔄 Starting admin password reset...');
    
    // Initialize database first
    await initDatabase();
    
    const email = 'admin@novadam.com';
    const username = 'adminnovadam';
    const newPassword = '@#Conquer145@#';

    // Find the admin user
    const admin = await queryRow(
      'SELECT * FROM users WHERE username = $1 OR email = $2', 
      [username, email]
    );
    
    if (!admin) {
      console.log('❌ Admin user not found! Creating new admin...');
      // Run create-admin instead
      const createAdmin = require('./create-admin');
      await createAdmin();
      return;
    }

    console.log('🔍 Found admin user:', admin.username);
    
    // Hash new password
    console.log('🔐 Hashing new password...');
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    
    // Update admin password
    console.log('📝 Updating admin password...');
    await query(
      'UPDATE users SET password = $1 WHERE id = $2',
      [hashedPassword, admin.id]
    );

    console.log('✅ Admin password reset successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('👑 Updated Admin Account Details:');
    console.log('   ID:', admin.id);
    console.log('   Username:', admin.username);
    console.log('   Email:', admin.email);
    console.log('   New Password:', newPassword);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💡 Login with: admin@novadam.com / @#Conquer145@#');
    
  } catch (error) {
    console.error('❌ Error resetting admin password:', error.message);
  }
}

// Run the reset
if (require.main === module) {
  console.log('🚀 Starting Admin Password Reset...');
  console.log('──────────────────────────────────────────');
  
  resetAdminPassword().then(() => {
    console.log('──────────────────────────────────────────');
    console.log('✅ Password reset completed');
    setTimeout(() => {
      process.exit(0);
    }, 3000);
  }).catch(error => {
    console.error('❌ Reset failed:', error);
    process.exit(1);
  });
}

module.exports = resetAdminPassword;