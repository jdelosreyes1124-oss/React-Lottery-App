// routes/auth.js - COMPLETE FIXED VERSION WITH SESSION HANDLING

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
// GOOGLE REGISTER
// ============================================
router.post('/google/register', async (req, res) => {
  try {
    console.log('🔵 Google registration request received');
    
    const { token, username } = req.body;
    
    if (!token) {
      return res.status(400).json({ 
        success: false, 
        error: 'Google token is required' 
      });
    }

    if (!username || username.length < 3) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username must be at least 3 characters' 
      });
    }

    // Verify Google token
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId, email_verified } = payload;
    
    if (!email_verified) {
      return res.status(403).json({ 
        success: false, 
        error: 'Email not verified by Google' 
      });
    }

    const normalizedUsername = normalizeUsername(username);
    const normalizedEmail = normalizeEmail(email);

    // Check existing user
    let existingUser = await User.findOne({ 
      $or: [
        { email: normalizedEmail }, 
        { googleId: googleId }
      ] 
    });

    if (existingUser && existingUser.username && existingUser.isActive) {
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
      // Check username availability
      const usernameExists = await User.findOne({ username: normalizedUsername });
      if (usernameExists) {
        return res.status(409).json({ 
          success: false, 
          error: 'Username already taken.' 
        });
      }

      // Create new user
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
    }

    // Create session with error handling
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
      
      res.json({ 
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
    res.status(500).json({ 
      success: false, 
      error: 'Google registration failed', 
      message: error.message
    });
  }
});

// ============================================
// GOOGLE LOGIN
// ============================================
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
    
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId, email_verified } = payload;
    
    if (!email_verified) {
      return res.status(403).json({ 
        success: false, 
        message: 'Email not verified by Google' 
      });
    }

    const normalizedEmail = normalizeEmail(email);

    let user = await User.findOne({ 
      $or: [
        { email: normalizedEmail }, 
        { googleId: googleId }
      ] 
    });

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'No account found. Please register first.',
        error: 'USER_NOT_FOUND'
      });
    }

    // Update user
    user.googleId = googleId;
    user.profilePicture = picture;
    user.name = name || user.name;
    user.authProvider = 'google';
    user.lastLogin = new Date();
    await user.save({ validateModifiedOnly: true });

    console.log(`✅ User logged in via Google: ${email}`);

    // Create session with error handling
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
      
      res.json({ 
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
    res.status(500).json({ 
      success: false, 
      message: 'Google authentication failed', 
      error: error.message
    });
  }
});

// ============================================
// LOCAL LOGIN
// ============================================
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

    if (user.authProvider === 'google' && !user.password) {
      return res.status(400).json({ 
        success: false, 
        message: 'This account uses Google Sign-In. Please log in with Google.' 
      });
    }

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

    // Create session with error handling
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
      
      res.json({ 
        success: true, 
        message: 'Login successful', 
        user: req.session.user 
      });
      
    } catch (sessionError) {
      console.error('[LOGIN] ❌ Session creation failed:', sessionError);
      return res.status(500).json({ 
        success: false, 
        message: 'Login successful but session creation failed. Please try again.' 
      });
    }

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
// LOCAL REGISTRATION
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

    const normalizedUsername = normalizeUsername(username);
    const normalizedEmail = email ? normalizeEmail(email) : null;

    console.log('[REGISTER] Normalized:', { normalizedUsername, normalizedEmail });

    // Check username
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

    // Check email
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

    // Get next ID
    const lastUser = await User.findOne().sort({ _id: -1 });
    const nextId = lastUser ? lastUser._id + 1 : 1;

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
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

    // Create session with error handling
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
      
      res.status(201).json({ 
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
    
    res.status(500).json({ 
      success: false, 
      message: 'Registration failed', 
      error: error.message 
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
    res.json({ success: true, message: `Deleted ${result.deletedCount} users`, deletedCount: result.deletedCount });
  } catch (error) {
    console.error('Delete all error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete users' });
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
    res.json({ success: true, users: users, total: users.length });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ success: false, error: 'Failed to list users' });
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
    res.json({ success: true, message: `Deleted user: ${userToDelete.username}` });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete user' });
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
    res.json({ success: true, message: `Cleaned up ${result.deletedCount} records`, deletedCount: result.deletedCount });
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ success: false, error: 'Cleanup failed' });
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
    res.json({ success: true, message: `Deleted ${result.deletedCount} Google users`, deletedCount: result.deletedCount });
  } catch (error) {
    console.error('Delete Google users error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete Google users' });
  }
});

module.exports = router;