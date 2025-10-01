const { Attendance, User, Godown } = require('../models');

// Helper to safely get an id string from either a populated document or ObjectId
const getIdString = (maybeDocOrId) => {
  if (!maybeDocOrId) return null;
  if (typeof maybeDocOrId === 'string') return maybeDocOrId;
  if (maybeDocOrId._id) return String(maybeDocOrId._id);
  try { return String(maybeDocOrId); } catch { return null; }
};

class AttendanceService {
  // Get all attendance records with filtering and pagination
  async getAllAttendance(query, requestingUser) {
    const {
      page = 1,
      limit = 10,
      search,
      userId,
      godownId,
      status,
      startDate,
      endDate,
      sortBy = 'date',
      sortOrder = 'desc'
    } = query;

    const filters = {};
    
    // Role-based filtering
    if (!requestingUser.role.name.includes('Super Admin')) {
      if (requestingUser.role.name.includes('Admin')) {
        // Admin can see all attendance
      } else if (requestingUser.role.name.includes('Manager')) {
        // Manager can see attendance of users in their accessible godowns
        if (requestingUser.accessibleGodowns && requestingUser.accessibleGodowns.length > 0) {
          const userGodowns = requestingUser.accessibleGodowns.map(g => g._id || g);
          if (requestingUser.primaryGodown) {
            userGodowns.push(requestingUser.primaryGodown._id || requestingUser.primaryGodown);
          }
          
          // Get users from these godowns
          const godownUsers = await User.find({
            $or: [
              { primaryGodown: { $in: userGodowns } },
              { accessibleGodowns: { $in: userGodowns } }
            ]
          }).select('_id');
          
          filters.user = { $in: godownUsers.map(u => u._id) };
        } else {
          // If no godowns assigned, only see own attendance
          filters.user = requestingUser._id;
        }
      } else {
        // Sales Executive and Staff can only see their own attendance
        filters.user = requestingUser._id;
      }
    }

    // Apply additional filters
    if (userId) filters.user = userId;
    if (godownId) filters.godown = godownId;
    if (status) filters.status = status;
    
    if (startDate || endDate) {
      filters.date = {};
      if (startDate) filters.date.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filters.date.$lte = end;
      }
    }

    // Search functionality
    if (search) {
      const users = await User.find({
        $or: [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { employeeId: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');
      
      if (filters.user && filters.user.$in) {
        // Intersect with existing user filter
        const searchUserIds = users.map(u => u._id);
        const existingUserIds = filters.user.$in;
        filters.user.$in = existingUserIds.filter(id => 
          searchUserIds.some(searchId => searchId.equals(id))
        );
      } else if (!filters.user) {
        filters.user = { $in: users.map(u => u._id) };
      }
    }

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [attendance, total, stats] = await Promise.all([
      Attendance.find(filters)
        .populate('user', 'firstName lastName email employeeId profilePhoto')
        .populate('godown', 'name location')
        .populate('markedBy', 'firstName lastName')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      Attendance.countDocuments(filters),
      Attendance.aggregate([
        { $match: filters },
        {
          $group: {
            _id: null,
            totalPresent: {
              $sum: {
                $cond: [
                  { $in: ['$status', ['present', 'late', 'half_day']] },
                  1,
                  0
                ]
              }
            }
          }
        }
      ])
    ]);

    const presentDays = stats[0]?.totalPresent || 0;

    return {
      success: true,
      data: {
        attendance,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit) || 1,
          totalRecords: total,
          hasNext: page * limit < total,
          hasPrev: page > 1
        },
        summary: {
          totalAttendance: total,
          presentDays
        }
      }
    };
  }

  // Get attendance by ID
  async getAttendanceById(attendanceId, requestingUser) {
    const attendance = await Attendance.findById(attendanceId)
      .populate('user', 'firstName lastName email employeeId profilePhoto')
      .populate('godown', 'name location')
      .populate('markedBy', 'firstName lastName')
      .populate('createdBy', 'firstName lastName')
      .populate('updatedBy', 'firstName lastName');

    if (!attendance) {
      throw new Error('Attendance record not found');
    }

    // Check access permissions
    if (!this.canAccessAttendance(attendance, requestingUser)) {
      throw new Error('Access denied');
    }

    return {
      success: true,
      data: attendance
    };
  }

  // Mark attendance (check-in)
  async markAttendance(attendanceData, markedByUser) {
    const {
      userId,
      checkInImage,
      location,
      notes,
      isAutoMarked = false
    } = attendanceData;

    // Check if attendance already exists for today
    const existingAttendance = await Attendance.getTodaysAttendance(userId);
    if (existingAttendance) {
      throw new Error('Attendance already marked for today');
    }

    // Get user details
    const user = await User.findById(userId).populate('primaryGodown');
    if (!user) {
      throw new Error('User not found');
    }

    // Check permissions - user can mark their own, managers can mark for their team
    if (!this.canMarkAttendance(userId, markedByUser, user)) {
      throw new Error('Access denied: Cannot mark attendance for this user');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const newAttendance = new Attendance({
      user: userId,
      date: today,
      checkInTime: new Date(),
      checkInImage,
      checkInLocation: location,
      godown: user.primaryGodown?._id || null,
      notes,
      isAutoMarked,
      markedBy: markedByUser._id,
      createdBy: markedByUser._id,
      ipAddress: attendanceData.ipAddress,
      userAgent: attendanceData.userAgent
    });

    await newAttendance.save();

    // Populate and return
    await newAttendance.populate('user', 'firstName lastName email employeeId');
    await newAttendance.populate('godown', 'name location');
    await newAttendance.populate('markedBy', 'firstName lastName');

    return {
      success: true,
      message: 'Attendance marked successfully',
      data: newAttendance
    };
  }

  // Mark check-out
  async markCheckOut(attendanceId, checkOutData, updatedByUser) {
    const { checkOutImage, location } = checkOutData;

    const attendance = await Attendance.findById(attendanceId);
    if (!attendance) {
      throw new Error('Attendance record not found');
    }

    if (attendance.checkOutTime) {
      throw new Error('Already checked out for today');
    }

    // Check permissions
    if (!this.canUpdateAttendance(attendance, updatedByUser)) {
      throw new Error('Access denied: Cannot update this attendance record');
    }

    attendance.checkOutTime = new Date();
    attendance.checkOutImage = checkOutImage;
    attendance.checkOutLocation = location;
    attendance.updatedBy = updatedByUser._id;
    
    // Working hours and status will be calculated by pre-save middleware
    await attendance.save();

    await attendance.populate('user', 'firstName lastName email employeeId');
    await attendance.populate('godown', 'name location');
    await attendance.populate('markedBy', 'firstName lastName');

    return {
      success: true,
      message: 'Check-out marked successfully',
      data: attendance
    };
  }

  // Update attendance record
  async updateAttendance(attendanceId, updateData, updatedByUser) {
    const attendance = await Attendance.findById(attendanceId);
    if (!attendance) {
      throw new Error('Attendance record not found');
    }

    // Check permissions
    if (!this.canUpdateAttendance(attendance, updatedByUser)) {
      throw new Error('Access denied: Cannot update this attendance record');
    }

    // Update status if provided
    if (updateData.status && ['present', 'late', 'half_day', 'absent'].includes(updateData.status)) {
      // Prevent changing own attendance status regardless of role
      const attendanceUserId = getIdString(attendance.user);
      if (attendanceUserId && attendanceUserId === String(updatedByUser._id)) {
        throw new Error('You cannot change your own attendance status');
      }

      // Only Admin, Super Admin, or eligible Manager can change status
      const roleName = updatedByUser.role?.name || '';
      const isPrivileged = roleName.includes('Super Admin') || roleName.includes('Admin') || roleName.includes('Manager');
      if (!isPrivileged) {
        throw new Error('Access denied: Insufficient role to change attendance status');
      }
      attendance.status = updateData.status;
    }

    // Update notes if provided
    if (updateData.notes !== undefined) {
      attendance.notes = updateData.notes;
    }

    // Update check-in/out times (managers/admins only)
    const roleName = updatedByUser.role?.name || '';
    const canEditTimes = roleName.includes('Super Admin') || roleName.includes('Admin');
    if (updateData.checkInTime && canEditTimes) {
      const newCheckIn = new Date(updateData.checkInTime);
      if (Number.isNaN(newCheckIn.getTime())) {
        throw new Error('Invalid check-in time');
      }
      if (attendance.date && newCheckIn < new Date(attendance.date).setHours(0,0,0,0)) {
        throw new Error('Check-in time cannot be before attendance date');
      }
      if (attendance.checkOutTime && newCheckIn > attendance.checkOutTime) {
        throw new Error('Check-in time cannot be after existing check-out time');
      }
      attendance.checkInTime = newCheckIn;
    }

    if (updateData.checkOutTime && canEditTimes) {
      const newCheckOut = new Date(updateData.checkOutTime);
      if (Number.isNaN(newCheckOut.getTime())) {
        throw new Error('Invalid check-out time');
      }
      if (attendance.checkInTime && newCheckOut < attendance.checkInTime) {
        throw new Error('Check-out time cannot be before check-in time');
      }
      if (newCheckOut > new Date()) {
        throw new Error('Check-out time cannot be in the future');
      }
      attendance.checkOutTime = newCheckOut;
    }

    attendance.updatedBy = updatedByUser._id;
    await attendance.save();

    await attendance.populate('user', 'firstName lastName email employeeId');
    await attendance.populate('godown', 'name location');
    await attendance.populate('markedBy', 'firstName lastName');

    return {
      success: true,
      message: 'Attendance updated successfully',
      data: attendance
    };
  }

  // Delete attendance record
  async deleteAttendance(attendanceId, deletedByUser) {
    const attendance = await Attendance.findById(attendanceId);
    if (!attendance) {
      throw new Error('Attendance record not found');
    }

    // Only Super Admin and Admin can delete attendance
    if (!deletedByUser.role.name.includes('Super Admin') && !deletedByUser.role.name.includes('Admin')) {
      throw new Error('Access denied: Insufficient permissions to delete attendance');
    }

    await Attendance.findByIdAndDelete(attendanceId);

    return {
      success: true,
      message: 'Attendance record deleted successfully'
    };
  }

  // Get attendance statistics
  async getAttendanceStats(query, requestingUser) {
    const { startDate, endDate, godownId } = query;
    
    const filters = {};
    
    // Apply role-based filtering
    if (!requestingUser.role.name.includes('Super Admin')) {
      if (requestingUser.role.name.includes('Admin')) {
        // Admin can see all stats
      } else if (requestingUser.role.name.includes('Manager')) {
        // Manager stats for their godowns
        if (requestingUser.accessibleGodowns && requestingUser.accessibleGodowns.length > 0) {
          const userGodowns = requestingUser.accessibleGodowns.map(g => g._id || g);
          if (requestingUser.primaryGodown) {
            userGodowns.push(requestingUser.primaryGodown._id || requestingUser.primaryGodown);
          }
          filters.godown = { $in: userGodowns };
        }
      } else {
        // Sales Executive and Staff - only their own stats
        filters.user = requestingUser._id;
      }
    }

    if (godownId) filters.godown = godownId;
    
    if (startDate || endDate) {
      filters.date = {};
      if (startDate) filters.date.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filters.date.$lte = end;
      }
    }

    const [
      totalAttendance,
      presentCount,
      lateCount,
      halfDayCount,
      absentCount,
      avgWorkingHours
    ] = await Promise.all([
      Attendance.countDocuments(filters),
      Attendance.countDocuments({ ...filters, status: 'present' }),
      Attendance.countDocuments({ ...filters, status: 'late' }),
      Attendance.countDocuments({ ...filters, status: 'half_day' }),
      Attendance.countDocuments({ ...filters, status: 'absent' }),
      Attendance.aggregate([
        { $match: { ...filters, workingHours: { $gt: 0 } } },
        { $group: { _id: null, avgHours: { $avg: '$workingHours' } } }
      ])
    ]);

    return {
      success: true,
      data: {
        totalAttendance,
        presentCount,
        lateCount,
        halfDayCount,
        absentCount,
        averageWorkingHours: avgWorkingHours[0]?.avgHours || 0,
        attendanceRate: totalAttendance > 0 ? ((presentCount + lateCount + halfDayCount) / totalAttendance) * 100 : 0
      }
    };
  }

  // Get today's attendance for a user
  async getTodaysAttendance(userId) {
    return await Attendance.getTodaysAttendance(userId);
  }

  // Helper methods for permission checking
  canAccessAttendance(attendance, user) {
    const roleName = user.role?.name || '';
    if (roleName.includes('Super Admin') || roleName.includes('Admin')) {
      return true;
    }
    
    if (roleName.includes('Manager')) {
      // Manager can access attendance of users in their godowns
      const userGodowns = (user.accessibleGodowns || []).map(g => getIdString(g)).filter(Boolean);
      const primary = getIdString(user.primaryGodown);
      if (primary) userGodowns.push(primary);

      const attendanceUserId = getIdString(attendance.user);
      const attendanceGodownId = getIdString(attendance.godown);
      return attendanceUserId === String(user._id) || (attendanceGodownId && userGodowns.includes(attendanceGodownId));
    }
    
    // Sales Executive and Staff can only access their own
    const attendanceUserId = getIdString(attendance.user);
    return attendanceUserId === String(user._id);
  }

  canMarkAttendance(targetUserId, markingUser, targetUserDoc) {
    const roleName = markingUser.role?.name || '';
    if (roleName.includes('Super Admin') || roleName.includes('Admin')) {
      return true;
    }
    
    if (roleName.includes('Manager')) {
      // Manager can mark for users in their godowns
      const target = targetUserDoc;
      if (!target) return false;
      const managerGodowns = (markingUser.accessibleGodowns || []).map(g => getIdString(g)).filter(Boolean);
      const primaryManager = getIdString(markingUser.primaryGodown);
      if (primaryManager) managerGodowns.push(primaryManager);

      const targetGodowns = (target.accessibleGodowns || []).map(g => getIdString(g)).filter(Boolean);
      const primaryTarget = getIdString(target.primaryGodown);
      if (primaryTarget) targetGodowns.push(primaryTarget);

      return targetGodowns.some(id => managerGodowns.includes(id));
    }
    
    // Users can mark their own attendance
    return String(targetUserId) === String(markingUser._id);
  }

  canUpdateAttendance(attendance, user) {
    const roleName = user.role?.name || '';
    if (roleName.includes('Super Admin') || roleName.includes('Admin')) {
      return true;
    }
    
    // Users can always update their own attendance (for checkout)
    const attendanceUserId = getIdString(attendance.user);
    if (attendanceUserId && attendanceUserId === String(user._id)) {
      return true;
    }
    
    if (roleName.includes('Manager')) {
      // Manager can update attendance of users in their godowns
      const userGodowns = (user.accessibleGodowns || []).map(g => getIdString(g)).filter(Boolean);
      const primary = getIdString(user.primaryGodown);
      if (primary) userGodowns.push(primary);
      const attendanceGodownId = getIdString(attendance.godown);
      return attendanceGodownId ? userGodowns.includes(attendanceGodownId) : false;
    }
    
    return false; // Other roles cannot update attendance records of others
  }
}

module.exports = new AttendanceService();
