// fix-admin-password.js - Reset admin password directly
const { initDatabase, query } = require('./database');
const bcrypt = require('bcryptjs');

async function fixAdminPassword() {
  try {
    await initDatabase();
    
    const adminEmail = 'admin@novadam.com';
    const newPassword = '@#Conquer145@#';
    
    console.log('🔐 Resetting admin password...');
    console.log('   Email:', adminEmail);
    console.log('   New Password:', newPassword);
    
    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    
    // Update the admin password
    const result = await query(
      'UPDATE users SET password = $1 WHERE email = $2 RETURNING id, username',
      [hashedPassword, adminEmail]
    );
    
    if (result.rows.length === 0) {
      console.log('❌ Admin user not found!');
      return;
    }
    
    console.log('✅ Admin password reset successfully!');
    console.log('   User:', result.rows[0].username);
    console.log('   New Password:', newPassword);
    console.log('💡 Now try logging in with:');
    console.log('   Email: admin@novadam.com');
    console.log('   Password: @#Conquer145@#');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the fix
fixAdminPassword().then(() => {
  console.log('✅ Password fix completed');
  process.exit(0);
});