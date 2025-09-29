// create-admin.js - MANUAL ADMIN CREATION ONLY
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

async function createAdminUser() {
  let pool;
  
  try {
    console.log('🔄 Starting manual admin creation...');
    
    // Create direct database connection
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    const client = await pool.connect();
    console.log('✅ Connected to database');

    // Your admin credentials - CHANGE THESE AS NEEDED
    const email = process.env.ADMIN_EMAIL || 'admin@novadam.com';
    const username = process.env.ADMIN_USERNAME || 'adminnovadam';
    const password = process.env.ADMIN_PASSWORD || '@#Conquer145@#'; // Change this to your preferred password
    const phone = process.env.ADMIN_PHONE || '+923359140077';

    // Check if admin already exists
    const adminExists = await client.query(
      'SELECT * FROM users WHERE username = $1 OR email = $2', 
      [username, email]
    );
    
    if (adminExists.rows.length > 0) {
      console.log('❌ Admin user already exists!');
      console.log('   Username:', adminExists.rows[0].username);
      console.log('   Email:', adminExists.rows[0].email);
      console.log('💡 If you want fresh admin, run: node reset-database.js first');
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);
    console.log('🔐 Password hashed successfully');

    // Insert admin user
    const result = await client.query(
      `INSERT INTO users (email, username, phone_number, password, is_verified, is_admin, payment_status, tier_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, username, email`,
      [email, username, phone, hashedPassword, true, true, 'paid', 1]
    );

    const newAdmin = result.rows[0];
    
    console.log('🎉 Admin user created successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('👑 Admin Account Details:');
    console.log('   ID:', newAdmin.id);
    console.log('   Username:', newAdmin.username);
    console.log('   Email:', newAdmin.email);
    console.log('   Password:', password);
    console.log('   Phone:', phone);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔗 Admin Panel: http://localhost:3000/#admin');
    
    client.release();
    
  } catch (error) {
    console.error('❌ Error creating admin user:', error.message);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

// Only run if called directly
if (require.main === module) {
  createAdminUser().then(() => {
    console.log('✅ Admin creation process completed');
    process.exit(0);
  });
}

module.exports = createAdminUser;