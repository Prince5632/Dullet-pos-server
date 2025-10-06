const mongoose = require('mongoose');
const { connectDB } = require('../config/database');

/**
 * Script to fix email index issues in the User collection
 * This script will:
 * 1. Check for users with null/empty email values
 * 2. Drop and recreate email indexes if needed
 * 3. Clean up duplicate null email entries
 */

const fixEmailIndexes = async () => {
  try {
    console.log('🔧 Starting email index fix...');
    
    // Connect to database
    await connectDB();
    console.log('✅ Connected to database');
    
    // Get the User collection
    const User = mongoose.model('User');
    const collection = User.collection;
    
    // Check for users with null or empty email values
    console.log('🔍 Checking for users with null/empty email values...');
    const usersWithNullEmail = await collection.find({ 
      $or: [
        { email: null },
        { email: "" },
        { email: { $exists: false } }
      ]
    }).toArray();
    
    console.log(`📊 Found ${usersWithNullEmail.length} users with null/empty email values`);
    
    if (usersWithNullEmail.length > 0) {
      console.log('👥 Users with null/empty emails:');
      usersWithNullEmail.forEach((user, index) => {
        console.log(`   ${index + 1}. ${user.firstName} ${user.lastName} (ID: ${user._id}) - email: ${user.email}`);
      });
    }
    
    // Get existing indexes
    const existingIndexes = await collection.indexes();
    console.log('📋 Existing indexes:', existingIndexes.map(idx => ({ 
      name: idx.name, 
      key: idx.key, 
      sparse: idx.sparse,
      unique: idx.unique 
    })));
    
    // Check email index
    const emailIndex = existingIndexes.find(idx => 
      idx.key && idx.key.email === 1
    );
    
    if (emailIndex) {
      console.log(`📧 Email index found: sparse=${emailIndex.sparse}, unique=${emailIndex.unique}`);
      
      // If email index is not sparse, we need to fix it
      if (!emailIndex.sparse) {
        console.log('🗑️  Dropping non-sparse email index...');
        await collection.dropIndex('email_1');
        console.log('✅ Non-sparse email index dropped');
        
        // Recreate as sparse
        console.log('🔨 Creating sparse email index...');
        await collection.createIndex({ email: 1 }, { unique: true, sparse: true });
        console.log('✅ Sparse email index created');
      }
    } else {
      console.log('⚠️  Email index not found, creating it...');
      await collection.createIndex({ email: 1 }, { unique: true, sparse: true });
      console.log('✅ Email index created');
    }
    
    // Clean up users with null emails by removing the email field entirely
    if (usersWithNullEmail.length > 0) {
      console.log('🧹 Cleaning up null email values...');
      const result = await collection.updateMany(
        { 
          $or: [
            { email: null },
            { email: "" }
          ]
        },
        { $unset: { email: "" } }
      );
      console.log(`✅ Cleaned up ${result.modifiedCount} users with null/empty emails`);
    }
    
    // Verify the final state
    const finalIndexes = await collection.indexes();
    console.log('📋 Final indexes:', finalIndexes.map(idx => ({ 
      name: idx.name, 
      key: idx.key, 
      sparse: idx.sparse,
      unique: idx.unique 
    })));
    
    const finalNullEmailCount = await collection.countDocuments({ 
      $or: [
        { email: null },
        { email: "" }
      ]
    });
    console.log(`📊 Final count of users with null/empty emails: ${finalNullEmailCount}`);
    
    console.log('🎉 Email index fix completed successfully!');
    
  } catch (error) {
    console.error('❌ Error fixing email indexes:', error);
    throw error;
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
};

// Run the fix if this script is executed directly
if (require.main === module) {
  fixEmailIndexes()
    .then(() => {
      console.log('✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { fixEmailIndexes };