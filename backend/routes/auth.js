// routes/auth.js - DEPLOYMENT-FRIENDLY VERSION (uses bcryptjs)
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs'); // ← Changed from 'bcrypt' to 'bcryptjs'

// Import your User model - adjust path as needed
const db = require('../models_mongoose');
const User = db.User;

// ============================================
// SHARED HELPER FUNCTIONS
// ============================================

/**
 * Normalize username for consistent checking and storage
 */
const normalizeUsername = (username) => {
  if (!username) return '';
  return username.toLowerCase().trim();
};

/**
 * Normalize email for consistent checking and storage
 */
const normalizeEmail = (email) => {
  if (!email) return '';
  return email.toLowerCase().trim();
};

/**
 * Check if username exists
 */
const usernameExists = async (username) => {
  if (!username || username.length < 3) {
    return true; // Too short = consider as "taken"
  }
  
  try {
    const normalized = normalizeUsername(username);
    const user = await User.findOne({ username: normalized });
    
    console.log(`[USERNAME CHECK] "${username}" (normalized: "${normalized}") -> ${user ? 'EXISTS' : 'AVAILABLE'}`);
    return !!user;
  } catch (error) {
    console.error('[USERNAME CHECK ERROR]', error);
    return true; // On error, be safe and say it exists
  }
};

/**
 * Check if email exists
 */
const emailExists = async (email) => {
  if (!email) return false;
  
  try {
    const normalized = normalizeEmail(email);
    const user = await User.findOne({ email: normalized });
    
    console.log(`[EMAIL CHECK] "${email}" (normalized: "${normalized}") -> ${user ? 'EXISTS' : 'AVAILABLE'}`);
    return !!user;
  } catch (error) {
    console.error('[EMAIL CHECK ERROR]', error);
    return true; // On error, be safe and say it exists
  }
};

// ============================================
// USERNAME AVAILABILITY CHECK
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
    
    const exists = await usernameExists(username);
    
    return res.json({ 
      available: !exists,
      message: exists ? 'Username already taken' : 'Username available'
    });
    
  } catch (error) {
    console.error('[CHECK-USERNAME ERROR]', error);
    return res.status(500).json({ 
      available: false,
      message: 'Unable to check username availability' 
    });
  }
});

// ============================================
// USER REGISTRATION
// ============================================
router.post('/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    
    console.log('[REGISTER] Attempt:', { 
      username, 
      hasPassword: !!password, 
      email,
      rawUsername: JSON.stringify(username),
      rawEmail: JSON.stringify(email)
    });
    
    // ===== VALIDATION =====
    
    if (!username || !password) {
      console.log('[REGISTER] Missing required fields');
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields',
        message: 'Username and password are required'
      });
    }
    
    if (username.length < 3) {
      console.log('[REGISTER] Username too short');
      return res.status(400).json({ 
        success: false,
        error: 'Invalid username',
        field: 'username',
        message: 'Username must be at least 3 characters'
      });
    }
    
    if (password.length < 6) {
      console.log('[REGISTER] Password too short');
      return res.status(400).json({ 
        success: false,
        error: 'Invalid password',
        field: 'password',
        message: 'Password must be at least 6 characters'
      });
    }
    
    // Normalize inputs
    const normalizedUsername = normalizeUsername(username);
    const normalizedEmail = email ? normalizeEmail(email) : null;
    
    console.log('[REGISTER] Normalized values:', { 
      normalizedUsername, 
      normalizedEmail 
    });
    
    // ===== CHECK USERNAME AVAILABILITY =====
    
    console.log('[REGISTER] Checking username availability...');
    const usernameTaken = await usernameExists(username);
    
    if (usernameTaken) {
      console.log('[REGISTER] Username already exists:', normalizedUsername);
      return res.status(409).json({ 
        success: false,
        error: 'Username already taken',
        field: 'username',
        message: 'This username is already taken. Please choose a different username.'
      });
    }
    
    // ===== CHECK EMAIL AVAILABILITY =====
    
    if (normalizedEmail) {
      console.log('[REGISTER] Checking email availability...');
      const emailTaken = await emailExists(normalizedEmail);
      
      if (emailTaken) {
        console.log('[REGISTER] Email already exists:', normalizedEmail);
        return res.status(409).json({ 
          success: false,
          error: 'Email already registered',
          field: 'email',
          message: 'This email is already registered. Please login or use a different email.'
        });
      }
    }
    
    // ===== CREATE USER =====
    
    console.log('[REGISTER] All checks passed, creating user...');
    
    // Hash password with bcryptjs (10 rounds)
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user object
    const userData = {
      username: normalizedUsername,
      password: hashedPassword,
      role: 'user',
      authMethod: 'local',
      createdAt: new Date()
    };
    
    // Add email only if provided
    if (normalizedEmail) {
      userData.email = normalizedEmail;
    }
    
    console.log('[REGISTER] Creating user with data:', { 
      username: userData.username, 
      email: userData.email,
      role: userData.role 
    });
    
    const user = new User(userData);
    
    try {
      await user.save();
      console.log('[REGISTER] ✅ User created successfully:', user.username);
    } catch (saveError) {
      // Handle MongoDB duplicate key error (race condition)
      if (saveError.code === 11000) {
        const duplicateField = Object.keys(saveError.keyPattern)[0];
        console.log('[REGISTER] ❌ Duplicate key error on:', duplicateField);
        
        return res.status(409).json({ 
          success: false,
          error: `${duplicateField} already exists`,
          field: duplicateField,
          message: `This ${duplicateField} is already taken. Please choose a different ${duplicateField}.`
        });
      }
      
      // Re-throw other errors
      throw saveError;
    }
    
    // ===== SET SESSION =====
    
    req.session.userId = user._id;
    req.session.user = {
      id: user._id,
      username: user.username,
      role: user.role,
      authMethod: user.authMethod
    };
    
    await req.session.save();
    
    console.log('[REGISTER] ✅ Session created for user:', user.username);
    
    return res.status(201).json({
      success: true,
      message: 'Account created successfully',
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        authMethod: user.authMethod
      }
    });
    
  } catch (error) {
    console.error('[REGISTER] ❌ Unexpected error:', error);
    console.error('[REGISTER] Error stack:', error.stack);
    
    return res.status(500).json({ 
      success: false,
      error: 'Registration failed',
      message: 'An error occurred during registration. Please try again.'
    });
  }
});

// ============================================
// USER LOGIN
// ============================================
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log('[LOGIN] Attempt:', username);
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing credentials',
        message: 'Username and password are required'
      });
    }
    
    const normalizedUsername = normalizeUsername(username);
    
    // Find user (case-insensitive)
    const user = await User.findOne({ 
      username: normalizedUsername,
      authMethod: 'local' // Only local auth users have passwords
    });
    
    if (!user) {
      console.log('[LOGIN] ❌ User not found:', normalizedUsername);
      return res.status(401).json({ 
        success: false,
        error: 'Invalid credentials',
        message: 'Invalid username or password'
      });
    }
    
    // Check password with bcryptjs
    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      console.log('[LOGIN] ❌ Invalid password for user:', normalizedUsername);
      return res.status(401).json({ 
        success: false,
        error: 'Invalid credentials',
        message: 'Invalid username or password'
      });
    }
    
    // Set session
    req.session.userId = user._id;
    req.session.user = {
      id: user._id,
      username: user.username,
      role: user.role,
      authMethod: user.authMethod
    };
    
    await req.session.save();
    
    console.log('[LOGIN] ✅ Login successful:', normalizedUsername);
    
    return res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        authMethod: user.authMethod
      }
    });
    
  } catch (error) {
    console.error('[LOGIN] ❌ Error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Login failed',
      message: 'An error occurred during login. Please try again.'
    });
  }
});

// ============================================
// VERIFY AUTH STATUS
// ============================================
router.get('/verify', async (req, res) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.json({ 
        authenticated: false 
      });
    }
    
    // Verify user still exists
    const user = await User.findById(req.session.userId);
    
    if (!user) {
      // User was deleted, clear session
      req.session.destroy();
      return res.json({ 
        authenticated: false 
      });
    }
    
    return res.json({ 
      authenticated: true,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        authMethod: user.authMethod
      }
    });
    
  } catch (error) {
    console.error('[VERIFY] ❌ Error:', error);
    return res.json({ 
      authenticated: false 
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
            error: 'Logout failed' 
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
      error: 'Logout failed' 
    });
  }
});

// ============================================
// GOOGLE AUTH (if you use it)
// ============================================
router.post('/google', async (req, res) => {
  try {
    const { token } = req.body;
    
    console.log('[GOOGLE-AUTH] Attempt');
    
    // TODO: Implement Google token verification
    // const ticket = await client.verifyIdToken({
    //     idToken: token,
    //     audience: CLIENT_ID,
    // });
    // const payload = ticket.getPayload();
    
    return res.status(501).json({
      success: false,
      error: 'Not implemented',
      message: 'Google authentication not yet implemented'
    });
    
  } catch (error) {
    console.error('[GOOGLE-AUTH] ❌ Error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Google authentication failed' 
    });
  }
});

router.post('/google/register', async (req, res) => {
  try {
    const { token, username } = req.body;
    
    console.log('[GOOGLE-REGISTER] Attempt:', username);
    
    // TODO: Implement Google registration
    
    return res.status(501).json({
      success: false,
      error: 'Not implemented',
      message: 'Google registration not yet implemented'
    });
    
  } catch (error) {
    console.error('[GOOGLE-REGISTER] ❌ Error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Google registration failed' 
    });
  }
});

module.exports = router;