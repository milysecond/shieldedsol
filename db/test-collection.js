import 'dotenv/config';
import { saveTvlSnapshot, savePoolBalance, saveTokenPrice, getLatestTvlByProtocol } from './client.js';

async function testDataCollection() {
  console.log('🔄 Testing data collection...\n');

  const timestamp = new Date().toISOString();

  try {
    // Save some test data
    console.log('Saving test token prices...');
    await saveTokenPrice(timestamp, 'SOL', 180.50);
    await saveTokenPrice(timestamp, 'BONK', 0.000025);

    console.log('Saving test TVL snapshots...');
    await saveTvlSnapshot(timestamp, 'Privacy Cash', 150000);
    await saveTvlSnapshot(timestamp, 'Elusiv', 25000);

    console.log('Saving test pool balances...');
    await savePoolBalance(timestamp, 'Privacy Cash', 'SOL', 'test-address-1', 500, 90250);
    await savePoolBalance(timestamp, 'Privacy Cash', 'USDC', 'test-address-2', 50000, 50000);

    console.log('\n✅ Test data saved successfully!\n');

    // Verify the data
    console.log('📊 Verifying data...\n');
    const latestTvl = await getLatestTvlByProtocol();

    console.log('💰 Latest TVL by Protocol:');
    console.log('===========================');
    latestTvl.forEach(row => {
      console.log(`${row.protocol_name}: $${Math.floor(row.tvl_usd).toLocaleString()}`);
    });
    console.log(`\nTimestamp: ${timestamp}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testDataCollection();
