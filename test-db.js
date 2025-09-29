const { db } = require('./database');

console.log('=== CHECKING DATABASE ===');

// Check if users table exists and has data
try {
  const users = db.prepare('SELECT * FROM users').all();
  console.log('Users:', users);
} catch (error) {
  console.log('Users table error:', error.message);
}

// Check if admin user exists
try {
  const admin = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
  console.log('Admin user:', admin);
} catch (error) {
  console.log('Admin check error:', error.message);
}

// Check if withdrawals table exists
try {
  const withdrawals = db.prepare('SELECT * FROM withdrawals').all();
  console.log('Withdrawals:', withdrawals);
} catch (error) {
  console.log('Withdrawals table error:', error.message);
}