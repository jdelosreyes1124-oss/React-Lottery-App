const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  _id: Number,  // Keep original ID from MySQL
  username: { type: String, required: true, unique: true },
  email: { type: String, unique: true, sparse: true },
  password: { 
    type: String, 
    // ✅ FIX: Make the password conditionally required
    required: function() {
      // Password is NOT required if the user signs in with Google.
      // We check for the presence of a googleId or if the authProvider is 'google'.
      return !(this.googleId || this.authProvider === 'google');
    }
  },
  
  // ... Google OAuth fields and other existing fields ...
  googleId: { type: String, unique: true, sparse: true },
  authProvider: { 
    type: String, 
    enum: ['local', 'google'], 
    default: 'local' 
  },
  
  // ✅ NEW: Google OAuth fields
  googleId: { type: String, unique: true, sparse: true },
  name: { type: String },
  profilePicture: { type: String },
  authProvider: { 
    type: String, 
    enum: ['local', 'google'], 
    default: 'local' 
  },
  
  // Existing fields
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  isActive: { type: Boolean, default: true },
  lastLogin: Date,
  
  // Additional fields that might be useful
  createdBy: { type: Number, ref: 'User' },
  passwordChangedAt: Date
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
});

// Existing method
userSchema.methods.validatePassword = async function(password) { 
  const bcrypt = require('bcryptjs'); 
  if (!this.password) return false; // No password for Google users
  return await bcrypt.compare(password, this.password); 
};

// ✅ NEW: Method to check if account is Google-only
userSchema.methods.isGoogleOnly = function() {
  return this.authProvider === 'google' && !this.password;
};

// ✅ NEW: Virtual for display name
userSchema.virtual('displayName').get(function() {
  return this.name || this.username;
});

// ✅ NEW: Pre-validate hook to ensure authProvider consistency
// IMPORTANT: Use 'validate' hook to run BEFORE validation
userSchema.pre('validate', function(next) {
  // If Google user, ensure authProvider is set
  if (this.googleId) {
    this.authProvider = 'google';
  }
  
  // If traditional user, ensure authProvider is local
  if (this.password && !this.googleId && !this.authProvider) {
    this.authProvider = 'local';
  }
  
  next();
});

// ✅ NEW: Indexes for performance
userSchema.index({ email: 1 });
userSchema.index({ googleId: 1 });
userSchema.index({ username: 1 });

module.exports = mongoose.model('User', userSchema, 'users');