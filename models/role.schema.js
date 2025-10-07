const mongoose = require("mongoose");

const roleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    permissions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Permission",
      },
    ],
    isDefault: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Static method to seed default roles
roleSchema.statics.seedDefaultRoles = async function () {
  const Permission = mongoose.model("Permission");

  // Get all permissions for Super Admin
  const allPermissions = await Permission.find({ isActive: true });

  const defaultRoles = [
    {
      name: "Super Admin",
      description: "Full system access with all permissions",
      permissions: allPermissions.map((p) => p._id),
      isDefault: true,
    },
    {
      name: "Admin",
      description: "Administrative access with most permissions",
      permissions: allPermissions
        .filter(
          (p) =>
            !p.name.includes("settings.manage") &&
            !p.name.includes("users.delete")
        )
        .map((p) => p._id),
      isDefault: true,
    },
    {
      name: "Manager",
      description: "Management level access",
      permissions: allPermissions
        .filter(
          (p) =>
            p.action === "read" ||
            p.action === "update" ||
            p.action === "approve" ||
            (p.module === "orders" &&
              ["create", "manage"].includes(p.action)) ||
            (p.module === "customers" &&
              ["create", "manage"].includes(p.action)) ||
            (p.module === "attendance" &&
              ["create", "read", "update", "manage"].includes(p.action)) ||
            (p.module === "godowns" && p.action === "read")
        )
        .map((p) => p._id),
      isDefault: true,
    },
    {
      name: "Sales Executive",
      description: "Sales operations access",
      permissions: allPermissions
        .filter(
          (p) =>
            (p.module === "orders" &&
              ["create", "read", "update"].includes(p.action)) ||
            (p.module === "customers" &&
              ["create", "read", "update"].includes(p.action)) ||
            (p.module === "stock" && p.action === "read") ||
            (p.module === "attendance" &&
              ["create", "read"].includes(p.action)) ||
            (p.module === "godowns" && p.action === "read")
        )
        .map((p) => p._id),
      isDefault: true,
    },
    {
      name: "Staff",
      description: "Basic staff access",
      permissions: allPermissions
        .filter(
          (p) =>
            p.action === "read" &&
            ["orders", "stock", "production", "attendance", "godowns"].includes(
              p.module
            )
        )
        .map((p) => p._id),
      isDefault: true,
    },
    {
      name: "Driver",
      description: "Delivery driver access",
      permissions: allPermissions
        .filter(
          (p) =>
            (p.module === "orders" &&
              (p.action === "read" ||
                p.action === "update" ||
                p.action === "manage")) ||
            (p.module === "attendance" &&
              ["create", "read"].includes(p.action)) ||
            (p.module === "godowns" && p.action === "read")
        )
        .map((p) => p._id),
      isDefault: true,
    },
  ];

  for (const role of defaultRoles) {
    await this.findOneAndUpdate({ name: role.name }, role, {
      upsert: true,
      new: true,
    });
  }
};

// Instance method to check if role has specific permission
roleSchema.methods.hasPermission = function (permissionName) {
  return this.permissions.some(
    (permission) => permission.name === permissionName
  );
};

module.exports = mongoose.model("Role", roleSchema);
