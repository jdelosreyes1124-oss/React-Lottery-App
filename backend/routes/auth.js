const express = require('express');
const router = express.Router();
const dbService = require('../services/databaseService');
const bcrypt = require('bcryptjs');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    console.log('Login attempt:', req.body.username);
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password required'
      });
    }

    const user = await dbService.findUserByUsername(username);

    if (!user) {
      console.log('User not found:', username);
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

   const isValid = await bcrypt.compare(password, user.password);
    
    if (!isValid) {
      console.log('Invalid password for user:', username);
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    await dbService.updateUserLogin(user._id);

    req.session.user = {
      id: user._id,
      username: user.username,
      role: user.role
    };

    console.log('Login successful for:', username);

    res.json({
      success: true,
      user: {
        id: user._id,
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

// POST /api/auth/logout
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

// GET /api/auth/verify
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

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, confirmPassword } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password required'
      });
    }

    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        error: 'Passwords do not match'
      });
    }

    if (username.length < 3 || username.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'Username must be between 3 and 50 characters'
      });
    }

    const existing = await dbService.findUserByUsername(username);
    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Username already exists'
      });
    }

    // Hash password before saving
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await dbService.createUser({
      username,
      email: email || null,
      password: hashedPassword,
      role: 'user'
    });

    console.log('New user registered:', username);

    res.json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: user._id,
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

// POST /api/auth/change-password
router.post('/change-password', async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated'
      });
    }

    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password and new password required'
      });
    }

    if (confirmPassword && newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        error: 'New passwords do not match'
      });
    }

    const user = await dbService.findUserById(req.session.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const isValid = await user.validatePassword(currentPassword);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }

    // Hash new password
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

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

// GET /api/auth/profile
router.get('/profile', async (req, res) => {
  try {
    if (!req.session || !req.session.user) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated'
      });
    }

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
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt
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