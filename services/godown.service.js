const { Godown, AuditLog } = require('../models');

class GodownService {
  async createGodown(data, createdBy) {
    const { name, code, location, allowedProducts = [], managers = [] } = data || {};

    if (!name || !location?.city || !location?.state) {
      throw new Error('Name, city and state are required');
    }

    const godown = new Godown({
      name: name.trim(),
      code: code?.trim() || undefined,
      location: {
        city: location.city.trim(),
        state: location.state.trim(),
        area: location.area?.trim() || undefined
      },
      allowedProducts,
      managers,
      createdBy
    });

    await godown.save();

    await AuditLog.create({
      user: createdBy,
      action: 'CREATE',
      module: 'godowns',
      resourceType: 'Godown',
      resourceId: godown._id.toString(),
      newValues: godown.toObject(),
      description: `Created godown: ${godown.name}`
    });

    return { success: true, data: { godown } };
  }

  async getGodowns(query = {}, userId = null) {
    const { 
      search = '', 
      city = '', 
      state = '', 
      isActive = '',
      dateFrom = '',
      dateTo = ''
    } = query;
    const filter = {};
    
    // Apply search filter - search in name, code, city, state, and area
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { 'location.city': { $regex: search, $options: 'i' } },
        { 'location.state': { $regex: search, $options: 'i' } },
        { 'location.area': { $regex: search, $options: 'i' } }
      ];
    }
    
    // Apply location filters
    if (city) filter['location.city'] = { $regex: city, $options: 'i' };
    if (state) filter['location.state'] = state;
    if (isActive !== '') filter.isActive = isActive === 'true';
    
    // Date range filter for createdAt
    if (dateFrom || dateTo) {
      // Validate inputs
      let fromDate = null;
      let toDate = null;

      if (dateFrom) {
        const d = new Date(dateFrom);
        if (isNaN(d.getTime())) {
          const err = new Error('Invalid dateFrom format. Use YYYY-MM-DD.');
          err.status = 400;
          throw err;
        }
        // Normalize to start of day UTC
        fromDate = new Date(
          Date.UTC(
            d.getUTCFullYear(),
            d.getUTCMonth(),
            d.getUTCDate(),
            0,
            0,
            0,
            0
          )
        );
      }

      if (dateTo) {
        const d = new Date(dateTo);
        if (isNaN(d.getTime())) {
          const err = new Error('Invalid dateTo format. Use YYYY-MM-DD.');
          err.status = 400;
          throw err;
        }
        // Normalize to end of day UTC
        toDate = new Date(
          Date.UTC(
            d.getUTCFullYear(),
            d.getUTCMonth(),
            d.getUTCDate(),
            23,
            59,
            59,
            999
          )
        );
      }

      // Ensure dateFrom <= dateTo
      if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
        const err = new Error('dateFrom cannot be later than dateTo.');
        err.status = 400;
        throw err;
      }

      // Reasonable range: limit to 365 days
      if (fromDate && toDate) {
        const diffMs = toDate.getTime() - fromDate.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (diffDays > 365) {
          const err = new Error(
            'Date range too large. Please select up to 365 days.'
          );
          err.status = 400;
          throw err;
        }
      }

      // Prevent future dates for toDate
      const now = new Date();
      if (toDate && toDate.getTime() > now.getTime()) {
        toDate = now;
      }

      filter.createdAt = {};
      if (fromDate) filter.createdAt.$gte = fromDate;
      if (toDate) filter.createdAt.$lte = toDate;
    }

    // Apply user-specific godown access filtering
    if (userId) {
      const { User } = require('../models');
      const user = await User.findById(userId).select('primaryGodown accessibleGodowns').lean();
      
      if (user) {
        const allowedGodownIds = [];
        
        // Collect user's primary godown
        if (user.primaryGodown) {
          allowedGodownIds.push(user.primaryGodown);
        }
        
        // Collect user's accessible godowns
        if (user.accessibleGodowns && user.accessibleGodowns.length > 0) {
          allowedGodownIds.push(...user.accessibleGodowns);
        }
        
        // If user has specific godown assignments, restrict results to those godowns only
        if (allowedGodownIds.length > 0) {
          // Remove duplicates and convert to strings for consistent comparison
          const uniqueGodownIds = [...new Set(allowedGodownIds.map(id => id.toString()))];
          filter._id = { $in: uniqueGodownIds };
        }
        // If user has no godown assignments (primaryGodown and accessibleGodowns are empty),
        // return all godowns as fallback behavior
      }
    }

    const godowns = await Godown.find(filter).sort({ name: 1 }).lean();
    return { success: true, data: { godowns } };
  }

  async getGodownById(id) {
    const godown = await Godown.findById(id).lean();
    if (!godown) throw new Error('Godown not found');
    return { success: true, data: { godown } };
  }

  async updateGodown(id, updateData, updatedBy) {
    const godown = await Godown.findById(id);
    if (!godown) throw new Error('Godown not found');

    const oldValues = godown.toObject();
    Object.assign(godown, updateData, { updatedBy });
    await godown.save();

    await AuditLog.create({
      user: updatedBy,
      action: 'UPDATE',
      module: 'godowns',
      resourceType: 'Godown',
      resourceId: godown._id.toString(),
      oldValues,
      newValues: godown.toObject(),
      description: `Updated godown: ${godown.name}`
    });

    return { success: true, data: { godown } };
  }

  async deleteGodown(id, updatedBy) {
    const godown = await Godown.findById(id);
    if (!godown) throw new Error('Godown not found');
    const oldValues = godown.toObject();
    godown.isActive = false;
    godown.updatedBy = updatedBy;
    await godown.save();

    await AuditLog.create({
      user: updatedBy,
      action: 'DELETE',
      module: 'godowns',
      resourceType: 'Godown',
      resourceId: godown._id.toString(),
      oldValues,
      newValues: godown.toObject(),
      description: `Deactivated godown: ${godown.name}`
    });

    return { success: true, message: 'Godown deactivated successfully' };
  }
}

module.exports = new GodownService();


