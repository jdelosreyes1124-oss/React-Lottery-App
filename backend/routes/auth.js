// routes/auth.js - FIXED VERSION WITH CONSISTENT USERNAME CHECKING

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');

// Direct, explicit import of the User model.
const User = require('../models_mongoose/User');
const dbService = require('../services/databaseService');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ============================================
// HELPER FUNCTION FOR CONSISTENT NORMALIZATION
// ============================================
const normalizeUsername = (username) => {
  if (!username) return '';
  return username.toLowerCase().trim();
};

const normalizeEmail = (email) => {
  if (!email) return '';
  return email.toLowerCase().trim();
};

// ============================================
// USERNAME CHECK ENDPOINT - FIXED
// ============================================
router.get('/check-username', async (req, res) => {
  try {
    const { username } = req.query;
    
    console.log('[CHECK-USERNAME] Request:', username);
    
    if (!username || username.length < 3) {
      return res.json({ 
        available: false,
        message: 'Username must be at least 3 characters'
      });
    }
    
    // Use SAME normalization as registration
    const normalizedUsername = normalizeUsername(username);
    const existingUser = await User.findOne({ 
      username: normalizedUsername
    });
    
    console.log(`[CHECK-USERNAME] "${username}" (normalized: "${normalizedUsername}") -> ${existingUser ? 'EXISTS' : 'AVAILABLE'}`);
    
    return res.json({ 
      available: !existingUser,
      message: existingUser ? 'Username already taken' : 'Username available'
    });
  } catch (error) {
    console.error('[CHECK-USERNAME ERROR]', error);
    res.status(500).json({ 
      available: false,
      message: 'Unable to check username availability'
    });
  }
});

// POST /api/auth/google/register - Google OAuth Registration (WITH DEBUG LOGGING)
router.post('/google/register', async (req, res) => {
  try {
    console.log('🔵 Google registration request received');
    console.log('📦 Request body:', JSON.stringify(req.body, null, 2));
    console.log('🔑 Token exists:', !!req.body.token);
    console.log('👤 Username:', req.body.username);
    
    const { token, username } = req.body;
    
    // Validate token
    if (!token) {
      console.error('❌ Missing token');
      return res.status(400).json({ 
        success: false, 
        error: 'Google token is required' 
      });
    }

    // Validate username
    if (!username) {
      console.error('❌ Missing username');
      return res.status(400).json({ 
        success: false, 
        error: 'Username is required for Google registration' 
      });
    }

    if (username.length < 3) {
      console.error('❌ Username too short:', username.length);
      return res.status(400).json({ 
        success: false, 
        error: 'Username must be at least 3 characters' 
      });
    }

    console.log('✅ Validation passed, verifying Google token...');
    
    // Verify Google token
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId, email_verified } = payload;

    console.log(`✅ Google token verified for: ${email}`);
    
    if (!email_verified) {
      console.error('❌ Email not verified by Google');
      return res.status(403).json({ 
        success: false, 
        error: 'Email not verified by Google' 
      });
    }

    // Normalize username and email
    const normalizedUsername = normalizeUsername(username);
    const normalizedEmail = normalizeEmail(email);

    // Check if email already exists WITH COMPLETE REGISTRATION
    console.log('🔍 Checking for existing user with email:', normalizedEmail);
    let existingUser = await User.findOne({ 
      $or: [
        { email: normalizedEmail }, 
        { googleId: googleId }
      ] 
    });

    if (existingUser) {
      // ✅ FIX: Check if this is a complete registration
      if (existingUser.username && existingUser.isActive) {
        console.log('❌ User already fully registered with this Google account');
        return res.status(409).json({ 
          success: false, 
          error: 'This Google account is already registered. Please login instead.' 
        });
      }
      
      // Update incomplete registration
      console.log('🔄 Completing partial registration...');
      existingUser.username = normalizedUsername;
      existingUser.name = name;
      existingUser.profilePicture = picture;
      existingUser.isActive = true;
      existingUser.lastLogin = new Date();
      
      await existingUser.save({ validateModifiedOnly: true });
      console.log(`✅ Completed registration for: ${normalizedUsername}`);
      
    } else {
      // Check if username is already taken
      console.log('🔍 Checking if username is available:', normalizedUsername);
      const usernameExists = await User.findOne({ username: normalizedUsername });
      
      if (usernameExists) {
        console.log('❌ Username already taken:', normalizedUsername);
        return res.status(409).json({ 
          success: false, 
          error: 'Username already taken. Please choose a different username.' 
        });
      }

      // Get next user ID
      const lastUser = await User.findOne().sort({ _id: -1 });
      const nextId = lastUser ? lastUser._id + 1 : 1;

      // Create new user
      console.log('✅ Creating new Google user...');
      existingUser = await User.create({
        _id: nextId,
        username: normalizedUsername,
        email: normalizedEmail,
        googleId: googleId,
        name: name,
        profilePicture: picture,
        authProvider: 'google',
        role: 'user',
        isActive: true,
        lastLogin: new Date()
      });
      
      console.log(`✅ New Google user created: ${normalizedUsername}`);
    }

    // Create session
    req.session.userId = existingUser._id.toString();
    req.session.user = { 
      id: existingUser._id.toString(), 
      username: existingUser.username, 
      role: existingUser.role, 
      authMethod: 'google',
      email: existingUser.email,
      name: existingUser.name,
      profilePicture: existingUser.profilePicture
    };

    // Save session
    await new Promise((resolve, reject) => {
      req.session.save(err => err ? reject(err) : resolve());
    });
    
    console.log(`✅ Session saved for Google user: ${existingUser.username}`);

    // Send success response
    res.json({ 
      success: true, 
      message: 'Registration successful with Google', 
      user: req.session.user 
    });

  } catch (error) {
    console.error('❌ Google registration error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Google registration failed', 
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// POST /api/auth/google - Google OAuth Login (FIXED)
router.post('/google', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ 
        success: false, 
        message: 'Google token is required' 
      });
    }

    console.log('🔍 Google OAuth login attempt...');
    
    // Verify Google token
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId, email_verified } = payload;

    console.log(`✅ Google token verified for: ${email}`);
    
    if (!email_verified) {
      return res.status(403).json({ 
        success: false, 
        message: 'Email not verified by Google' 
      });
    }

    const normalizedEmail = normalizeEmail(email);

    // Search for existing user by email or googleId
    let user = await User.findOne({ 
      $or: [
        { email: normalizedEmail }, 
        { googleId: googleId }
      ] 
    });

    // ❌ CRITICAL FIX: Don't create users during login - return error instead
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'No account found with this Google account. Please register first.',
        error: 'USER_NOT_FOUND'
      });
    }

    // ✅ User exists - update their info and log them in
    console.log('🔄 Updating existing user with Google OAuth data...');
    
    if (!user.googleId) {
      console.log('🔗 Linking Google account to existing local account...');
    }
    
    // Update user fields
    user.googleId = googleId;
    user.profilePicture = picture;
    user.name = name || user.name;
    user.authProvider = 'google';
    user.lastLogin = new Date();
    
    // Save with validateModifiedOnly to prevent password validation
    await user.save({ validateModifiedOnly: true });
    console.log(`✅ Existing user logged in via Google: ${email}`);

    // Create session
    req.session.userId = user._id.toString();
    req.session.user = { 
      id: user._id.toString(), 
      username: user.username, 
      role: user.role, 
      authMethod: 'google',
      email: user.email,
      name: user.name,
      profilePicture: user.profilePicture
    };

    // Save session
    await new Promise((resolve, reject) => {
      req.session.save(err => err ? reject(err) : resolve());
    });
    
    console.log(`✅ Session saved for Google user: ${user.username}`);

    // Send success response
    res.json({ 
      success: true, 
      message: 'Google login successful', 
      user: req.session.user 
    });

  } catch (error) {
    console.error('❌ Google auth error:', error);
    
    let errorMessage = 'Google authentication failed';
    let statusCode = 500;
    
    if (error.message.includes('validation failed')) {
      errorMessage = 'User validation error: ' + error.message;
      statusCode = 400;
    } else if (error.message.includes('duplicate key')) {
      errorMessage = 'User already exists with this email or Google ID';
      statusCode = 409;
    }
    
    res.status(statusCode).json({ 
      success: false, 
      message: errorMessage, 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// POST /api/auth/login - Local Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log('[LOGIN] Attempt:', username);
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username and password are required' 
      });
    }

    const normalizedUsername = normalizeUsername(username);

    // Find user by username or email
    const user = await User.findOne({ 
      $or: [
        { username: normalizedUsername }, 
        { email: normalizeEmail(username) }
      ] 
    });

    if (!user) {
      console.log('[LOGIN] ❌ User not found:', normalizedUsername);
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }

    // Check if user is a Google OAuth user
    if (user.authProvider === 'google' && !user.password) {
      return res.status(400).json({ 
        success: false, 
        message: 'This account uses Google Sign-In. Please log in with Google.' 
      });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      console.log('[LOGIN] ❌ Invalid password for:', normalizedUsername);
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials' 
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save({ validateModifiedOnly: true });

    // Create session
    req.session.userId = user._id.toString();
    req.session.user = { 
      id: user._id.toString(), 
      username: user.username, 
      role: user.role, 
      authMethod: 'local',
      email: user.email
    };

    await new Promise((resolve, reject) => {
      req.session.save(err => err ? reject(err) : resolve());
    });

    console.log('[LOGIN] ✅ Login successful:', normalizedUsername);

    res.json({ 
      success: true, 
      message: 'Login successful', 
      user: req.session.user 
    });

  } catch (error) {
    console.error('[LOGIN] ❌ Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Login failed', 
      error: error.message 
    });
  }
});

// ============================================
// POST /api/auth/register - Local Registration - FIXED
// ============================================
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    console.log('[REGISTER] Attempt:', { username, hasPassword: !!password, email });
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username and password are required' 
      });
    }

    if (username.length < 3) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username must be at least 3 characters' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 6 characters' 
      });
    }

    // Use SAME normalization as check-username
    const normalizedUsername = normalizeUsername(username);
    const normalizedEmail = email ? normalizeEmail(email) : null;

    console.log('[REGISTER] Normalized:', { normalizedUsername, normalizedEmail });

    // Check if user already exists - SAME LOGIC AS CHECK-USERNAME
    console.log('[REGISTER] Checking username availability...');
    const existingUsername = await User.findOne({ 
      username: normalizedUsername
    });

    if (existingUsername) {
      console.log('[REGISTER] ❌ Username already exists:', normalizedUsername);
      return res.status(409).json({ 
        success: false, 
        field: 'username',
        message: 'Username or email already exists'
      });
    }

    // Check email if provided
    if (normalizedEmail) {
      console.log('[REGISTER] Checking email availability...');
      const existingEmail = await User.findOne({ 
        email: normalizedEmail
      });

      if (existingEmail) {
        console.log('[REGISTER] ❌ Email already exists:', normalizedEmail);
        return res.status(409).json({ 
          success: false, 
          field: 'email',
          message: 'Username or email already exists'
        });
      }
    }

    // Get next user ID
    const lastUser = await User.findOne().sort({ _id: -1 });
    const nextId = lastUser ? lastUser._id + 1 : 1;

    // Hash password
    console.log('[REGISTER] Hashing password...');
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    console.log('[REGISTER] Creating user...');
    const newUser = await User.create({
      _id: nextId,
      username: normalizedUsername,
      email: normalizedEmail,
      password: hashedPassword,
      authProvider: 'local',
      role: 'user',
      isActive: true,
      lastLogin: new Date()
    });

    console.log('[REGISTER] ✅ User created:', normalizedUsername);

    // Create session
    req.session.userId = newUser._id.toString();
    req.session.user = { 
      id: newUser._id.toString(), 
      username: newUser.username, 
      role: newUser.role, 
      authMethod: 'local',
      email: newUser.email
    };

    await new Promise((resolve, reject) => {
      req.session.save(err => err ? reject(err) : resolve());
    });

    console.log('[REGISTER] ✅ Session saved for:', newUser.username);

    res.status(201).json({ 
      success: true, 
      message: 'Registration successful', 
      user: req.session.user 
    });

  } catch (error) {
    console.error('[REGISTER] ❌ Error:', error);
    
    // Handle duplicate key errors from MongoDB
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(409).json({ 
        success: false, 
        field: field,
        message: 'Username or email already exists' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Registration failed', 
      error: error.message 
    });
  }
});

// GET /api/auth/verify - Verify Session
router.get('/verify', async (req, res) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'Not authenticated' 
      });
    }

    const user = await User.findOne({ _id: parseInt(req.session.userId) });
    
    if (!user || !user.isActive) {
      req.session.destroy();
      return res.status(401).json({ 
        success: false, 
        message: 'User not found or inactive' 
      });
    }

    res.json({ 
      success: true, 
      authenticated: true,
      user: req.session.user 
    });

  } catch (error) {
    console.error('[VERIFY] ❌ Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Verification failed' 
    });
  }
});

// POST /api/auth/logout - Logout
router.post('/logout', async (req, res) => {
  try {
    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          console.error('[LOGOUT] ❌ Error:', err);
          return res.status(500).json({ 
            success: false, 
            message: 'Logout failed' 
          });
        }
        res.clearCookie('connect.sid');
        console.log('[LOGOUT] ✅ User logged out');
        res.json({ 
          success: true, 
          message: 'Logged out successfully' 
        });
      });
    } else {
      res.json({ 
        success: true, 
        message: 'Already logged out' 
      });
    }
  } catch (error) {
    console.error('[LOGOUT] ❌ Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Logout failed' 
    });
  }
});

// DELETE /api/auth/users/delete-all - Delete all non-admin users
router.delete('/users/delete-all', async (req, res) => {
  try {
    // Check if user is authenticated and is admin
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ 
        success: false, 
        error: 'Not authenticated' 
      });
    }

    const currentUser = await User.findOne({ _id: parseInt(req.session.userId) });
    
    if (!currentUser || currentUser.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        error: 'Admin access required' 
      });
    }

    console.log('🗑️ Admin requesting to delete all users (except admin)...');

    // Delete all users except admin accounts
    const result = await User.deleteMany({ 
      role: { $ne: 'admin' } 
    });

    console.log(`✅ Deleted ${result.deletedCount} users`);

    res.json({ 
      success: true, 
      message: `Successfully deleted ${result.deletedCount} user(s)`,
      deletedCount: result.deletedCount
    });

  } catch (error) {
    console.error('❌ Delete all users error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete users',
      message: error.message 
    });
  }
});

// GET /api/auth/users/list - List all users (ADMIN ONLY)
router.get('/users/list', async (req, res) => {
  try {
    // Check if user is authenticated and is admin
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ 
        success: false, 
        error: 'Not authenticated' 
      });
    }

    const currentUser = await User.findOne({ _id: parseInt(req.session.userId) });
    
    if (!currentUser || currentUser.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        error: 'Admin access required' 
      });
    }

    // Get all users (excluding password field)
    const users = await User.find({}, { password: 0 }).sort({ _id: 1 });

    res.json({ 
      success: true, 
      users: users,
      total: users.length
    });

  } catch (error) {
    console.error('❌ List users error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to list users',
      message: error.message 
    });
  }
});

// DELETE /api/auth/users/:userId - Delete specific user (ADMIN ONLY)
router.delete('/users/:userId', async (req, res) => {
  try {
    // Check if user is authenticated and is admin
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ 
        success: false, 
        error: 'Not authenticated' 
      });
    }

    const currentUser = await User.findOne({ _id: parseInt(req.session.userId) });
    
    if (!currentUser || currentUser.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        error: 'Admin access required' 
      });
    }

    const userIdToDelete = parseInt(req.params.userId);
    
    // Don't allow deleting yourself
    if (userIdToDelete === currentUser._id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Cannot delete your own account' 
      });
    }

    const userToDelete = await User.findOne({ _id: userIdToDelete });
    
    if (!userToDelete) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    // Don't allow deleting other admin accounts
    if (userToDelete.role === 'admin') {
      return res.status(403).json({ 
        success: false, 
        error: 'Cannot delete admin accounts' 
      });
    }

    await User.deleteOne({ _id: userIdToDelete });

    console.log(`✅ Deleted user: ${userToDelete.username} (ID: ${userIdToDelete._id})`);

    res.json({ 
      success: true, 
      message: `Successfully deleted user: ${userToDelete.username}`,
      deletedUser: {
        id: userToDelete._id,
        username: userToDelete.username,
        email: userToDelete.email
      }
    });

  } catch (error) {
    console.error('❌ Delete user error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete user',
      message: error.message 
    });
  }
});

// DELETE /api/auth/users/cleanup-google/:email - Remove stuck Google registration (ADMIN ONLY)
router.delete('/users/cleanup-google/:email', async (req, res) => {
  try {
    // Check if user is authenticated and is admin
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ 
        success: false, 
        error: 'Not authenticated' 
      });
    }

    const currentUser = await User.findOne({ _id: parseInt(req.session.userId) });
    
    if (!currentUser || currentUser.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        error: 'Admin access required' 
      });
    }

    const emailToDelete = req.params.email.toLowerCase();
    
    console.log(`🧹 Cleaning up stuck Google registration for: ${emailToDelete}`);
    
    // Find and delete user with this email
    const result = await User.deleteMany({ 
      email: emailToDelete
    });

    console.log(`✅ Cleanup complete. Deleted ${result.deletedCount} user(s)`);

    res.json({ 
      success: true, 
      message: `Successfully cleaned up ${result.deletedCount} user record(s) for ${emailToDelete}`,
      deletedCount: result.deletedCount
    });

  } catch (error) {
    console.error('❌ Cleanup error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Cleanup failed',
      message: error.message 
    });
  }
});

// DELETE /api/auth/users/delete-all-google - Delete all Google users (ADMIN ONLY)
router.delete('/users/delete-all-google', async (req, res) => {
  try {
    // Check if user is authenticated and is admin
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ 
        success: false, 
        error: 'Not authenticated' 
      });
    }

    const currentUser = await User.findOne({ _id: parseInt(req.session.userId) });
    
    if (!currentUser || currentUser.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        error: 'Admin access required' 
      });
    }

    console.log('🧹 Admin requesting to delete all Google users...');
    
    // Delete all users with Google auth provider (except admins)
    const result = await User.deleteMany({ 
      authProvider: 'google',
      role: { $ne: 'admin' }
    });

    console.log(`✅ Deleted ${result.deletedCount} Google users`);

    res.json({ 
      success: true, 
      message: `Successfully deleted ${result.deletedCount} Google user(s)`,
      deletedCount: result.deletedCount
    });

  } catch (error) {
    console.error('❌ Delete all Google users error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete Google users',
      message: error.message 
    });
  }
});

module.exports = router;