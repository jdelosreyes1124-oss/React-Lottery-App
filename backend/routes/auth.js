// routes/auth.js

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');

// Direct, explicit import of the User model.
const User = require('../models_mongoose/User');
const dbService = require('../services/databaseService');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// POST /api/auth/google/register - Google OAuth Registration
router.post('/google/register', async (req, res) => {
  try {
    const { token, username } = req.body;
    
    if (!token) {
      return res.status(400).json({ 
        success: false, 
        error: 'Google token is required' 
      });
    }

    if (!username) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username is required for Google registration' 
      });
    }

    console.log('🔐 Google OAuth registration attempt with username:', username);
    
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
        error: 'Email not verified by Google' 
      });
    }

    // Check if email already exists
    let existingUser = await User.findOne({ 
      $or: [
        { email: email.toLowerCase() }, 
        { googleId: googleId }
      ] 
    });

    if (existingUser) {
      return res.status(409).json({ 
        success: false, 
        error: 'This Google account is already registered. Please sign in instead.' 
      });
    }

    // Check if username already exists
    const userWithUsername = await User.findOne({ 
      username: username.toLowerCase() 
    });

    if (userWithUsername) {
      return res.status(409).json({ 
        success: false, 
        error: 'Username already taken. Please choose another.' 
      });
    }

    // Get next user ID
    const lastUser = await User.findOne().sort({ _id: -1 });
    const nextId = lastUser ? lastUser._id + 1 : 1;
    
    // Create new user
    const newUser = await User.create({
      _id: nextId,
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      name: name || username,
      googleId: googleId,
      profilePicture: picture,
      authProvider: 'google',
      isActive: true,
      lastLogin: new Date()
    });

    console.log(`✅ New Google user created: ${email} with username: ${username}`);

    // Create session
    req.session.userId = newUser._id.toString();
    req.session.user = { 
      id: newUser._id.toString(), 
      username: newUser.username, 
      role: newUser.role, 
      authMethod: 'google',
      email: newUser.email,
      name: newUser.name,
      profilePicture: newUser.profilePicture
    };

    await new Promise((resolve, reject) => {
      req.session.save(err => err ? reject(err) : resolve());
    });

    res.status(201).json({ 
      success: true, 
      message: 'Google registration successful', 
      user: req.session.user 
    });

  } catch (error) {
    console.error('❌ Google registration error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Google registration failed',
      message: error.message
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

    // Search for existing user by email or googleId
    let user = await User.findOne({ 
      $or: [
        { email: email.toLowerCase() }, 
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
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username and password are required' 
      });
    }

    // Find user by username or email
    const user = await User.findOne({ 
      $or: [
        { username: username.toLowerCase() }, 
        { email: username.toLowerCase() }
      ] 
    });

    if (!user) {
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

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    
    if (!isPasswordValid) {
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
      email: user.email,
      name: user.name
    };

    await new Promise((resolve, reject) => {
      req.session.save(err => err ? reject(err) : resolve());
    });

    res.json({ 
      success: true, 
      message: 'Login successful', 
      user: req.session.user 
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Login failed', 
      error: error.message 
    });
  }
});

// POST /api/auth/register - Local Registration
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username and password are required' 
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [
        { username: username.toLowerCase() }, 
        { email: email ? email.toLowerCase() : null }
      ] 
    });

    if (existingUser) {
      return res.status(409).json({ 
        success: false, 
        message: 'Username or email already exists' 
      });
    }

    // Get next user ID
    const lastUser = await User.findOne().sort({ _id: -1 });
    const nextId = lastUser ? lastUser._id + 1 : 1;

    // Create new user
    const newUser = await User.create({
      _id: nextId,
      username: username.toLowerCase(),
      email: email ? email.toLowerCase() : undefined,
      password: password,
      authProvider: 'local',
      isActive: true,
      lastLogin: new Date()
    });

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

    res.status(201).json({ 
      success: true, 
      message: 'Registration successful', 
      user: req.session.user 
    });

  } catch (error) {
    console.error('❌ Registration error:', error);
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
    console.error('❌ Verify error:', error);
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
          console.error('❌ Logout error:', err);
          return res.status(500).json({ 
            success: false, 
            message: 'Logout failed' 
          });
        }
        res.clearCookie('connect.sid');
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
    console.error('❌ Logout error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Logout failed' 
    });
  }
});

module.exports = router;