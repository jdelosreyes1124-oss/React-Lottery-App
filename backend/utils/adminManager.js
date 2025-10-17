const path = require('path');
const fs = require('fs').promises;
const bcrypt = require('bcryptjs');

const ADMIN_FILE = path.join(__dirname, '..', 'data', 'admins.json');

/**
 * admins.json format:
 * [
 *   { "username": "admin", "passwordHash": "<bcrypt-hash>" }
 * ]
 */
async function loadAdmins() {
  const raw = await fs.readFile(ADMIN_FILE, 'utf8');
  const list = JSON.parse(raw);
  return Array.isArray(list) ? list : [];
}

async function verify(username, password) {
  const admins = await loadAdmins();
  const record = admins.find(a => a.username === username);
  if (!record) return false;
  return bcrypt.compare(password, record.passwordHash);
}

// Helper to generate a hash (run once, then paste into admins.json):
async function hash(password) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

module.exports = { verify, hash };
