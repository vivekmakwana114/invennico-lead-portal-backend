/**
 * Seed script — create or update the Super Admin user
 *
 * Usage:
 *   node scripts/seed-super-admin.js
 *
 *   Safe to re-run: updates the existing record if the email already exists.
 *   MONGODB_URL is read from .env automatically.
 */

require('dotenv').config();
const dns = require('dns');
const mongoose = require('mongoose');

dns.setServers(['8.8.8.8']);
dns.setDefaultResultOrder('ipv4first');

// ── Super Admin definition ────────────────────────────────────────────────────
const SUPER_ADMIN = {
  name: 'Super Admin',
  email: 'superadmin@invennico.com',
  password: 'Admin@1234',        // plain — hashed below before saving
  role: 'superAdmin',
  status: 'active',
  phone: '1234567898',
  department: 'Invennico',
  location: 'SARABHAI CAMPUS, Alkapuri ROAD 707, K10 Grand, B/H ATLANTIS K10 Vadodara, Gujarat 390007, IN',
  totalCredits: 115,
  consumedCredits: 0,
};
// ─────────────────────────────────────────────────────────────────────────────

async function run() {
  const url = process.env.MONGODB_URL;
  if (!url) {
    console.error('ERROR: MONGODB_URL not set in .env');
    process.exit(1);
  }

  await mongoose.connect(url, { serverSelectionTimeoutMS: 8000 });
  console.log(`Connected to: ${mongoose.connection.db.databaseName}`);

  // Load User model after mongoose connects so plugins register correctly
  const User = require('../src/models/user.model');

  const existing = await User.findOne({ email: SUPER_ADMIN.email });

  if (existing) {
    // Update all fields except password if it hasn't changed
    existing.name = SUPER_ADMIN.name;
    existing.role = SUPER_ADMIN.role;
    existing.status = SUPER_ADMIN.status;
    existing.phone = SUPER_ADMIN.phone;
    existing.department = SUPER_ADMIN.department;
    existing.location = SUPER_ADMIN.location;
    existing.totalCredits = SUPER_ADMIN.totalCredits;
    existing.password = SUPER_ADMIN.password; // triggers pre-save bcrypt hash
    await existing.save();
    console.log(`✓ Updated existing super admin: ${existing.email}  (id: ${existing._id})`);
  } else {
    // Pass plain password — the pre('save') hook hashes it automatically
    const user = await User.create({ ...SUPER_ADMIN });
    console.log(`✓ Created super admin: ${user.email}  (id: ${user._id})`);
  }

  console.log(`\nLogin credentials:`);
  console.log(`  Email    : ${SUPER_ADMIN.email}`);
  console.log(`  Password : ${SUPER_ADMIN.password}`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('FAIL:', err.message);
  mongoose.disconnect();
  process.exit(1);
});
