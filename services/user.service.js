const { User, Role, AuditLog, UserSession } = require("../models");
const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");
const { sendNewUserCredentialsEmail } = require("../utils/email");

const UPLOAD_ROOT = path.join(__dirname, "..", "uploads");
const DOCUMENTS_SUBDIR = "documents";
const PROFILES_SUBDIR = "profiles";

const ensureDirExists = async (dirPath) => {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err) {
    console.error("Failed to ensure upload directory", err);
    throw new Error("File storage unavailable");
  }
};

const sanitizeFileName = (name) => {
  if (!name) {
    return `file-${Date.now()}`;
  }
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
};

const getExtensionFromMime = (mimeType) => {
  if (!mimeType || !mimeType.includes("/")) return "";
  const ext = mimeType.split("/").pop();
  if (ext === "jpeg") return "jpg";
  return ext || "";
};

const saveBufferToFile = async (buffer, subDir, originalName) => {
  if (!buffer) return null;

  const targetDir = path.join(UPLOAD_ROOT, subDir);
  await ensureDirExists(targetDir);

  const cleanName = sanitizeFileName(originalName);
  const extension = path.extname(cleanName) || "";
  const finalExtension = extension && extension.length <= 10 ? extension : ".bin";
  const uniqueName = `${crypto.randomUUID()}${finalExtension}`;
  const filePath = path.join(targetDir, uniqueName);

  await fs.writeFile(filePath, buffer);

  return {
    fileName: uniqueName,
    url: `/uploads/${subDir}/${uniqueName}`
  };
};

const buildDocumentEntry = async (documentPayload) => {
  if (!documentPayload?.buffer) return null;
  const saved = await saveBufferToFile(
    documentPayload.buffer,
    DOCUMENTS_SUBDIR,
    documentPayload.originalname || `${documentPayload.type || "document"}.pdf`
  );
  return {
    type: documentPayload.type || "other",
    label: documentPayload.label || documentPayload.originalname,
    fileName: saved.fileName,
    url: saved.url,
    mimeType: documentPayload.mimetype
  };
};

const normalizeAddress = (address) => {
  if (!address || typeof address !== "object") return undefined;
  const sanitized = {};
  Object.entries(address).forEach(([key, value]) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) sanitized[key] = trimmed;
    }
  });
  return Object.keys(sanitized).length ? sanitized : undefined;
};

const normalizeString = (value) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const saveProfilePhoto = async (buffer, email, mimeType) => {
  if (!buffer) return null;
  const extension = getExtensionFromMime(mimeType) || "jpg";
  const originalName = `${sanitizeFileName(email || "user")}-profile.${extension}`;
  return await saveBufferToFile(buffer, PROFILES_SUBDIR, originalName);
};

// Get all users with pagination and filtering
const getAllUsers = async (queryParams, requestingUserId = null) => {
  const {
    page = 1,
    limit = 10,
    search = "",
    department = "",
    role = "",
    isActive = "",
  } = queryParams;

  const query = {};

  // Search functionality
  if (search) {
    query.$or = [
      { firstName: { $regex: search, $options: "i" } },
      { lastName: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { employeeId: { $regex: search, $options: "i" } },
    ];
  }

  // Filter by department
  if (department) {
    query.department = department;
  }

  // Filter by role
  if (role) {
    const roleObj = await Role.findOne({ name: role });
    if (roleObj) {
      query.role = roleObj._id;
    }
  }

  // Filter by active status
  if (isActive !== "") {
    query.isActive = isActive === "true";
  }

  // Apply godown-based filtering for all users based on requesting user's godown access
  if (requestingUserId) {
    // Get the requesting user's godown information
    const requestingUser = await User.findById(requestingUserId)
      .select("primaryGodown accessibleGodowns")
      .lean();

    if (
      requestingUser &&
      (requestingUser.primaryGodown ||
        (requestingUser.accessibleGodowns &&
          requestingUser.accessibleGodowns.length > 0))
    ) {
      // Collect all godowns the requesting user has access to
      const allowedGodowns = [];

      if (requestingUser.primaryGodown) {
        allowedGodowns.push(requestingUser.primaryGodown);
      }

      if (
        requestingUser.accessibleGodowns &&
        requestingUser.accessibleGodowns.length > 0
      ) {
        allowedGodowns.push(...requestingUser.accessibleGodowns);
      }

      // Remove duplicates
      const uniqueGodowns = [
        ...new Set(allowedGodowns.map((id) => id.toString())),
      ];

      // Create godown filter for users
      const godownFilter = {
        $or: [
          // Users whose primaryGodown matches any of the requesting user's godowns
          { primaryGodown: { $in: uniqueGodowns } },
          // Users whose accessibleGodowns have at least one common godown
          { accessibleGodowns: { $in: uniqueGodowns } },
          // Users who don't have any godown assigned (for backward compatibility)
          { 
            $and: [
              { primaryGodown: { $exists: false } },
              { accessibleGodowns: { $size: 0 } }
            ]
          },
          {
            $and: [
              { primaryGodown: null },
              { accessibleGodowns: { $size: 0 } }
            ]
          }
        ],
      };

      // If there was already a search query, combine it with the godown filter
      if (search) {
        query.$and = [
          {
            $or: [
              { firstName: { $regex: search, $options: "i" } },
              { lastName: { $regex: search, $options: "i" } },
              { email: { $regex: search, $options: "i" } },
              { employeeId: { $regex: search, $options: "i" } },
            ],
          },
          godownFilter,
        ];
        // Remove the original $or since we're using $and now
        delete query.$or;
      } else {
        // Apply godown filter directly
        Object.assign(query, godownFilter);
      }
    }
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const users = await User.find(query)
    .populate("role", "name description")
    .populate("primaryGodown", "name location")
    .populate("accessibleGodowns", "name location")
    .select(
      "-password -passwordResetToken -passwordResetExpires -loginAttempts -lockUntil"
    )
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const totalUsers = await User.countDocuments(query);
  const totalPages = Math.ceil(totalUsers / parseInt(limit));

  return {
    success: true,
    data: {
      users,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalUsers,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1,
      },
    },
  };
};

// Get user by ID
const getUserById = async (userId) => {
  const user = await User.findById(userId)
    .populate("role")
    .populate("role.permissions")
    .populate("primaryGodown", "name location")
    .populate("accessibleGodowns", "name location")
    .populate("createdBy", "firstName lastName email")
    .populate("updatedBy", "firstName lastName email")
    .select(
      "-password -passwordResetToken -passwordResetExpires -loginAttempts -lockUntil"
    );

  if (!user) {
    throw new Error("User not found");
  }

  return {
    success: true,
    data: { user },
  };
};

// Create new user
const createUser = async (userData, createdBy) => {
  const {
    firstName,
    lastName,
    email,
    username,
    phone,
    password,
    roleId,
    department,
    position,
    profilePhoto,
    profilePhotoMimeType,
    primaryGodown,
    accessibleGodowns,
    address,
    aadhaarNumber,
    panNumber,
    aadhaarDocument,
    panDocument,
    otherDocuments = []
  } = userData;

  // Check if role exists
  const role = await Role.findById(roleId);
  if (!role || !role.isActive) {
    throw new Error("Invalid or inactive role");
  }

  const documentEntries = [];
  if (aadhaarDocument) {
    const entry = await buildDocumentEntry(aadhaarDocument);
    if (entry) documentEntries.push({ ...entry, type: "aadhaar" });
  }

  if (panDocument) {
    const entry = await buildDocumentEntry(panDocument);
    if (entry) documentEntries.push({ ...entry, type: "pan" });
  }

  if (otherDocuments?.length) {
    for (const documentPayload of otherDocuments) {
      const entry = await buildDocumentEntry(documentPayload);
      if (entry) documentEntries.push(entry);
    }
  }

  let profilePhotoPath = null;
  if (profilePhoto) {
    const saved = await saveProfilePhoto(profilePhoto, email, profilePhotoMimeType);
    profilePhotoPath = saved?.url || null;
  }
   console.log(email,username)
  // Create user object
  const newUserData = {
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    ...(email ? { email: email?.toLowerCase()?.trim() } : {}),
    ...(username ? { username: username?.toLowerCase()?.trim() } : {}),
    phone: phone.trim(),
    password,
    role: roleId,
    department,
    position: position.trim(),
    profilePhoto: profilePhotoPath,
    primaryGodown: primaryGodown || null,
    accessibleGodowns: Array.isArray(accessibleGodowns)
      ? accessibleGodowns
      : primaryGodown
      ? [primaryGodown]
      : [],
    address: normalizeAddress(address),
    aadhaarNumber: normalizeString(aadhaarNumber),
    panNumber: normalizeString(panNumber)?.toUpperCase(),
    documents: documentEntries,
    createdBy: createdBy,
    isActive: true,
  };

  const user = new User(newUserData);
  await user.save();

  const creator = await User.findById(createdBy).select("firstName lastName email");
  let emailSent = false;
  try {
    emailSent = await sendNewUserCredentialsEmail({
      recipientEmail: user.email,
      recipientName: `${user.firstName} ${user.lastName}`.trim(),
      temporaryPassword: password,
      createdByName: creator ? `${creator.firstName || ""} ${creator.lastName || ""}`.trim() : undefined
    });
  } catch (err) {
    console.error("Failed to send onboarding email:", err.message || err);
  }

  if (!emailSent) {
    console.log('⚠️  User created but email not sent. Credentials:');
    console.log(`   📧 Email: ${user.email}`);
    console.log(`   🔑 Password: ${password}`);
  }

  // Log user creation
  await AuditLog.logAction({
    user: createdBy,
    action: "CREATE",
    module: "users",
    resourceType: "User",
    resourceId: user._id.toString(),
    description: `Created new user: ${user.fullName} (${user.email})`,
    newValues: {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      department: user.department,
      position: user.position,
      role: role.name,
    },
  });

  // Return user without sensitive data
  const userResponse = await User.findById(user._id)
    .populate("role", "name description")
    .select(
      "-password -passwordResetToken -passwordResetExpires -loginAttempts -lockUntil"
    );

  return {
    success: true,
    message: "User created successfully",
    data: { user: userResponse },
  };
};

// Update user
const updateUser = async (userId, updateData, updatedBy) => {
  // Find existing user
  const existingUser = await User.findById(userId);
  if (!existingUser) {
    throw new Error("User not found");
  }

  // Store old values for audit log
  const oldValues = {
    firstName: existingUser.firstName,
    lastName: existingUser.lastName,
    ...(existingUser.email ? { email: existingUser.email?.toLowerCase()?.trim() } : {}),
    ...(existingUser.username ? { username: existingUser.username?.toLowerCase()?.trim() } : {}),
    phone: existingUser.phone,
    department: existingUser.department,
    position: existingUser.position,
    isActive: existingUser.isActive,
    primaryGodown: existingUser.primaryGodown,
    accessibleGodowns: existingUser.accessibleGodowns,
    address: existingUser.address,
    aadhaarNumber: existingUser.aadhaarNumber,
    panNumber: existingUser.panNumber,
  };

  // Remove sensitive fields that shouldn't be updated via this route
  delete updateData.password;
  delete updateData.loginAttempts;
  delete updateData.lockUntil;
  delete updateData.passwordResetToken;
  delete updateData.passwordResetExpires;

  // Validate role if provided
  if (updateData.roleId) {
    const role = await Role.findById(updateData.roleId);
    if (!role || !role.isActive) {
      throw new Error("Invalid or inactive role");
    }
    updateData.role = updateData.roleId;
    delete updateData.roleId;
  }

  // Normalize godown fields if provided
  if (updateData.primaryGodown === "") delete updateData.primaryGodown;
  if (
    updateData.accessibleGodowns &&
    !Array.isArray(updateData.accessibleGodowns)
  ) {
    updateData.accessibleGodowns = [updateData.accessibleGodowns].filter(
      Boolean
    );
  }

  if (updateData.profilePhoto) {
    const saved = await saveProfilePhoto(updateData.profilePhoto, existingUser.email, updateData.profilePhotoMimeType);
    updateData.profilePhoto = saved?.url || existingUser.profilePhoto;
  }

  if (updateData.address === null || updateData.address === "") {
    updateData.address = undefined;
  }

  updateData.address = normalizeAddress(updateData.address);
  updateData.aadhaarNumber = normalizeString(updateData.aadhaarNumber);
  updateData.panNumber = normalizeString(updateData.panNumber)?.toUpperCase();

  const updatedDocuments = [...(existingUser.documents || [])];

  if (Array.isArray(updateData.removeDocumentIds) && updateData.removeDocumentIds.length > 0) {
    updateData.removeDocumentIds.forEach((id) => {
      const index = updatedDocuments.findIndex((doc) => doc._id?.toString() === id);
      if (index !== -1) {
        updatedDocuments.splice(index, 1);
      }
    });
  }

  const newDocumentEntries = [];
  if (updateData.aadhaarDocument) {
    const entry = await buildDocumentEntry(updateData.aadhaarDocument);
    if (entry) {
      const existingIndex = updatedDocuments.findIndex((doc) => doc.type === "aadhaar");
      if (existingIndex !== -1) {
        updatedDocuments[existingIndex] = { ...updatedDocuments[existingIndex], ...entry };
      } else {
        newDocumentEntries.push({ ...entry, type: "aadhaar" });
      }
    }
  }

  if (updateData.panDocument) {
    const entry = await buildDocumentEntry(updateData.panDocument);
    if (entry) {
      const existingIndex = updatedDocuments.findIndex((doc) => doc.type === "pan");
      if (existingIndex !== -1) {
        updatedDocuments[existingIndex] = { ...updatedDocuments[existingIndex], ...entry };
      } else {
        newDocumentEntries.push({ ...entry, type: "pan" });
      }
    }
  }

  if (Array.isArray(updateData.otherDocumentsMeta) && updateData.otherDocumentsMeta.length) {
    updateData.otherDocumentsMeta.forEach((meta, index) => {
      if (meta?._id) {
        const docIndex = updatedDocuments.findIndex((doc) => doc._id?.toString() === meta._id);
        if (docIndex !== -1) {
          updatedDocuments[docIndex] = {
            ...updatedDocuments[docIndex],
            label: meta.label || updatedDocuments[docIndex].label,
            type: meta.type || updatedDocuments[docIndex].type,
          };
        }
      } else if (updateData.otherDocuments?.[index]) {
        updateData.otherDocuments[index] = {
          ...updateData.otherDocuments[index],
          label: meta.label || updateData.otherDocuments[index].originalname,
          type: meta.type || updateData.otherDocuments[index].type || "other",
        };
      }
    });
  }

  const otherDocumentsMeta = updateData.otherDocumentsMeta;
  delete updateData.otherDocumentsMeta;

  if (updateData.otherDocuments?.length) {
    for (let index = 0; index < updateData.otherDocuments.length; index++) {
      const documentPayload = updateData.otherDocuments[index];
      const meta = Array.isArray(otherDocumentsMeta) ? otherDocumentsMeta[index] : undefined;
      const payloadWithMeta = {
        ...documentPayload,
        label: meta?.label || documentPayload.originalname,
        type: meta?.type || documentPayload.type || "other",
      };
      const entry = await buildDocumentEntry(payloadWithMeta);
      if (entry) newDocumentEntries.push(entry);
    }
  }

  if (newDocumentEntries.length) {
    updatedDocuments.push(...newDocumentEntries);
  }

  updateData.documents = updatedDocuments;
  delete updateData.aadhaarDocument;
  delete updateData.panDocument;
  delete updateData.otherDocuments;
  delete updateData.removeDocumentIds;
  delete updateData.profilePhotoMimeType;

  // Add updatedBy field
  updateData.updatedBy = updatedBy;

  // Update user
  const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
    new: true,
    runValidators: true,
  })
    .populate("role", "name description")
    .select(
      "-password -passwordResetToken -passwordResetExpires -loginAttempts -lockUntil"
    );

  // Log user update
  await AuditLog.logAction({
    user: updatedBy,
    action: "UPDATE",
    module: "users",
    resourceType: "User",
    resourceId: userId,
    description: `Updated user: ${updatedUser.fullName} (${updatedUser.email})`,
    oldValues,
    newValues: {
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      email: updatedUser.email,
      phone: updatedUser.phone,
      department: updatedUser.department,
      position: updatedUser.position,
      isActive: updatedUser.isActive,
      address: updatedUser.address,
      aadhaarNumber: updatedUser.aadhaarNumber,
      panNumber: updatedUser.panNumber,
    },
  });

  return {
    success: true,
    message: "User updated successfully",
    data: { user: updatedUser },
  };
};

// Delete user (hard delete - permanent removal)
const deleteUser = async (userId, deletedBy) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  // Store user info for audit log before deletion
  const userInfo = {
    fullName: user.fullName,
    email: user.email,
    employeeId: user.employeeId,
    department: user.department,
    position: user.position
  };

  // Log user deletion before removing
  await AuditLog.logAction({
    user: deletedBy,
    action: "DELETE",
    module: "users",
    resourceType: "User",
    resourceId: userId,
    description: `Permanently deleted user: ${userInfo.fullName} (${userInfo.email})`,
    oldValues: userInfo,
    newValues: null,
  });

  // Hard delete - permanently remove from database
  await User.findByIdAndDelete(userId);

  // Also remove all related sessions
  await UserSession.deleteMany({ user: userId });

  return {
    success: true,
    message: "User permanently deleted successfully",
  };
};

// Deactivate user (soft delete - set isActive to false)
const deactivateUser = async (userId, deactivatedBy) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  user.isActive = false;
  user.updatedBy = deactivatedBy;
  await user.save();

  // Log user deactivation
  await AuditLog.logAction({
    user: deactivatedBy,
    action: "UPDATE",
    module: "users",
    resourceType: "User",
    resourceId: userId,
    description: `Deactivated user: ${user.fullName} (${user.email})`,
    oldValues: { isActive: true },
    newValues: { isActive: false },
  });

  return {
    success: true,
    message: "User deactivated successfully",
  };
};

// Reactivate user
const reactivateUser = async (userId, reactivatedBy) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  user.isActive = true;
  user.updatedBy = reactivatedBy;
  await user.save();

  // Log user reactivation
  await AuditLog.logAction({
    user: reactivatedBy,
    action: "UPDATE",
    module: "users",
    resourceType: "User",
    resourceId: userId,
    description: `Reactivated user: ${user.fullName} (${user.email})`,
    oldValues: { isActive: false },
    newValues: { isActive: true },
  });

  return {
    success: true,
    message: "User reactivated successfully",
  };
};

// Reset user password (admin function)
const resetUserPassword = async (userId, newPassword, adminUserId) => {
  // Find the user to update
  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  // Store old values for audit log
  const oldValues = {
    passwordLastChanged: user.passwordLastChanged,
  };

  // Update password
  user.password = newPassword;
  user.passwordLastChanged = new Date();
  user.updatedBy = adminUserId;
  await user.save();

  // End all active sessions for the user (force re-login)
  await UserSession.updateMany(
    {
      user: userId,
      isActive: true,
    },
    {
      isActive: false,
      logoutTime: new Date(),
      autoLogoutReason: "password_reset_by_admin",
    }
  );

  // Log password reset action
  await AuditLog.logAction({
    user: adminUserId,
    action: "UPDATE",
    module: "users",
    resourceType: "User",
    resourceId: userId,
    description: `Password reset for user: ${user.fullName} (${user.email})`,
    oldValues,
    newValues: {
      passwordLastChanged: user.passwordLastChanged,
    },
  });

  return {
    success: true,
    message: "Password reset successfully. User will need to login again.",
  };
};

// Get user audit trail
const getUserAuditTrail = async (userId, page = 1, limit = 20) => {
  // Check if user exists
  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  // Calculate skip value for pagination
  const skip = (page - 1) * limit;

  // Get audit trail for this user with pagination
  const result = await AuditLog.getUserActivityLog(userId, { limit, skip });

  return {
    success: true,
    message: "User audit trail retrieved successfully",
    data: {
      activities: result.logs,
      pagination: {
        currentPage: page,
        totalItems: result.total,
        itemsPerPage: limit,
        totalPages: Math.ceil(result.total / limit),
        hasMore: result.hasMore
      }
    }
  };
};

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  deactivateUser,
  reactivateUser,
  resetUserPassword,
  getUserAuditTrail,
};
