// Add this log to be 100% certain the file is updated
console.log("✅✅✅ USER.JS MODEL - VERSION FINAL-FIX ✅✅✅");

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  _id: Number,
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, unique: true, sparse: true, trim: true },
  
  // ✅ FINAL FIX: Simplified and hardened the conditional logic.
  password: { 
    type: String, 
    required: function() {
      // A password is required ONLY if the user does NOT have a googleId.
      return !this.googleId;
    }
  },
  
  // Consolidated Google OAuth and user fields.
  googleId: { type: String, unique: true, sparse: true },
  name: { type: String },
  profilePicture: { type: String },
  authProvider: { 
    type: String, 
    enum: ['local', 'google'], 
    default: 'local' 
  },
  
  // Standard user fields
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  isActive: { type: Boolean, default: true },
  lastLogin: Date
}, {
  timestamps: true 
});

// Pre-validation hook to ensure authProvider is set correctly.
userSchema.pre('validate', function(next) {
  if (this.googleId) {
    this.authProvider = 'google';
  } else {
    this.authProvider = 'local';
  }
  next();
});

// This is the standard, error-proof way to export a Mongoose model.
module.exports = mongoose.models.User || mongoose.model('User', userSchema, 'users');