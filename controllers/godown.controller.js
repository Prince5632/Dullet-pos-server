const godownService = require('../services/godown.service');

const createGodown = async (req, res) => {
  try {
    const result = await godownService.createGodown(req.body, req.user._id);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const getGodowns = async (req, res) => {
  try {
    const result = await godownService.getGodowns(req.query);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getGodownById = async (req, res) => {
  try {
    const result = await godownService.getGodownById(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
};

const updateGodown = async (req, res) => {
  try {
    const result = await godownService.updateGodown(req.params.id, req.body, req.user._id);
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const deleteGodown = async (req, res) => {
  try {
    const result = await godownService.deleteGodown(req.params.id, req.user._id);
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = {
  createGodown,
  getGodowns,
  getGodownById,
  updateGodown,
  deleteGodown
};


