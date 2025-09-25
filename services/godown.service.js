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

  async getGodowns(query = {}) {
    const { search = '', city = '', state = '', isActive = '' } = query;
    const filter = {};
    if (search) filter.name = { $regex: search, $options: 'i' };
    if (city) filter['location.city'] = city;
    if (state) filter['location.state'] = state;
    if (isActive !== '') filter.isActive = isActive === 'true';

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


