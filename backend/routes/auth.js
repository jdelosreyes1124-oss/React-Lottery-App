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
// ✅ ADD THIS NEW ENDPOINT - POST /api/auth/google/register
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
// Sign Up Form Component
const SignUpForm = ({ onClose, onSwitchToLogin }) => {
  const [formData, setFormData] = useState({ 
    email: '', 
    username: '', 
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const { register, googleLogin } = useAuth();

  // Validation function
  const validateForm = () => {
    const errors = {};
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email || !emailRegex.test(formData.email)) {
      errors.email = 'Please enter a valid email address';
    }
    
    // Username validation
    if (!formData.username || formData.username.trim().length < 3) {
      errors.username = 'Username must be at least 3 characters';
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(formData.username)) {
      errors.username = 'Username can only contain letters, numbers, underscores, and hyphens';
    }
    
    // Password validation
    if (!formData.password || formData.password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }
    
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.password)) {
      errors.password = 'Password must contain uppercase, lowercase, and numbers';
    }
    
    // Confirm password validation
    if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }
    
    return errors;
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error for this field when user starts typing
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError('');
    
    // Validate form
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    setIsLoading(true);

    try {
      const result = await register({
        username: formData.username.trim(),
        password: formData.password,
        email: formData.email.toLowerCase()
      });

      if (result.success) {
        setError('');
        onSwitchToLogin();
      } else {
        setError(result.error || 'Sign up failed');
      }
    } catch (err) {
      setError(err.message || 'Connection failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleResponse = async (response) => {
    setIsLoading(true);
    setError('');
    
    try {
      // First, try to register with Google
      const result = await api.googleRegister(response.credential, formData.username.trim());
      
      if (result.success) {
        onSwitchToLogin();
      } else if (result.error && result.error.includes('already registered')) {
        setError('This Google account is already registered. Please sign in instead.');
      } else {
        setError(result.error || 'Google sign up failed');
      }
    } catch (err) {
      if (err.message.includes('already')) {
        setError('This Google account is already registered. Please sign in instead.');
      } else {
        setError(err.message || 'Google sign up failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Load Google Sign-In script
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    script.onload = () => {
      if (window.google && GOOGLE_CLIENT_ID) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleResponse,
        });
        const googleButton = document.getElementById('googleSignUpButton');
        if (googleButton) {
          window.google.accounts.id.renderButton(
            googleButton,
            { 
              theme: 'outline', 
              size: 'large', 
              width: 350,
              text: 'signup_with',
              shape: 'rectangular'
            }
          );
        }
      }
    };

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-96 max-w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold flex items-center space-x-2">
            <Shield className="h-5 w-5 text-blue-600" />
            <span>Create Account</span>
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 hover:scale-110 transition-all duration-200 text-xl">×</button>
        </div>
        
        <div className="space-y-4">
          {/* Google Sign-Up Button */}
          {GOOGLE_CLIENT_ID && (
            <>
              <div className="flex justify-center">
                <div id="googleSignUpButton"></div>
              </div>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">Or continue with email</span>
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-2">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <span className="text-red-800 text-sm">{error}</span>
            </div>
          )}

          {/* Email Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSignUp(e)}
              className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                validationErrors.email ? 'border-red-500 bg-red-50' : 'border-gray-300'
              }`}
              placeholder="your@email.com"
              disabled={isLoading}
            />
            {validationErrors.email && (
              <p className="text-red-600 text-xs mt-1">{validationErrors.email}</p>
            )}
          </div>

          {/* Username Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => handleInputChange('username', e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSignUp(e)}
              className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                validationErrors.username ? 'border-red-500 bg-red-50' : 'border-gray-300'
              }`}
              placeholder="Choose a username"
              disabled={isLoading}
            />
            {validationErrors.username && (
              <p className="text-red-600 text-xs mt-1">{validationErrors.username}</p>
            )}
            <p className="text-gray-500 text-xs mt-1">3+ characters, letters, numbers, _, -</p>
          </div>

          {/* Password Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => handleInputChange('password', e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSignUp(e)}
              className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                validationErrors.password ? 'border-red-500 bg-red-50' : 'border-gray-300'
              }`}
              placeholder="Min. 6 characters"
              disabled={isLoading}
            />
            {validationErrors.password && (
              <p className="text-red-600 text-xs mt-1">{validationErrors.password}</p>
            )}
            <p className="text-gray-500 text-xs mt-1">Must include uppercase, lowercase & numbers</p>
          </div>

          {/* Confirm Password Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
            <input
              type="password"
              value={formData.confirmPassword}
              onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSignUp(e)}
              className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                validationErrors.confirmPassword ? 'border-red-500 bg-red-50' : 'border-gray-300'
              }`}
              placeholder="Confirm password"
              disabled={isLoading}
            />
            {validationErrors.confirmPassword && (
              <p className="text-red-600 text-xs mt-1">{validationErrors.confirmPassword}</p>
            )}
          </div>

          {/* Sign Up Button */}
          <button
            onClick={handleSignUp}
            disabled={isLoading}
            className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 hover:scale-105 transition-all duration-200 disabled:opacity-50 font-medium flex items-center justify-center space-x-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Creating Account...</span>
              </>
            ) : (
              <>
                <Shield className="h-4 w-4" />
                <span>Sign Up</span>
              </>
            )}
          </button>

          {/* Switch to Login */}
          <div className="text-center">
            <p className="text-sm text-gray-600">
              Already have an account?{' '}
              <button
                onClick={onSwitchToLogin}
                className="text-blue-600 hover:text-blue-800 font-medium hover:underline"
              >
                Sign In
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
// POST /api/auth/google - Google OAuth Login
router.post('/google', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ 
        success: false, 
        message: 'Google token is required' 
      });
    }

    console.log('🔐 Google OAuth login attempt...');
    
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

    if (!user) {
      // Create new user via Google OAuth
      console.log('📝 Creating new user via Google OAuth...');
      
      // Generate unique username
      const baseUsername = email.split('@')[0].toLowerCase() + '_google';
      let finalUsername = baseUsername;
      
      const existingUser = await User.findOne({ username: finalUsername });
      if (existingUser) {
        finalUsername = baseUsername + '_' + Math.random().toString(36).substring(7);
      }
      
      // Get next user ID
      const lastUser = await User.findOne().sort({ _id: -1 });
      const nextId = lastUser ? lastUser._id + 1 : 1;
      
      // Create new user object with all required fields for Google OAuth
      const newUserData = {
        _id: nextId,
        username: finalUsername,
        email: email.toLowerCase(),
        name: name || finalUsername,
        googleId: googleId,
        profilePicture: picture,
        authProvider: 'google', // Explicitly set to 'google'
        isActive: true,
        lastLogin: new Date(),
        // NOTE: password is intentionally omitted for Google OAuth users
      };
      
      console.log('📦 New user data prepared:', { 
        username: newUserData.username, 
        email: newUserData.email,
        authProvider: newUserData.authProvider,
        hasGoogleId: !!newUserData.googleId 
      });
      
      // Create the user
      user = await User.create(newUserData);
      console.log(`✅ New user created via Google OAuth: ${email} (ID: ${nextId})`);
      
    } else {
      // Update existing user
      console.log('🔄 Updating existing user with Google OAuth data...');
      
      // If user exists but doesn't have googleId (was created via local auth)
      if (!user.googleId) {
        console.log('🔗 Linking Google account to existing local account...');
      }
      
      // Update user fields
      user.googleId = googleId;
      user.profilePicture = picture;
      user.name = name || user.name;
      user.authProvider = 'google'; // Update to Google auth
      user.lastLogin = new Date();
      
      // Save with validateModifiedOnly to prevent password validation
      await user.save({ validateModifiedOnly: true });
      console.log(`✅ Existing user logged in via Google: ${email}`);
    }

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
    
    // More detailed error response
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
      password: password, // Will be hashed by pre-save hook
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