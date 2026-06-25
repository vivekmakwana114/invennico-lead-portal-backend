/**
 * Test script — MongoDB connection
 *
 * Checks:
 *   1. MongoDB — connects, pings server, reports DB name, version, and collections
 *
 * Usage:
 *   node scripts/test-connections.js
 *
 *   MONGODB_URL is read from .env automatically.
 */

require('dotenv').config();
const dns = require('dns');
const mongoose = require('mongoose');

dns.setServers(['8.8.8.8']);
dns.setDefaultResultOrder('ipv4first');

const PASS = '✓ PASS';
const FAIL = '✗ FAIL';
const SKIP = '⚠ SKIP';

async function checkMongoDB() {
  console.log('\n── MongoDB connection ──');

  const url = process.env.MONGODB_URL;
  if (!url) {
    console.log(`${SKIP}  MONGODB_URL not set in .env`);
    return false;
  }

  console.log(`       URL: ${url.replace(/:([^@]+)@/, ':****@')}`);

  try {
    await mongoose.connect(url, { serverSelectionTimeoutMS: 8000 });

    const admin = mongoose.connection.db.admin();
    const info = await admin.serverInfo();
    const dbName = mongoose.connection.db.databaseName;
    const collections = await mongoose.connection.db.listCollections().toArray();

    console.log(`${PASS}  Connected`);
    console.log(`       Database     : ${dbName}`);
    console.log(`       Server ver.  : ${info.version}`);
    console.log(`       Collections  : ${collections.length === 0 ? '(none yet)' : collections.map((c) => c.name).join(', ')}`);
    return true;
  } catch (err) {
    console.log(`${FAIL}  ${err.message}`);
    return false;
  } finally {
    await mongoose.disconnect();
  }
}

(async () => {
  console.log('=== MongoDB Connection Test ===');
  console.log(`Environment: ${process.env.NODE_ENV ?? 'unknown'}`);

  const ok = await checkMongoDB();

  console.log(`\n${'─'.repeat(40)}`);
  console.log(ok ? `${PASS}  Database connection ready` : `${FAIL}  Connection failed — see above`);
  process.exit(ok ? 0 : 1);
})();
