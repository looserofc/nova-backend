// update-tier-prices.js - Run this to update USD to USDT
const { getDb } = require('./database');

async function updateTierPricesToUSDT() {
  try {
    console.log('🔧 Starting tier price update from USD to USDT...');
    const db = getDb();
    
    // Update payments table currency
    const paymentUpdate = db.prepare(`UPDATE payments SET currency = 'USDT' WHERE currency = 'USD' OR currency IS NULL`).run();
    console.log(`✅ Updated ${paymentUpdate.changes} payment records to USDT`);
    
    // Update tiers table currency
    const tierUpdate = db.prepare(`UPDATE tiers SET currency = 'USDT' WHERE currency = 'USD' OR currency IS NULL`).run();
    console.log(`✅ Updated ${tierUpdate.changes} tier records to USDT`);
    
    // Verify the update
    const tiers = db.prepare('SELECT id, price, currency FROM tiers').all();
    console.log('📊 Current tiers after update:');
    tiers.forEach(tier => {
      console.log(`   Tier ${tier.id}: ${tier.price} ${tier.currency}`);
    });
    
    const payments = db.prepare('SELECT COUNT(*) as count, currency FROM payments GROUP BY currency').all();
    console.log('📊 Payments currency distribution:');
    payments.forEach(p => {
      console.log(`   ${p.count} payments in ${p.currency}`);
    });
    
    console.log('🎉 Tier price update completed successfully!');
    
  } catch (error) {
    console.error('❌ Error updating tier prices:', error);
  }
}

// Run the update
updateTierPricesToUSDT();