// routes/auth.js - COMPLETE FIXED VERSION WITH PROPER ERROR HANDLING

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');

// Direct, explicit import of the User model.
const User = require('../models_mongoose/User');
const dbService = require('../services/databaseService');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ============================================
// HELPER FUNCTIONS
// ============================================
const getUserId = (user) => {
  if (!user || !user._id) {
    throw new Error('User object has no _id');
  }
  
  // Handle both ObjectId and Number IDs
  if (typeof user._id === 'object' && user._id.toString) {
    return user._id.toString();
  }
  
  return String(user._id);
};

const normalizeUsername = (username) => {
  if (!username) return '';
  return username.toLowerCase().trim();
};

const normalizeEmail = (email) => {
  if (!email) return '';
  return email.toLowerCase().trim();
};

// ============================================
// USERNAME CHECK ENDPOINT
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

// ============================================
// LOCAL LOGIN - FIXED ERROR HANDLING
// ============================================
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log('[LOGIN] Attempt:', username);
    
    // STEP 1: Validate input - return early
    if (!username || !password) {
      console.log('[LOGIN] ❌ Missing credentials');
      return res.status(400).json({ 
        success: false, 
        message: 'Username and password are required' 
      });
    }

    const normalizedUsername = normalizeUsername(username);

    // STEP 2: Find user - return early if not found
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

    // STEP 3: Check auth provider - return early if wrong method
    if (user.authProvider === 'google' && !user.password) {
      console.log('[LOGIN] ❌ Google user trying local login');
      return res.status(400).json({ 
        success: false, 
        message: 'This account uses Google Sign-In. Please log in with Google.' 
      });
    }

    // STEP 4: Check password - return early if wrong
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      console.log('[LOGIN] ❌ Invalid password for:', normalizedUsername);
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials'
      });
    }

    // ✅ ALL VALIDATION PASSED - Now create session
    console.log('[LOGIN] ✅ Credentials valid, creating session...');

    // Update last login
    user.lastLogin = new Date();
    await user.save({ validateModifiedOnly: true });

    // STEP 5: Create session (only runs if credentials are correct)
    try {
      const userId = getUserId(user);
      
      req.session.userId = userId;
      req.session.user = { 
        id: userId, 
        username: user.username || 'unknown',
        role: user.role || 'user',
        authMethod: 'local',
        email: user.email || ''
      };
      
      await new Promise((resolve, reject) => {
        req.session.save(err => {
          if (err) {
            console.error('[LOGIN] Session save error:', err);
            reject(err);
          } else {
            resolve();
          }
        });
      });
      
      console.log('[LOGIN] ✅ Login successful:', user.username);
      
      return res.json({ 
        success: true, 
        message: 'Login successful', 
        user: req.session.user 
      });
      
    } catch (sessionError) {
      // This ONLY happens if credentials are correct but session fails
      console.error('[LOGIN] ❌ Session creation failed:', sessionError);
      return res.status(500).json({ 
        success: false, 
        message: 'Login successful but session creation failed. Please try again.' 
      });
    }

  } catch (error) {
    // Catch-all for unexpected errors
    console.error('[LOGIN] ❌ Unexpected error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Login failed. Please try again later.',
      error: error.message 
    });
  }
});

// ============================================
// LOCAL REGISTRATION
// ============================================
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    console.log('[REGISTER] Attempt:', { username, hasPassword: !!password, email });
    
    // STEP 1: Validate input
    if (!username || !password) {
      console.log('[REGISTER] ❌ Missing required fields');
      return res.status(400).json({ 
        success: false, 
        message: 'Username and password are required' 
      });
    }

    if (username.length < 3) {
      console.log('[REGISTER] ❌ Username too short');
      return res.status(400).json({ 
        success: false, 
        message: 'Username must be at least 3 characters' 
      });
    }

    if (password.length < 6) {
      console.log('[REGISTER] ❌ Password too short');
      return res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 6 characters' 
      });
    }

    const normalizedUsername = normalizeUsername(username);
    const normalizedEmail = email ? normalizeEmail(email) : null;

    console.log('[REGISTER] Normalized:', { normalizedUsername, normalizedEmail });

    // STEP 2: Check username availability
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

    // STEP 3: Check email availability
    if (normalizedEmail) {
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

    // STEP 4: Create user
    const lastUser = await User.findOne().sort({ _id: -1 });
    const nextId = lastUser ? lastUser._id + 1 : 1;

    const hashedPassword = await bcrypt.hash(password, 10);

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

    // STEP 5: Create session
    try {
      const userId = getUserId(newUser);
      
      req.session.userId = userId;
      req.session.user = { 
        id: userId, 
        username: newUser.username || 'unknown',
        role: newUser.role || 'user',
        authMethod: 'local',
        email: newUser.email || ''
      };
      
      await new Promise((resolve, reject) => {
        req.session.save(err => {
          if (err) {
            console.error('[REGISTER] Session save error:', err);
            reject(err);
          } else {
            resolve();
          }
        });
      });
      
      console.log('[REGISTER] ✅ Session saved for:', newUser.username);
      
      return res.status(201).json({ 
        success: true, 
        message: 'Registration successful', 
        user: req.session.user 
      });
      
    } catch (sessionError) {
      console.error('[REGISTER] ❌ Session creation failed:', sessionError);
      return res.status(500).json({ 
        success: false, 
        message: 'Account created but session failed. Please try logging in.' 
      });
    }

  } catch (error) {
    console.error('[REGISTER] ❌ Error:', error);
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(409).json({ 
        success: false, 
        field: field,
        message: 'Username or email already exists' 
      });
    }
    
    return res.status(500).json({ 
      success: false, 
      message: 'Registration failed', 
      error: error.message 
    });
  }
});

// ============================================
// GOOGLE LOGIN
// ============================================
router.post('/google', async (req, res) => {
  try {
    const { token } = req.body;
    
    console.log('🔍 Google OAuth login attempt...');
    
    // STEP 1: Validate token
    if (!token) {
      console.log('[GOOGLE] ❌ Missing token');
      return res.status(400).json({ 
        success: false, 
        message: 'Google token is required' 
      });
    }

    // STEP 2: Verify token
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId, email_verified } = payload;

    console.log(`✅ Google token verified for: ${email}`);
    
    if (!email_verified) {
      console.log('[GOOGLE] ❌ Email not verified');
      return res.status(403).json({ 
        success: false, 
        message: 'Email not verified by Google' 
      });
    }

    const normalizedEmail = normalizeEmail(email);

    // STEP 3: Find user
    let user = await User.findOne({ 
      $or: [
        { email: normalizedEmail }, 
        { googleId: googleId }
      ] 
    });

    if (!user) {
      console.log('[GOOGLE] ❌ User not found');
      return res.status(404).json({ 
        success: false, 
        message: 'No account found. Please register first.',
        error: 'USER_NOT_FOUND'
      });
    }

    // STEP 4: Update user
    user.googleId = googleId;
    user.profilePicture = picture;
    user.name = name || user.name;
    user.authProvider = 'google';
    user.lastLogin = new Date();
    await user.save({ validateModifiedOnly: true });

    console.log(`✅ User logged in via Google: ${email}`);

    // STEP 5: Create session
    try {
      const userId = getUserId(user);
      
      req.session.userId = userId;
      req.session.user = { 
        id: userId, 
        username: user.username || 'unknown',
        role: user.role || 'user',
        authMethod: 'google',
        email: user.email || '',
        name: user.name || '',
        profilePicture: user.profilePicture || ''
      };
      
      await new Promise((resolve, reject) => {
        req.session.save(err => {
          if (err) {
            console.error('[GOOGLE] Session save error:', err);
            reject(err);
          } else {
            resolve();
          }
        });
      });
      
      console.log('[GOOGLE] ✅ Session saved for:', user.username);
      
      return res.json({ 
        success: true, 
        message: 'Google login successful', 
        user: req.session.user 
      });
      
    } catch (sessionError) {
      console.error('[GOOGLE] ❌ Session creation failed:', sessionError);
      return res.status(500).json({ 
        success: false, 
        message: 'Authentication successful but session creation failed. Please try again.' 
      });
    }

  } catch (error) {
    console.error('❌ Google auth error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Google authentication failed', 
      error: error.message
    });
  }
});

// ============================================
// GOOGLE REGISTER
// ============================================
router.post('/google/register', async (req, res) => {
  try {
    console.log('🔵 Google registration request received');
    
    const { token, username } = req.body;
    
    // STEP 1: Validate input
    if (!token) {
      console.log('[GOOGLE-REG] ❌ Missing token');
      return res.status(400).json({ 
        success: false, 
        error: 'Google token is required' 
      });
    }

    if (!username || username.length < 3) {
      console.log('[GOOGLE-REG] ❌ Invalid username');
      return res.status(400).json({ 
        success: false, 
        error: 'Username must be at least 3 characters' 
      });
    }

    // STEP 2: Verify token
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId, email_verified } = payload;
    
    if (!email_verified) {
      console.log('[GOOGLE-REG] ❌ Email not verified');
      return res.status(403).json({ 
        success: false, 
        error: 'Email not verified by Google' 
      });
    }

    const normalizedUsername = normalizeUsername(username);
    const normalizedEmail = normalizeEmail(email);

    // STEP 3: Check existing user
    let existingUser = await User.findOne({ 
      $or: [
        { email: normalizedEmail }, 
        { googleId: googleId }
      ] 
    });

    if (existingUser && existingUser.username && existingUser.isActive) {
      console.log('[GOOGLE-REG] ❌ User already registered');
      return res.status(409).json({ 
        success: false, 
        error: 'This Google account is already registered.' 
      });
    }
    
    if (existingUser) {
      // Complete partial registration
      existingUser.username = normalizedUsername;
      existingUser.name = name;
      existingUser.profilePicture = picture;
      existingUser.isActive = true;
      existingUser.lastLogin = new Date();
      await existingUser.save({ validateModifiedOnly: true });
    } else {
      // STEP 4: Check username availability
      const usernameExists = await User.findOne({ username: normalizedUsername });
      if (usernameExists) {
        console.log('[GOOGLE-REG] ❌ Username taken');
        return res.status(409).json({ 
          success: false, 
          error: 'Username already taken.' 
        });
      }

      // STEP 5: Create new user
      const lastUser = await User.findOne().sort({ _id: -1 });
      const nextId = lastUser ? lastUser._id + 1 : 1;

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
      
      console.log('[GOOGLE-REG] ✅ User created:', normalizedUsername);
    }

    // STEP 6: Create session
    try {
      const userId = getUserId(existingUser);
      
      req.session.userId = userId;
      req.session.user = { 
        id: userId, 
        username: existingUser.username || 'unknown',
        role: existingUser.role || 'user',
        authMethod: 'google',
        email: existingUser.email || '',
        name: existingUser.name || '',
        profilePicture: existingUser.profilePicture || ''
      };
      
      await new Promise((resolve, reject) => {
        req.session.save(err => {
          if (err) {
            console.error('[GOOGLE-REG] Session save error:', err);
            reject(err);
          } else {
            resolve();
          }
        });
      });
      
      console.log('[GOOGLE-REG] ✅ Session created for:', existingUser.username);
      
      return res.json({ 
        success: true, 
        message: 'Registration successful with Google', 
        user: req.session.user 
      });
      
    } catch (sessionError) {
      console.error('[GOOGLE-REG] ❌ Session error:', sessionError);
      return res.status(500).json({ 
        success: false, 
        message: 'Registration successful but session failed. Please try logging in.' 
      });
    }

  } catch (error) {
    console.error('❌ Google registration error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Google registration failed', 
      message: error.message
    });
  }
});

// ============================================
// VERIFY SESSION
// ============================================
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

    return res.json({ 
      success: true, 
      authenticated: true,
      user: req.session.user 
    });

  } catch (error) {
    console.error('[VERIFY] ❌ Error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Verification failed' 
    });
  }
});

// ============================================
// LOGOUT
// ============================================
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
        return res.json({ 
          success: true, 
          message: 'Logged out successfully' 
        });
      });
    } else {
      return res.json({ 
        success: true, 
        message: 'Already logged out' 
      });
    }
  } catch (error) {
    console.error('[LOGOUT] ❌ Error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Logout failed' 
    });
  }
});

// ============================================
// ADMIN ENDPOINTS
// ============================================

router.delete('/users/delete-all', async (req, res) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const currentUser = await User.findOne({ _id: parseInt(req.session.userId) });
    if (!currentUser || currentUser.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const result = await User.deleteMany({ role: { $ne: 'admin' } });
    console.log(`✅ Deleted ${result.deletedCount} users`);
    
    return res.json({ success: true, message: `Deleted ${result.deletedCount} users`, deletedCount: result.deletedCount });
  } catch (error) {
    console.error('Delete all error:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete users' });
  }
});

router.get('/users/list', async (req, res) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const currentUser = await User.findOne({ _id: parseInt(req.session.userId) });
    if (!currentUser || currentUser.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const users = await User.find({}, { password: 0 }).sort({ _id: 1 });
    return res.json({ success: true, users: users, total: users.length });
  } catch (error) {
    console.error('List users error:', error);
    return res.status(500).json({ success: false, error: 'Failed to list users' });
  }
});

router.delete('/users/:userId', async (req, res) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const currentUser = await User.findOne({ _id: parseInt(req.session.userId) });
    if (!currentUser || currentUser.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const userIdToDelete = parseInt(req.params.userId);
    if (userIdToDelete === currentUser._id) {
      return res.status(400).json({ success: false, error: 'Cannot delete your own account' });
    }

    const userToDelete = await User.findOne({ _id: userIdToDelete });
    if (!userToDelete) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (userToDelete.role === 'admin') {
      return res.status(403).json({ success: false, error: 'Cannot delete admin accounts' });
    }

    await User.deleteOne({ _id: userIdToDelete });
    console.log(`✅ Deleted user: ${userToDelete.username}`);
    
    return res.json({ success: true, message: `Deleted user: ${userToDelete.username}` });
  } catch (error) {
    console.error('Delete user error:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete user' });
  }
});

router.delete('/users/cleanup-google/:email', async (req, res) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const currentUser = await User.findOne({ _id: parseInt(req.session.userId) });
    if (!currentUser || currentUser.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const result = await User.deleteMany({ email: req.params.email.toLowerCase() });
    console.log(`✅ Cleaned up ${result.deletedCount} records`);
    
    return res.json({ success: true, message: `Cleaned up ${result.deletedCount} records`, deletedCount: result.deletedCount });
  } catch (error) {
    console.error('Cleanup error:', error);
    return res.status(500).json({ success: false, error: 'Cleanup failed' });
  }
});

router.delete('/users/delete-all-google', async (req, res) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const currentUser = await User.findOne({ _id: parseInt(req.session.userId) });
    if (!currentUser || currentUser.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const result = await User.deleteMany({ authProvider: 'google', role: { $ne: 'admin' } });
    console.log(`✅ Deleted ${result.deletedCount} Google users`);
    
    return res.json({ success: true, message: `Deleted ${result.deletedCount} Google users`, deletedCount: result.deletedCount });
  } catch (error) {
    console.error('Delete Google users error:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete Google users' });
  }
});

module.exports = router;