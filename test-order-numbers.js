const mongoose = require('mongoose');
require('dotenv').config();

// Import the Order model
const Order = require('./models/order.schema');

// Connect to MongoDB
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dullet-pos');
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
}

// Test function to create multiple orders concurrently
async function testConcurrentOrderCreation() {
  console.log('Testing concurrent order creation...');
  
  // Create a dummy customer and user ID for testing
  const dummyCustomerId = new mongoose.Types.ObjectId();
  const dummyUserId = new mongoose.Types.ObjectId();
  
  // Create 10 orders concurrently
  const promises = [];
  for (let i = 0; i < 10; i++) {
    const orderData = {
      type: 'order',
      customer: dummyCustomerId,
      items: [{
        productName: `Test Product ${i}`,
        quantity: 1,
        unit: 'KG',
        ratePerUnit: 100,
        totalAmount: 100
      }],
      subtotal: 100,
      totalAmount: 100,
      paymentTerms: 'Cash',
      paymentStatus: 'pending',
      createdBy: dummyUserId
    };
    
    promises.push(Order.create(orderData));
  }
  
  try {
    const results = await Promise.all(promises);
    console.log('✅ All orders created successfully!');
    
    // Check for duplicate order numbers
    const orderNumbers = results.map(order => order.orderNumber);
    const uniqueNumbers = new Set(orderNumbers);
    
    console.log(`Created ${results.length} orders`);
    console.log(`Unique order numbers: ${uniqueNumbers.size}`);
    
    if (orderNumbers.length === uniqueNumbers.size) {
      console.log('✅ No duplicate order numbers found!');
    } else {
      console.log('❌ Duplicate order numbers detected!');
      console.log('Order numbers:', orderNumbers);
    }
    
    // Display the generated order numbers
    console.log('\nGenerated order numbers:');
    orderNumbers.forEach((num, index) => {
      console.log(`${index + 1}: ${num}`);
    });
    
  } catch (error) {
    console.error('❌ Error creating orders:', error.message);
  }
}

// Test function for visits
async function testConcurrentVisitCreation() {
  console.log('\nTesting concurrent visit creation...');
  
  const dummyCustomerId = new mongoose.Types.ObjectId();
  const dummyUserId = new mongoose.Types.ObjectId();
  
  const promises = [];
  for (let i = 0; i < 5; i++) {
    const visitData = {
      type: 'visit',
      customer: dummyCustomerId,
      scheduleDate: new Date(),
      capturedImage: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
      captureLocation: {
        latitude: 28.6139 + (Math.random() * 0.01),
        longitude: 77.2090 + (Math.random() * 0.01),
        address: `Test Address ${i}`,
        timestamp: new Date()
      },
      createdBy: dummyUserId
    };
    
    promises.push(Order.create(visitData));
  }
  
  try {
    const results = await Promise.all(promises);
    console.log('✅ All visits created successfully!');
    
    const visitNumbers = results.map(visit => visit.orderNumber);
    const uniqueNumbers = new Set(visitNumbers);
    
    console.log(`Created ${results.length} visits`);
    console.log(`Unique visit numbers: ${uniqueNumbers.size}`);
    
    if (visitNumbers.length === uniqueNumbers.size) {
      console.log('✅ No duplicate visit numbers found!');
    } else {
      console.log('❌ Duplicate visit numbers detected!');
    }
    
    console.log('\nGenerated visit numbers:');
    visitNumbers.forEach((num, index) => {
      console.log(`${index + 1}: ${num}`);
    });
    
  } catch (error) {
    console.error('❌ Error creating visits:', error.message);
  }
}

// Cleanup function
async function cleanup() {
  try {
    // Remove test orders and visits
    await Order.deleteMany({ 
      $or: [
        { orderNumber: /^ORD\d{8}/ },
        { orderNumber: /^VST\d{8}/ }
      ]
    });
    console.log('\n🧹 Cleaned up test data');
  } catch (error) {
    console.error('Error during cleanup:', error.message);
  }
}

// Main test function
async function runTests() {
  await connectDB();
  
  try {
    await testConcurrentOrderCreation();
    await testConcurrentVisitCreation();
  } finally {
    await cleanup();
    await mongoose.connection.close();
    console.log('\n✅ Tests completed and database connection closed');
  }
}

// Run the tests
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests };