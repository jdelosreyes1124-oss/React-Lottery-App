// migrate-users-for-google-oauth.js
// Run this ONCE after updating your User model to add default values for existing users

const mongoose = require('mongoose');
require('dotenv').config();

async function migrateUsers() {
  try {
    console.log('🔄 Starting user migration for Google OAuth support...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || process.env.DATABASE_URL);
    console.log('✅ Connected to MongoDB');

    // Get the User collection directly
    const User = mongoose.connection.collection('users');

    // Update all existing users to have default authProvider
    const result = await User.updateMany(
      { 
        authProvider: { $exists: false }  // Only users without authProvider
      },
      { 
        $set: { 
          authProvider: 'local',  // Set to 'local' for existing users
          googleId: null,
          profilePicture: null,
          name: null
        } 
      }
    );

    console.log(`✅ Updated ${result.modifiedCount} users with default authProvider`);

    // Verify the update
    const totalUsers = await User.countDocuments();
    const localUsers = await User.countDocuments({ authProvider: 'local' });
    const googleUsers = await User.countDocuments({ authProvider: 'google' });

    console.log('\n📊 Migration Summary:');
    console.log(`   Total users: ${totalUsers}`);
    console.log(`   Local auth users: ${localUsers}`);
    console.log(`   Google auth users: ${googleUsers}`);
    
    console.log('\n✅ Migration completed successfully!');
    
    // Close connection
    await mongoose.connection.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateUsers();