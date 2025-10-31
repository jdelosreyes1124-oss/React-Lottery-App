// test-user-model.js
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models_mongoose/User.js');

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB');
    
    // Try creating a Google user (should work)
    const testUser = new User({
      _id: 999,
      username: 'test_google_user',
      email: 'test@gmail.com',
      googleId: 'test123',
      authProvider: 'google',
      name: 'Test User',
      isActive: true
    });
    
    return testUser.validate();
  })
  .then(() => {
    console.log('✅ Validation passed! Google user can be created without password');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Validation failed:', err.message);
    process.exit(1);
  });