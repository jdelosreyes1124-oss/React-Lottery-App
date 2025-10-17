// ============================================
// routes/auth.js - Complete Authentication Routes File
// ============================================
const express = require('express');
const router = express.Router();
const dbService = require('../services/databaseService');

// ============================================
// POST /api/auth/login
// ============================================
router.post('/login', async (req, res) => {
  try {
    console.log('Login attempt:', req.body.username);
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password required'
      });
    }

    // Find user in database
    const user = await dbService.findUserByUsername(username);

    if (!user) {
      console.log('User not found:', username);
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Validate password
    const isValid = await user.validatePassword(password);
    
    if (!isValid) {
      console.log('Invalid password for user:', username);
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Update last login timestamp
    await dbService.updateUserLogin(user.id);

    // Set session
    req.session.user = {
      id: user.id,
      username: user.username,
      role: user.role
    };

    console.log('Login successful for:', username);

    // Send response
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

// ============================================
// POST /api/auth/logout
// ============================================
router.post('/logout', (req, res) => {
  const username = req.session?.user?.username;
  
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({
        success: false,
        error: 'Logout failed'
      });
    }
    
    console.log('User logged out:', username);
    res.json({ 
      success: true,
      message: 'Logged out successfully'
    });
  });
});

// ============================================
// GET /api/auth/verify
// ============================================
router.get('/verify', (req, res) => {
  console.log('Verify session:', req.session?.user?.username);
  
  if (req.session && req.session.user) {
    res.json({
      authenticated: true,
      user: req.session.user
    });
  } else {
    res.json({
      authenticated: false
    });
  }
});

// ============================================
// POST /api/auth/register
// ============================================
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, confirmPassword } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password required'
      });
    }

    // Check password confirmation
    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        error: 'Passwords do not match'
      });
    }

    // Check username length 
    if (username.length < 3 || username.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'Username must be between 3 and 50 characters'
      });
    }

    // Check if username already exists a
    const existing = await dbService.findUserByUsername(username);
    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Username already exists'
      });
    }

    // Create new user 
    const user = await dbService.createUser({
      username,
      email: email || null,
      password,
      role: 'user' // Default role 
    });

    console.log('New user registered:', username);

    res.json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: user.id,
        username: user.username
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed'
    });
  }
});

// ============================================
// POST /api/auth/change-password
// ============================================
router.post('/change-password', async (req, res) => {
  try {
    // Check if user is logged in
    if (!req.session || !req.session.user) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated'
      });
    }

    const { currentPassword, newPassword, confirmPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password and new password required'
      });
    }

    // Check password confirmation
    if (confirmPassword && newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        error: 'New passwords do not match'
      });
    }

    // Get user from database
    const user = await dbService.findUserById(req.session.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Validate current password 
    const isValid = await user.validatePassword(currentPassword);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }

    // Update password
    await user.update({ password: newPassword });

    console.log('Password changed for user:', user.username);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to change password'
    });
  }
});

// ============================================
// GET /api/auth/profile
// ============================================
router.get('/profile', async (req, res) => {
  try {
    // Check if user is logged in
    if (!req.session || !req.session.user) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated'
      });
    }

    // Get user from database
    const user = await dbService.findUserById(req.session.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        lastLogin: user.last_login,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get profile'
    });
  }
});

module.exports = router;