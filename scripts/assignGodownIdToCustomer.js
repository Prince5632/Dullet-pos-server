// updateGodownAssignments.js
const { MongoClient, ObjectId } = require("mongodb");

const uri = "mongodb+srv://dulletindustry_db_user:dullet@cluster0.pibmlje.mongodb.net"; // 🔧 replace with your connection string
const dbName = "dullet-pos";       // 🔧 replace with your DB name

async function run() {
  const client = new MongoClient(uri);

  let updatedCount = 0;
  let skippedCount = 0;
  let alreadyAssignedCount = 0;
  let pendingCount = 0;
  let errorCount = 0;

  try {
    await client.connect();
    const db = client.db(dbName);
    const customers = db.collection("customers");
    const orders = db.collection("orders");

    console.log("🚀 Connected to MongoDB");

    // Step 1: Find customers missing assignedGodownId
    const missingGodownCustomers = await customers
      .find({
        $or: [
          { assignedGodownId: { $exists: false } },
          { assignedGodownId: null },
        ],
      })
      .toArray();

    console.log(`🔍 Found ${missingGodownCustomers.length} customers without assignedGodownId`);

    for (const customer of missingGodownCustomers) {
      try {
        if (!customer || !customer._id) {
          console.warn(`⚠️ Skipping invalid customer: ${JSON.stringify(customer)}`);
          skippedCount++;
          continue;
        }

        // Step 2: Find related orders
        const customerOrders = await orders
          .find({ customer: customer._id })
          .toArray();

        if (!customerOrders.length) {
          console.log(`⏩ No orders found for ${customer.businessName} (${customer._id})`);
          skippedCount++;
          continue;
        }

        if (customerOrders.length > 1) {
          console.log(`⏩ Multiple orders for ${customer.businessName} (${customer._id}), skipping`);
          skippedCount++;
          continue;
        }

        const order = customerOrders[0];

        if (!order?.godown) {
          console.log(`order.godown: ${order.godown} type - ${typeof order.godown}`);
          console.log(`⚠️ Invalid godown for ${customer.businessName} (${customer._id})`);
          pendingCount++;
          continue;
        }

        // Step 3: Update assignedGodownId
        const result = await customers.updateOne(
          { _id: customer._id },
          { $set: { assignedGodownId: order.godown } }
        );

        if (result.matchedCount === 1 && result.modifiedCount === 1) {
          updatedCount++;
          console.log(`✅ Updated ${customer.businessName} (${customer._id}) with godown ${order.godown}`);
        } else {
          console.warn(`⚠️ Failed to update ${customer.businessName} (${customer._id})`);
          errorCount++;
        }
      } catch (innerErr) {
        console.error(`❌ Error processing ${customer.businessName || customer._id}: ${innerErr.message}`);
        errorCount++;
      }
    }

    // Step 4: Count remaining customers still missing assignedGodownId
    const countRemaining = await customers.countDocuments({
      $or: [
        { assignedGodownId: { $exists: false } },
        { assignedGodownId: null },
      ],
    });

    // Step 5: Print Summary
    console.log("\n===== SUMMARY =====");
    console.log(`✅ Updated Customers: ${updatedCount}`);
    console.log(`📦 Already Assigned: ${alreadyAssignedCount}`);
    console.log(`⏩ Skipped Customers: ${skippedCount}`);
    console.log(`🕓 Pending (still null/missing): ${countRemaining}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log("===================\n");

  } catch (err) {
    console.error(`🚨 Fatal error: ${err.message}`);
  } finally {
    await client.close();
    console.log("🔒 MongoDB connection closed");
  }
}

run();
