const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  _id: Number,  // Keep original ID from MySQL
  username: { type: String, required: true, unique: true },
  email: { type: String, unique: true, sparse: true },
  password: { type: String, required: false },  // ✅ Changed: Not required for Google users
  
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

// ✅ NEW: Pre-save hook to ensure authProvider consistency
userSchema.pre('save', function(next) {
  // If Google user, ensure authProvider is set
  if (this.googleId && !this.authProvider) {
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