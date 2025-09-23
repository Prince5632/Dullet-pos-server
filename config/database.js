const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/dullet_pos';
    console.log('Connecting to MongoDB:', mongoUri);
    
    const conn = await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);

    // Seed default data
    await seedDefaultData();
    
  } catch (error) {
    console.error('Database connection error:', error);
    process.exit(1);
  }
};

const seedDefaultData = async () => {
  try {
    const { Permission, Role, User } = require('../models');
    
    // Seed permissions first
    console.log('Seeding default permissions...');
    await Permission.seedDefaultPermissions();
    
    // Seed roles
    console.log('Seeding default roles...');
    await Role.seedDefaultRoles();
    
    // Create default super admin
    console.log('Creating default super admin...');
    await User.createDefaultSuperAdmin();
    
    console.log('Default data seeded successfully');
  } catch (error) {
    console.error('Error seeding default data:', error);
  }
};

module.exports = { connectDB };
