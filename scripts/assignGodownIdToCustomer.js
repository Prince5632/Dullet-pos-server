const { default: mongoose } = require("mongoose");
const { Customer, Order } = require("../models");

// Replace with your MongoDB URI
const MONGO_URI =
  "mongodb+srv://sensationsolutionsin:97G1KH7aAEgiZ1Xe@cluster0.xnsitaj.mongodb.net/dullet-pos-t";

async function assignGodownToCustomers() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // Step 1: Find customers with no assignedGodownId (exclude one)
    const excludedCustomerId = new mongoose.Types.ObjectId(
      "68dffeb9954a556bd501b4cd"
    );

    const customers = await Customer.find({
      _id: { $ne: excludedCustomerId },
      $or: [
        { assignedGodownId: { $exists: false } },
        { assignedGodownId: null },
      ],
    }).lean();

    console.log(`Found ${customers.length} customers without assignedGodownId`);

    let updatedCount = 0;
    const unassignedCustomers = [];

    for (const customer of customers) {
      const orders = await Order.find({
        customer: customer._id,
        type: { $in: ["order", "visit"] },
      })
        .select("godownId")
        .lean();

      if (!orders.length) {
        unassignedCustomers.push({
          customer: customer._id,
          reason: "No orders or visits found",
        });
        continue;
      }

      // Filter out orders without valid godownId
      const validOrders = orders.filter((o) => o.godownId);
      if (!validOrders.length) {
        unassignedCustomers.push({
          customer: customer._id,
          reason: "No valid godownId found in orders",
        });
        continue;
      }

      // Count occurrences of each godownId
      const godownCount = {};
      for (const order of validOrders) {
        const id = String(order.godown);
        godownCount[id] = (godownCount[id] || 0) + 1;
      }

      const sortedGodowns = Object.entries(godownCount).sort(
        (a, b) => b[1] - a[1]
      );
      const [topGodownId, topCount] = sortedGodowns[0];

      // Check if there’s a tie between godowns
      const secondTop = sortedGodowns[1];
      if (secondTop && secondTop[1] === topCount) {
        unassignedCustomers.push({
          customer: customer._id,
          reason: "Multiple godowns have the same count",
        });
        continue;
      }

      // Update the customer
      await Customer.updateOne(
        { _id: customer._id },
        { $set: { assignedGodownId: topGodownId } }
      );
      updatedCount++;

      console.log(
        `✅ Updated customer ${customer._id} → godown ${topGodownId} (used ${topCount} times)`
      );
    }

    console.log("\n===============================");
    console.log(`✅ Total customers updated: ${updatedCount}`);
    console.log(`⚠️  Unassigned customers: ${unassignedCustomers.length}`);
    console.log("===============================");

    if (unassignedCustomers.length) {
      console.table(unassignedCustomers);
    }

    await mongoose.connection.close();
    console.log("🔒 MongoDB connection closed");
  } catch (error) {
    console.error("❌ Error:", error);
    await mongoose.connection.close();
  }
}

assignGodownToCustomers();
