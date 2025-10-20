// createAdmin.js - Run this once to create/update admin user
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function createAdmin() {
  try {
    // Build connection string
    let mongoUri = process.env.MONGODB_URI;
    if (!mongoUri.endsWith('/')) mongoUri += '/';
    mongoUri += process.env.MONGODB_DB;
    
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
    
    // Define User schema
    const userSchema = new mongoose.Schema({
      _id: Number,
      username: { type: String, required: true, unique: true },
      email: { type: String, unique: true, sparse: true },
      password: { type: String, required: true },
      role: { type: String, enum: ['user', 'admin'], default: 'user' },
      isActive: { type: Boolean, default: true },
      lastLogin: Date
    }, {
      timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
    });
    
    const User = mongoose.model('User', userSchema, 'users');
    
    const username = 'admin';
    const password = 'Admin123!'; // Your password from the screenshot
    
    // Hash password
    console.log('🔒 Hashing password...');
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    console.log('Original password:', password);
    console.log('Hashed password:', hashedPassword);
    
    // Check if admin exists
    const existingAdmin = await User.findOne({ username });
    
    if (existingAdmin) {
      // Update password
      console.log('📝 Updating existing admin user...');
      existingAdmin.password = hashedPassword;
      existingAdmin.role = 'admin';
      existingAdmin.isActive = true;
      await existingAdmin.save();
      console.log('✅ Admin user updated successfully!');
      console.log('User ID:', existingAdmin._id);
    } else {
      // Get next ID
      const lastUser = await User.findOne().sort({ _id: -1 });
      const nextId = lastUser ? lastUser._id + 1 : 1;
      
      // Create new admin
      console.log('📝 Creating new admin user...');
      const admin = new User({
        _id: nextId,
        username,
        email: 'admin@lottery.com',
        password: hashedPassword,
        role: 'admin',
        isActive: true
      });
      await admin.save();
      console.log('✅ Admin user created successfully!');
      console.log('User ID:', nextId);
    }
    
    console.log('\n=====================================');
    console.log('🎉 Admin Account Ready!');
    console.log('=====================================');
    console.log('Username:', username);
    console.log('Password:', password);
    console.log('Role: admin');
    console.log('=====================================');
    console.log('\n⚠️  Save these credentials securely!');
    console.log('✅ You can now login to your application\n');
    
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

createAdmin();