const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../models_mongoose');
const dbService = require('../services/databaseService');

// ============================================
// AUTH ROUTES
// ============================================

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Validate input
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
    }
    
    // Check if user exists
    const existingUser = await db.User.findOne({
      $or: [
        { username: username.toLowerCase() },
        { email: email?.toLowerCase() }
      ]
    });
    
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'Username or email already exists'
      });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const newUser = await db.User.create({
      username: username.toLowerCase(),
      email: email?.toLowerCase(),
      password: hashedPassword,
      role: 'user', // Default role
      isActive: true
    });
    
    // Create session
    req.session.userId = newUser._id;
    req.session.user = {
      id: newUser._id,
      username: newUser.username,
      role: newUser.role,
      email: newUser.email
    };
    
    // Save session
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
        role: newUser.role
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed',
      message: error.message
    });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log(`🔐 Login attempt for: ${username}`);
    
    // Validate input
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
    }
    
    // Find user (case-insensitive)
    const user = await db.User.findOne({ 
      username: username.toLowerCase() 
    });
    
    if (!user) {
      console.log(`❌ User not found: ${username}`);
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }
    
    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Account is disabled'
      });
    }
    
    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      console.log(`❌ Invalid password for: ${username}`);
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();
    
    // Create session - Store both formats for compatibility
    req.session.userId = user._id.toString();
    req.session.user = {
      id: user._id.toString(),
      _id: user._id.toString(),
      username: user.username,
      email: user.email,
      role: user.role
    };
    
    // Force session save
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
    
    // Log admin action if admin
    if (user.role === 'admin') {
      await dbService.logAdminAction(
        user._id,
        'LOGIN',
        { username: user.username },
        req
      );
    }
    
    console.log(`✅ Login successful for: ${username} (${user.role})`);
    
    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed',
      message: error.message
    });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  try {
    const username = req.session?.user?.username;
    
    // Log admin action if admin
    if (req.session?.user?.role === 'admin') {
      await dbService.logAdminAction(
        req.session.userId,
        'LOGOUT',
        { username },
        req
      );
    }
    
    // Destroy session
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destroy error:', err);
        return res.status(500).json({
          success: false,
          error: 'Logout failed'
        });
      }
      
      // Clear cookie
      res.clearCookie('connect.sid', {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
      });
      
      console.log(`✅ Logout successful for: ${username}`);
      
      res.json({
        success: true,
        message: 'Logout successful'
      });
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Logout failed',
      message: error.message
    });
  }
});

// GET /api/auth/verify
router.get('/verify', async (req, res) => {
  try {
    console.log('🔍 Verifying session:', {
      hasSession: !!req.session,
      sessionId: req.sessionID,
      userId: req.session?.userId,
      user: req.session?.user?.username
    });
    
    // Check if session exists
    if (!req.session || (!req.session.userId && !req.session.user)) {
      return res.json({
        authenticated: false,
        message: 'No active session'
      });
    }
    
    // Get user ID from session (support both formats)
    const userId = req.session.userId || req.session.user?.id || req.session.user?._id;
    
    if (!userId) {
      return res.json({
        authenticated: false,
        message: 'Invalid session'
      });
    }
    
    // Verify user exists in database
    const user = await db.User.findById(userId).select('-password');
    
    if (!user) {
      // User doesn't exist, clear session
      req.session.destroy();
      return res.json({
        authenticated: false,
        message: 'User not found'
      });
    }
    
    if (!user.isActive) {
      // User is disabled, clear session
      req.session.destroy();
      return res.json({
        authenticated: false,
        message: 'Account is disabled'
      });
    }
    
    console.log(`✅ Session verified for: ${user.username} (${user.role})`);
    
    res.json({
      authenticated: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({
      authenticated: false,
      error: 'Verification failed',
      message: error.message
    });
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
      return res.status(401).json({
        success: false,
        error: 'Not authenticated'
      });
    }
    
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current and new passwords are required'
      });
    }
    
    const userId = req.session.userId || req.session.user?.id;
    const user = await db.User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password);
    
    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update password
    user.password = hashedPassword;
    user.passwordChangedAt = new Date();
    await user.save();
    
    console.log(`✅ Password changed for: ${user.username}`);
    
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to change password',
      message: error.message
    });
  }
});

// POST /api/auth/admin/create-user (Admin only)
router.post('/admin/create-user', async (req, res) => {
  try {
    // Check authentication
    if (!req.session?.userId && !req.session?.user) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated'
      });
    }
    
    // Check admin role
    if (req.session.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }
    
    const { username, email, password, role = 'user' } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
    }
    
    // Check if user exists
    const existing = await db.User.findOne({
      $or: [
        { username: username.toLowerCase() },
        { email: email?.toLowerCase() }
      ]
    });
    
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'User already exists'
      });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const newUser = await db.User.create({
      username: username.toLowerCase(),
      email: email?.toLowerCase(),
      password: hashedPassword,
      role: role,
      isActive: true,
      createdBy: req.session.userId
    });
    
    // Log admin action
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
    res.status(500).json({
      success: false,
      error: 'Failed to create user',
      message: error.message
    });
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