// models_mongoose/User.js

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  _id: Number,
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, unique: true, sparse: true, trim: true },
  
  // Hardened conditional logic: A password is required ONLY if there is no googleId.
  password: { 
    type: String, 
    required: function() {
      return !this.googleId;
    }
  },
  
  googleId: { type: String, unique: true, sparse: true },
  name: { type: String },
  profilePicture: { type: String },
  authProvider: { 
    type: String, 
    enum: ['local', 'google'], 
    default: 'local' 
  },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  isActive: { type: Boolean, default: true },
  lastLogin: Date
}, {
  timestamps: true 
});

// Pre-validation hook to ensure data consistency.
userSchema.pre('validate', function(next) {
  if (this.googleId) {
    this.authProvider = 'google';
  } else {
    this.authProvider = 'local';
  }
  next();
});

// Standard, error-proof way to export a Mongoose model to prevent overwrite errors.
module.exports = mongoose.models.User || mongoose.model('User', userSchema, 'users');