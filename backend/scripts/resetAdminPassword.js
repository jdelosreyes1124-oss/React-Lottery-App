// scripts/resetAdminPasswordSimple.js
// Simplest version - you provide the connection string directly

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const readline = require('readline');

// ============================================
// EDIT THESE SETTINGS
// ============================================

// Option 1: Put your connection string here directly
const MONGODB_URI = 'mongodb+srv://jdelosreyes1124_db_user:beUJpu8gDCFmKCrO@lotterypredictiondb.muoegbn.mongodb.net/?retryWrites=true&w=majority&appName=LotteryPredictionDB'; // e.g., 'mongodb+srv://username:password@cluster.mongodb.net/'
const MONGODB_DB = 'lottery_prediction_db';

// Option 2: Or set as environment variables in your terminal:
// Windows: set MONGODB_URI=mongodb+srv://...
// Mac/Linux: export MONGODB_URI=mongodb+srv://...

// ============================================

async function resetAdminPassword() {
  try {
    // Get connection string
    let mongoUri = MONGODB_URI || process.env.MONGODB_URI;
    
    if (!mongoUri) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('❌ MongoDB connection string not provided!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('\n📋 Two ways to provide it:');
      console.log('\n1. Edit this file (line 13):');
      console.log('   const MONGODB_URI = "mongodb+srv://..."');
      console.log('\n2. Set environment variable:');
      console.log('   Windows: set MONGODB_URI=mongodb+srv://...');
      console.log('   Mac/Linux: export MONGODB_URI=mongodb+srv://...');
      console.log('\n💡 Get your connection string from MongoDB Atlas');
      process.exit(1);
    }

    if (!mongoUri.endsWith('/')) mongoUri += '/';
    mongoUri += MONGODB_DB || process.env.MONGODB_DB || 'lottery_prediction_db';

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔐 Admin Password Reset Tool');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔗 Connecting to MongoDB...');

    // Connect to MongoDB
    await mongoose.connect(mongoUri);
    console.log('✅ Connected successfully!');

    // Get users collection
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    console.log('\n🔍 Searching for admin user...');

    // Find admin user
    const admin = await usersCollection.findOne({ 
      $or: [
        { username: 'admin' },
        { role: 'admin' }
      ]
    });

    if (!admin) {
      console.log('❌ Admin user not found!');
      console.log('\n📋 Here are all users in the database:');
      const allUsers = await usersCollection.find({}).toArray();
      if (allUsers.length === 0) {
        console.log('   (No users found - database might be empty)');
      } else {
        allUsers.forEach((u, i) => {
          console.log(`   ${i + 1}. Username: "${u.username}", Role: "${u.role}", ID: ${u._id}`);
        });
      }
      console.log('\n💡 Edit line 62 in this script to match your admin username');
      await mongoose.connection.close();
      process.exit(1);
    }

    console.log(`✅ Found admin: "${admin.username}" (ID: ${admin._id})`);

    // Hash the new password
    const newPassword = 'Admin123!';
    console.log('\n🔐 Generating secure password hash...');
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update admin user
    const result = await usersCollection.updateOne(
      { _id: admin._id },
      { 
        $set: { 
          password: hashedPassword,
          authProvider: 'local',
          lastLogin: new Date()
        } 
      }
    );

    if (result.modifiedCount === 1) {
      console.log('✅ Password updated in database!');
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🎉 SUCCESS! Admin password has been reset');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('\n📋 Use these credentials to login:');
      console.log(`   👤 Username: ${admin.username}`);
      console.log(`   🔑 Password: ${newPassword}`);
      console.log('\n🔒 Password is securely hashed in database ✅');
    } else {
      console.log('⚠️  No changes made');
      console.log('💡 Password might already be set correctly');
    }

    await mongoose.connection.close();
    console.log('\n✅ All done! You can now login.');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    process.exit(0);

  } catch (error) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('❌ ERROR');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('Error:', error.message);
    
    if (error.message.includes('authentication')) {
      console.log('\n💡 Check your MongoDB credentials');
    } else if (error.message.includes('network')) {
      console.log('\n💡 Check your internet connection');
    }
    
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
}

// Run the script
console.log('\n');
resetAdminPassword();