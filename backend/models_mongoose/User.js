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
      // For Google OAuth users, password is not required
      return !this.googleId && this.authProvider !== 'google';
    },
    validate: {
      validator: function(v) {
        // If googleId exists, password validation is skipped
        if (this.googleId || this.authProvider === 'google') {
          return true;
        }
        // For local users, password must exist
        return v && v.length > 0;
      },
      message: 'Password is required for local authentication'
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
// CRITICAL FIX: Set authProvider BEFORE validation runs
userSchema.pre('validate', function(next) {
  // Ensure authProvider is set correctly based on googleId
  if (this.googleId) {
    this.authProvider = 'google';
    // Mark password as not required for this validation
    this.$locals.skipPasswordValidation = true;
  } else if (!this.authProvider) {
    this.authProvider = 'local';
  }
  next();
});

// Hash password before saving (only for local auth)
userSchema.pre('save', async function(next) {
  // Only hash password if it's modified and exists
  if (this.isModified('password') && this.password) {
    try {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Force model recompilation to ensure updated schema is used
// Delete any cached model to prevent using old schema
delete mongoose.models.User;
delete mongoose.connection.models.User;

module.exports = mongoose.model('User', userSchema, 'users');