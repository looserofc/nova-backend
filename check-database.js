const { db } = require('./database');

console.log('=== DATABASE SCHEMA CHECK ===');

// Check users table
console.log('\nUsers table columns:');
try {
  const userColumns = db.prepare("PRAGMA table_info(users)").all();
  console.table(userColumns);
} catch (error) {
  console.error('Error checking users table:', error.message);
}

// Check payments table
console.log('\nPayments table columns:');
try {
  const paymentColumns = db.prepare("PRAGMA table_info(payments)").all();
  console.table(paymentColumns);
} catch (error) {
  console.error('Error checking payments table:', error.message);
}

// Check tiers table
console.log('\nTiers table columns:');
try {
  const tierColumns = db.prepare("PRAGMA table_info(tiers)").all();
  console.table(tierColumns);
} catch (error) {
  console.error('Error checking tiers table:', error.message);
}

console.log('\n=== CURRENT DATA ===');

// Check current users
console.log('\nCurrent users:');
try {
  const users = db.prepare("SELECT _id, username, email, payment_status, tier_id FROM users").all();
  console.table(users);
} catch (error) {
  console.error('Error fetching users:', error.message);
}

// Check current payments
console.log('\nCurrent payments:');
try {
  const payments = db.prepare("SELECT * FROM payments").all();
  console.table(payments);
} catch (error) {
  console.error('Error fetching payments:', error.message);
}