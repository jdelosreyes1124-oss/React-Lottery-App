require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../models_mongoose');

async function createAdminUser() {
  try {
    await db.connectDB();
    
    const username = 'admin';
    const password = 'Admin123!'; // Change this!
    
    // Check if admin exists
    const existing = await db.User.findOne({ username });
    if (existing) {
      console.log('Admin user already exists');
      existing.role = 'admin';
      await existing.save();
      console.log('Updated to admin role');
    } else {
      // Get the highest existing ID and add 1
      const lastUser = await db.User.findOne().sort({ _id: -1 });
      const newId = lastUser ? lastUser._id + 1 : 1;
      
      // Create new admin
      const hashedPassword = await bcrypt.hash(password, 10);
      const admin = new db.User({
        _id: newId,  // Add this line
        username,
        password: hashedPassword,
        role: 'admin',
        email: 'admin@lottery.com',
        isActive: true
      });
      await admin.save();
      console.log('Admin user created successfully');
      console.log('Username:', username);
      console.log('Password:', password);
      console.log('⚠️  CHANGE THIS PASSWORD AFTER FIRST LOGIN!');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

createAdminUser();