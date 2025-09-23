// Standard response helper functions
const sendSuccess = (res, data = null, message = 'Success', statusCode = 200) => {
  const response = {
    success: true,
    message
  };

  if (data !== null) {
    response.data = data;
  }

  return res.status(statusCode).json(response);
};

const sendError = (res, message = 'Something went wrong', statusCode = 500, errors = null) => {
  const response = {
    success: false,
    message
  };

  if (errors) {
    response.errors = errors;
  }

  return res.status(statusCode).json(response);
};

const sendCreated = (res, data, message = 'Created successfully') => {
  return sendSuccess(res, data, message, 201);
};

const sendNoContent = (res, message = 'No content') => {
  return res.status(204).json({
    success: true,
    message
  });
};

const sendPaginated = (res, data, pagination, message = 'Data retrieved successfully') => {
  return res.status(200).json({
    success: true,
    message,
    data,
    pagination
  });
};

module.exports = {
  sendSuccess,
  sendError,
  sendCreated,
  sendNoContent,
  sendPaginated
};
