// // create-migration.js - Run this script to update your existing database
// const { getDb } = require('./database');

// async function migrateDatabase() {
//   try {
//     console.log('Starting database migration...');
//     const db = getDb();
    
//     // Add new columns to payments table
//     try {
//       console.log('Adding new columns to payments table...');
      
//       // Check if columns already exist
//       const tableInfo = db.prepare("PRAGMA table_info(payments)").all();
//       const existingColumns = tableInfo.map(col => col.name);
      
//       const newColumns = [
//         { name: 'order_id', type: 'TEXT' },
//         { name: 'payment_url', type: 'TEXT' },
//         { name: 'pay_address', type: 'TEXT' },
//         { name: 'pay_amount', type: 'REAL' },
//         { name: 'pay_currency', type: 'TEXT' },
//         { name: 'outcome_amount', type: 'REAL' },
//         { name: 'outcome_currency', type: 'TEXT' }
//       ];
      
//       for (const column of newColumns) {
//         if (!existingColumns.includes(column.name)) {
//           db.exec(`ALTER TABLE payments ADD COLUMN ${column.name} ${column.type}`);
//           console.log(`Added column: ${column.name}`);
//         } else {
//           console.log(`Column ${column.name} already exists`);
//         }
//       }
      
//       // Update currency column default
//       try {
//         db.exec(`UPDATE payments SET currency = 'USDT' WHERE currency = 'USDT' OR currency IS NULL`);
//         console.log('Updated currency values to USDT');
//       } catch (updateError) {
//         console.log('Currency update not needed or already done');
//       }
      
//     } catch (error) {
//       console.error('Error migrating payments table:', error);
//     }  
//   } catch (error) {
//     console.error('Database migration failed:', error);
//   }