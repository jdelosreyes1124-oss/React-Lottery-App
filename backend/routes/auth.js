// routes/auth.js

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');

// Direct, explicit import of the User model.
const User = require('../models_mongoose/User'); 
const dbService = require('../services/databaseService');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// POST /api/auth/google - Google OAuth Login
router.post('/google', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'Google token is required' });

    console.log('🔐 Google OAuth login attempt...');
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId, email_verified } = payload;

    console.log(`✅ Google token verified for: ${email}`);
    if (!email_verified) return res.status(403).json({ success: false, message: 'Email not verified by Google' });

    let user = await User.findOne({ $or: [{ email: email.toLowerCase() }, { googleId: googleId }] });

    if (!user) {
      const username = email.split('@')[0].toLowerCase() + '_google';
      let finalUsername = username;
      const existingUser = await User.findOne({ username: finalUsername });
      if (existingUser) finalUsername = username + '_' + Math.random().toString(36).substring(7);
      
      const lastUser = await User.findOne().sort({ _id: -1 });
      const nextId = lastUser ? lastUser._id + 1 : 1;
      
      const newUserData = {
        _id: nextId,
        username: finalUsername,
        email: email.toLowerCase(),
        name: name || finalUsername,
        googleId: googleId,
        profilePicture: picture,
        authProvider: 'google',
        isActive: true,
        lastLogin: new Date()
      };
      
      user = await User.create(newUserData);
      console.log(`✅ New user created via Google OAuth: ${email} (ID: ${nextId})`);
    } else {
      user.googleId = googleId;
      user.profilePicture = picture;
      user.name = name || user.name;
      user.authProvider = 'google';
      user.lastLogin = new Date();
      await user.save({ validateModifiedOnly: true }); // Prevents password validation on existing users
      console.log(`✅ Existing user logged in via Google: ${email}`);
    }

    req.session.userId = user._id.toString();
    req.session.user = { id: user._id.toString(), username: user.username, role: user.role, authMethod: 'google' };

    await new Promise((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
    console.log(`✅ Session saved for Google user: ${user.username}`);

    res.json({ success: true, message: 'Google login successful', user: req.session.user });

  } catch (error) {
    console.error('❌ Google auth error:', error);
    res.status(500).json({ success: false, message: 'Google authentication failed', error: error.message });
  }
});

// Other routes (login, register, verify, etc.) should also be updated to use 'User' instead of 'db.User'.
// This provided snippet focuses on the failing Google route.

// (Include your other routes like /register, /login, /verify here, ensuring they use 'User' instead of 'db.User')

module.exports = router;