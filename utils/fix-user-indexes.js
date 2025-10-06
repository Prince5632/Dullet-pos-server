const mongoose = require('mongoose');
const { connectDB } = require('../config/database');

/**
 * Script to fix user schema indexes after schema changes
 * This script will:
 * 1. Drop the existing phone index (if it exists and is not sparse)
 * 2. Recreate it as a sparse index
 * 3. Ensure all other indexes are properly created
 */

const fixUserIndexes = async () => {
  try {
    console.log('🔧 Starting user index fix...');
    
    // Connect to database
    await connectDB();
    console.log('✅ Connected to database');
    
    // Get the User collection
    const User = mongoose.model('User');
    const collection = User.collection;
    
    // Get existing indexes
    const existingIndexes = await collection.indexes();
    console.log('📋 Existing indexes:', existingIndexes.map(idx => ({ name: idx.name, key: idx.key, sparse: idx.sparse })));
    
    // Check if phone index exists and is not sparse
    const phoneIndex = existingIndexes.find(idx => 
      idx.key && idx.key.phone === 1 && !idx.sparse
    );
    
    if (phoneIndex) {
      console.log('🗑️  Dropping non-sparse phone index...');
      await collection.dropIndex('phone_1');
      console.log('✅ Non-sparse phone index dropped');
    } else {
      console.log('ℹ️  Phone index is already sparse or doesn\'t exist');
    }
    
    // Ensure all schema indexes are created properly
    console.log('🔨 Ensuring all schema indexes are created...');
    await User.createIndexes();
    console.log('✅ All schema indexes created');
    
    // Verify the new indexes
    const newIndexes = await collection.indexes();
    console.log('📋 Updated indexes:', newIndexes.map(idx => ({ name: idx.name, key: idx.key, sparse: idx.sparse })));
    
    // Check if phone index is now sparse
    const newPhoneIndex = newIndexes.find(idx => 
      idx.key && idx.key.phone === 1
    );
    
    if (newPhoneIndex && newPhoneIndex.sparse) {
      console.log('✅ Phone index is now properly configured as sparse');
    } else if (newPhoneIndex) {
      console.log('⚠️  Phone index exists but may not be sparse');
    } else {
      console.log('⚠️  Phone index not found');
    }
    
    console.log('🎉 User index fix completed successfully!');
    
  } catch (error) {
    console.error('❌ Error fixing user indexes:', error);
    throw error;
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
};

// Run the fix if this script is executed directly
if (require.main === module) {
  fixUserIndexes()
    .then(() => {
      console.log('✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { fixUserIndexes };
