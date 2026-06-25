const Joi = require('joi');
const { password, objectId, phone } = require('./custom.validation');

const getUsers = {
  query: Joi.object().keys({
    name: Joi.string(),
    role: Joi.string().valid('superAdmin', 'admin', 'partner'),
    status: Joi.string().valid('active', 'inactive'),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getUser = {
  params: Joi.object().keys({
    userId: Joi.string().custom(objectId).required(),
  }),
};

const createUser = {
  body: Joi.object().keys({
    name: Joi.string().required(),
    email: Joi.string().required().email(),
    role: Joi.string().valid('admin', 'partner').default('partner'),
    phone: Joi.string().custom(phone).allow('', null),
    department: Joi.string().allow('', null),
    location: Joi.string().allow('', null),
  }),
};

const updateUser = {
  params: Joi.object().keys({
    userId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      name: Joi.string(),
      email: Joi.string().email(),
      role: Joi.string().valid('admin', 'partner'),
      status: Joi.string().valid('active', 'inactive'),
      phone: Joi.string().custom(phone).allow('', null),
      department: Joi.string().allow('', null),
      location: Joi.string().allow('', null),
    })
    .min(1),
};

const deleteUser = {
  params: Joi.object().keys({
    userId: Joi.string().custom(objectId).required(),
  }),
};

const updateProfile = {
  body: Joi.object()
    .keys({
      name: Joi.string(),
      phone: Joi.string().custom(phone).allow('', null),
      department: Joi.string().allow('', null),
      location: Joi.string().allow('', null),
    })
    .min(1),
};

const changePassword = {
  body: Joi.object().keys({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().required().custom(password),
  }),
};

const grantCredits = {
  params: Joi.object().keys({
    userId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    amount: Joi.number().integer().min(1).required(),
    note: Joi.string().allow('', null),
  }),
};

module.exports = {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  updateProfile,
  changePassword,
  grantCredits,
};
