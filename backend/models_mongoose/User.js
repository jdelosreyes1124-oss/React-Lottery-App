const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  _id: Number,  // Keep original ID from MySQL
  username: { type: String, required: true, unique: true },
  email: { type: String, unique: true, sparse: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  isActive: { type: Boolean, default: true },
  lastLogin: Date
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
});

userSchema.methods.validatePassword = async function(password) { const bcrypt = require('bcryptjs'); return await bcrypt.compare(password, this.password); };

module.exports = mongoose.model('User', userSchema, 'users');