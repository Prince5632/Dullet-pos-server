const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const { connectDB } = require("./config/database");
const { specs, swaggerUi } = require("./config/swagger");
const { errorHandler, notFound } = require("./utils/errorHandler");

// Import routes
const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/user.routes");
const roleRoutes = require("./routes/role.routes");
const customerRoutes = require("./routes/customer.routes");
const orderRoutes = require("./routes/order.routes");
const godownRoutes = require("./routes/godown.routes");
const attendanceRoutes = require("./routes/attendance.routes");
const reportRoutes = require("./routes/report.routes");
const inventoryRoutes = require("./routes/inventory.routes");
const auditRoutes = require("./routes/audit.routes");

const app = express();
const Models = require("./models");

const PORT = process.env.PORT || 5000;
const HOST = "0.0.0.0"; // <== Binds to all interfaces, needed for EC2

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Swagger Documentation
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(specs, {
    explorer: true,
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "Dullet Industries POS API Documentation",
  })
);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/godowns", godownRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/audit", auditRoutes);

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check endpoint
 *     description: Check if the API server is running and healthy
 *     tags: [System]
 *     security: []
 *     responses:
 *       200:
 *         description: API is healthy and running
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: OK
 *                 message:
 *                   type: string
 *                   example: Dullet POS API is running
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   example: 2024-01-15T10:30:00.000Z
 */
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Dullet POS API is running",
    timestamp: new Date().toISOString(),
  });
});

// Basic route
app.get("/", (req, res) => {
  res.json({ message: "Dullet POS Server is running!" });
});

// 404 handler
app.use(notFound);

// Global error handler
app.use(errorHandler);

// Connect to DB and start server
const startServer = async () => {
  try {
    await connectDB();
    await Models.seedDefaults?.();

    app.listen(PORT, HOST, () => {
      console.log(`
🚀 Dullet POS API Server is running!
📍 Host: ${HOST}
📍 Port: ${PORT}
🌍 Environment: ${process.env.NODE_ENV || "development"}
📊 Database: Connected to MongoDB
⏰ Started at: ${new Date().toISOString()}
      `);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Promise Rejection:", err);
  process.exit(1);
});

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

startServer();
