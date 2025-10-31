const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  _id: Number,
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, unique: true, sparse: true, trim: true },
  
  // This logic is correct and remains unchanged.
  password: { 
    type: String, 
    required: function() {
      return this.authProvider === 'local';
    }
  },
  
  // Consolidated Google OAuth and other user fields
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
  timestamps: true // Simplified timestamp option
});

// --- METHODS AND HOOKS (These were already well-implemented) ---

// Validate password for local accounts
userSchema.methods.validatePassword = async function(password) { 
  if (!this.password) return false; // No password for Google users
  return await bcrypt.compare(password, this.password); 
};

// Check if account is Google-only
userSchema.methods.isGoogleOnly = function() {
  return this.authProvider === 'google' && !this.password;
};

// Virtual for display name
userSchema.virtual('displayName').get(function() {
  return this.name || this.username;
});

// Pre-validation hook to ensure authProvider consistency
userSchema.pre('validate', function(next) {
  if (this.googleId && !this.authProvider) {
    this.authProvider = 'google';
  }
  if (this.password && !this.googleId && !this.authProvider) {
    this.authProvider = 'local';
  }
  next();
});

// Indexes for performance
userSchema.index({ email: 1 });
userSchema.index({ googleId: 1 });
userSchema.index({ username: 1 });

module.exports = mongoose.model('User', userSchema, 'users');