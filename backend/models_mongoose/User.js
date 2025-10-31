console.log("✅✅✅ LOADING NEW User.js MODEL - VERSION 2025-10-31 ✅✅✅");

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  _id: Number,
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, unique: true, sparse: true, trim: true },
  
  // This is your correct conditional logic.
  password: { 
    type: String, 
    required: function() {
      // Password is only required if the authProvider is 'local'.
      return this.authProvider === 'local';
    }
  },
  
  // Consolidated Google OAuth and user fields (duplicates removed).
  googleId: { type: String, unique: true, sparse: true },
  name: { type: String }, // For Google user's full name
  profilePicture: { type: String },
  authProvider: { 
    type: String, 
    enum: ['local', 'google'], 
    default: 'local' 
  },
  
  // Standard user fields
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  isActive: { type: Boolean, default: true },
  lastLogin: Date,
  createdBy: { type: Number, ref: 'User' },
  passwordChangedAt: Date
}, {
  timestamps: true 
});

// --- METHODS AND HOOKS ---

userSchema.methods.validatePassword = async function(password) { 
  if (!this.password) return false;
  return await bcrypt.compare(password, this.password); 
};

userSchema.pre('validate', function(next) {
  if (this.googleId) {
    this.authProvider = 'google';
  }
  next();
});

module.exports = mongoose.model('User', userSchema, 'users');