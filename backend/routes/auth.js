const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');

// ✅ FIX: Replace the old 'db' import with a direct import of the User model.
const User = require('../models_mongoose/User'); 
const dbService = require('../services/databaseService');

// Initialize Google OAuth client
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ============================================
// AUTH ROUTES
// ============================================

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required' });
    }
    
    // ✅ FIX: Changed db.User to User
    const existingUser = await User.findOne({
      $or: [
        { username: username.toLowerCase() },
        { email: email?.toLowerCase() }
      ]
    });
    
    if (existingUser) {
      return res.status(409).json({ success: false, error: 'Username or email already exists' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // ✅ FIX: Changed db.User to User
    const newUser = await User.create({
      username: username.toLowerCase(),
      email: email?.toLowerCase(),
      password: hashedPassword,
      role: 'user',
      isActive: true
    });
    
    req.session.userId = newUser._id;
    req.session.user = {
      id: newUser._id,
      username: newUser.username,
      role: newUser.role,
      email: newUser.email,
      authMethod: 'traditional'
    };
    
    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    console.log(`✅ User registered: ${newUser.username}`);
    
    res.status(201).json({
      success: true,
      message: 'Registration successful',
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        authMethod: 'traditional'
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, error: 'Registration failed', message: error.message });
  }
});

// POST /api/auth/google - Google OAuth Login
router.post('/google', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, message: 'Google token is required' });
    }

    console.log('🔐 Google OAuth login attempt...');

    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId, email_verified } = payload;

    console.log(`✅ Google token verified for: ${email}`);

    if (!email_verified) {
      return res.status(403).json({ success: false, message: 'Email not verified by Google' });
    }

    // ✅ FIX: Changed db.User to User
    let user = await User.findOne({ 
      $or: [
        { email: email.toLowerCase() },
        { googleId: googleId }
      ]
    });

    if (!user) {
      const username = email.split('@')[0].toLowerCase() + '_google';
      let finalUsername = username;
      // ✅ FIX: Changed db.User to User
      let existingUser = await User.findOne({ username: finalUsername });
      if (existingUser) {
        finalUsername = username + '_' + Math.random().toString(36).substring(7);
      }
      
      // ✅ FIX: Changed db.User to User
      const lastUser = await User.findOne().sort({ _id: -1 });
      const nextId = lastUser ? lastUser._id + 1 : 1;
      
      // ✅ FIX: Changed db.User to User
      user = await User.create({
        _id: nextId,
        username: finalUsername,
        email: email.toLowerCase(),
        name: name || finalUsername,
        googleId: googleId,
        profilePicture: picture,
        role: 'user',
        authProvider: 'google',
        isActive: true,
        lastLogin: new Date()
      });

      console.log(`✅ New user created via Google OAuth: ${email} (ID: ${nextId})`);
    } else {
      user.googleId = googleId;
      user.profilePicture = picture;
      user.name = name || user.name;
      user.authProvider = 'google';
      user.lastLogin = new Date();
      
      user.markModified('authProvider');
      user.markModified('googleId');
      
      await user.save();

      console.log(`✅ Existing user logged in via Google: ${email}`);
    }

    req.session.userId = user._id.toString();
    req.session.user = {
      id: user._id.toString(),
      _id: user._id.toString(),
      username: user.username,
      email: user.email,
      role: user.role,
      profilePicture: user.profilePicture,
      authProvider: 'google',
      authMethod: 'google'
    };

    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          reject(err);
        } else {
          console.log(`✅ Session saved for Google user: ${user.username}, sessionID: ${req.sessionID}`);
          resolve();
        }
      });
    });

    if (user.role === 'admin') {
      await dbService.logAdminAction(user._id, 'GOOGLE_LOGIN', { username: user.username, email: user.email }, req);
    }

    res.json({
      success: true,
      message: 'Google login successful',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role,
        profilePicture: user.profilePicture,
        authProvider: 'google',
        authMethod: 'google'
      }
    });

  } catch (error) {
    console.error('❌ Google auth error:', error);
    
    if (error.message && error.message.includes('Token used too late')) {
      return res.status(401).json({ success: false, message: 'Google token expired. Please try again.' });
    }

    if (error.message && error.message.includes('Invalid token')) {
      return res.status(401).json({ success: false, message: 'Invalid Google token' });
    }

    res.status(500).json({
      success: false,
      message: 'Google authentication failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log(`🔐 Login attempt for: ${username}`);
    
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required' });
    }
    
    // ✅ FIX: Changed db.User to User
    const user = await User.findOne({ username: username.toLowerCase() });
    
    if (!user) {
      console.log(`❌ User not found: ${username}`);
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
    
    if (!user.isActive) {
      return res.status(403).json({ success: false, error: 'Account is disabled' });
    }
    
    if (user.authProvider === 'google' && !user.password) {
      return res.status(401).json({ success: false, error: 'Please sign in with Google for this account' });
    }
    
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      console.log(`❌ Invalid password for: ${username}`);
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
    
    user.lastLogin = new Date();
    await user.save();
    
    req.session.userId = user._id.toString();
    req.session.user = {
      id: user._id.toString(),
      _id: user._id.toString(),
      username: user.username,
      email: user.email,
      role: user.role,
      authMethod: 'traditional'
    };
    
    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          reject(err);
        } else {
          console.log(`✅ Session saved for: ${username}, sessionID: ${req.sessionID}`);
          resolve();
        }
      });
    });
    
    if (user.role === 'admin') {
      await dbService.logAdminAction(user._id, 'LOGIN', { username: user.username }, req);
    }
    
    console.log(`✅ Login successful for: ${username} (${user.role})`);
    
    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        authMethod: 'traditional'
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Login failed', message: error.message });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  try {
    const username = req.session?.user?.username;
    
    if (req.session?.user?.role === 'admin') {
      await dbService.logAdminAction(req.session.userId, 'LOGOUT', { username }, req);
    }
    
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destroy error:', err);
        return res.status(500).json({ success: false, error: 'Logout failed' });
      }
      
      res.clearCookie('connect.sid', {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
      });
      
      console.log(`✅ Logout successful for: ${username}`);
      
      res.json({ success: true, message: 'Logout successful' });
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, error: 'Logout failed', message: error.message });
  }
});

// GET /api/auth/verify
router.get('/verify', async (req, res) => {
  try {
    console.log('🔍 Verify Request Details:', {
      headers: {
        origin: req.get('origin'),
        cookie: req.get('cookie'),
        'user-agent': req.get('user-agent')
      },
      hasSession: !!req.session,
      sessionId: req.sessionID,
      userId: req.session?.userId,
      user: req.session?.user?.username
    });
    
    if (!req.session?.userId && !req.session?.user) {
      console.warn('⚠️ Session exists but no user data:', req.sessionID);
      return res.status(401).json({ authenticated: false, message: 'No active session' });
    }
    
    const userId = req.session.userId || req.session.user?.id || req.session.user?._id;
    
    if (!userId) {
      return res.json({ authenticated: false, message: 'Invalid session' });
    }
    
    // ✅ FIX: Changed db.User to User
    const user = await User.findById(userId).select('-password');
    
 // In routes/auth.js, inside the POST /google route

if (!user) {
  // Create new user from Google account
  const username = email.split('@')[0].toLowerCase() + '_google';
  let finalUsername = username;
  const existingUser = await User.findOne({ username: finalUsername });
  if (existingUser) {
    finalUsername = username + '_' + Math.random().toString(36).substring(7);
  }
  
  const lastUser = await User.findOne().sort({ _id: -1 });
  const nextId = lastUser ? lastUser._id + 1 : 1;
  
  // ✅ FINAL DIAGNOSTIC: Create the user data object separately
  const newUserData = {
    _id: nextId,
    username: finalUsername,
    email: email.toLowerCase(),
    name: name || finalUsername,
    googleId: googleId, // The critical field
    profilePicture: picture,
    role: 'user',
    authProvider: 'google',
    isActive: true,
    lastLogin: new Date()
  };
  
  // ✅ FINAL DIAGNOSTIC: Log the object right before the database call
  console.log('--- DEBUG: DATA BEFORE MONGOOSE CREATE ---', newUserData);
  
  // Now, create the user with the prepared data
  user = await User.create(newUserData);

  console.log(`✅ New user created via Google OAuth: ${email} (ID: ${nextId})`);
} else {
  // ... your existing 'else' block for updating a user
}
    
    if (!user.isActive) {
      req.session.destroy();
      return res.json({ authenticated: false, message: 'Account is disabled' });
    }
    
    console.log(`✅ Session verified for: ${user.username} (${user.role})`);
    
    res.json({
      authenticated: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        authMethod: req.session.user?.authMethod || 'traditional'
      }
    });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ authenticated: false, error: 'Verification failed', message: error.message });
  }
});

// GET /api/auth/session
router.get('/session', (req, res) => {
  res.json({
    hasSession: !!req.session,
    sessionId: req.sessionID,
    userId: req.session?.userId,
    user: req.session?.user,
    cookie: {
      expires: req.session?.cookie?.expires,
      maxAge: req.session?.cookie?.maxAge
    }
  });
});

// POST /api/auth/change-password
router.post('/change-password', async (req, res) => {
  try {
    if (!req.session?.userId && !req.session?.user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Current and new passwords are required' });
    }
    
    const userId = req.session.userId || req.session.user?.id;
    // ✅ FIX: Changed db.User to User
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    const isValid = await bcrypt.compare(currentPassword, user.password);
    
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Current password is incorrect' });
    }
    
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    user.password = hashedPassword;
    user.passwordChangedAt = new Date();
    await user.save();
    
    console.log(`✅ Password changed for: ${user.username}`);
    
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ success: false, error: 'Failed to change password', message: error.message });
  }
});

// POST /api/auth/admin/create-user (Admin only)
router.post('/admin/create-user', async (req, res) => {
  try {
    if (!req.session?.userId && !req.session?.user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    
    if (req.session.user?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    
    const { username, email, password, role = 'user' } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required' });
    }
    
    // ✅ FIX: Changed db.User to User
    const existing = await User.findOne({
      $or: [
        { username: username.toLowerCase() },
        { email: email?.toLowerCase() }
      ]
    });
    
    if (existing) {
      return res.status(409).json({ success: false, error: 'User already exists' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // ✅ FIX: Changed db.User to User
    const newUser = await User.create({
      username: username.toLowerCase(),
      email: email?.toLowerCase(),
      password: hashedPassword,
      role: role,
      isActive: true,
      createdBy: req.session.userId
    });
    
    await dbService.logAdminAction(
      req.session.userId,
      'CREATE_USER',
      { 
        newUser: {
          id: newUser._id,
          username: newUser.username,
          role: newUser.role
        }
      },
      req
    );
    
    console.log(`✅ User created by admin: ${newUser.username}`);
    
    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role
      }
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ success: false, error: 'Failed to create user', message: error.message });
  }
});

// Test route
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Auth routes are working',
    timestamp: new Date().toISOString(),
    session: {
      exists: !!req.session,
      id: req.sessionID,
      userId: req.session?.userId,
      user: req.session?.user?.username
    }
  });
});

module.exports = router;